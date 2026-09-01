/**
 * @module
 * Product analytics — the port, and the registry of implementations behind it. Distinct from
 * metrics/tracing: this answers PRODUCT questions, not operational ones. Which implementation
 * answers is a deployment decision (`NODE_ANALYTICS_PROVIDER`); default `umami`, `posthog` for
 * identity-shaped funnels, `none` to collect nothing.
 *
 * See: docs/tools/analytics.md
 */

import { getActiveSpanContext } from '@infrastructure/observability/tracer';
import { environmentFlag } from '@infrastructure/runtime/environment';
import type { CallerContext } from '@infrastructure/http/request';
import { umamiAnalyticsProvider } from './umami';
import { posthogAnalyticsProvider } from './posthog';
import { noneAnalyticsProvider } from './none';

// ─── Event taxonomy ───────────────────────────────────────────────────────────

/**
 * Module name → that module's event names. Augmented per module (declaration merging), so this
 * stays empty here and `infrastructure` never imports from a module — see `modules/cart/analytics.ts`.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- a declaration-merging seam: each module augments this map with its own events
export interface AnalyticsEventMap {}

/**
 * Every name this build can emit — whatever the enabled modules declare.
 * Shared 1:1 with the frontend namespace: each event has exactly one emitter, enforced by
 * `tests/cross-cutting/analytics-events.test.ts`.
 */
export type AnalyticsEventName = AnalyticsEventMap[keyof AnalyticsEventMap];

// ─── Payload schema ───────────────────────────────────────────────────────────

/**
 * Core fields shared by every analytics event.
 * The last three are attribution: a server-side event has no browser behind it, so without the
 * caller's IP/user-agent forwarded on, everything collapses onto one "visitor". Optional because
 * a provider keyed on user id doesn't need them.
 */
export interface AnalyticsEvent {
    /** Authenticated user ID, or `anonymous`. PostHog's `distinct_id`; a property under Umami. */
    distinctId: string;
    /** Event name, from the declaring module's own catalogue. */
    event: AnalyticsEventName;
    /**
     * When the event happened, if that is not now. PostHog-only: Umami's `/api/send` declares no
     * timestamp field (checked against v2.14.0, the pinned image) and stamps ingest time, so an
     * event replayed by a backfill lands under the wrong date there.
     */
    timestamp?: Date;
    /** OTel trace ID for cross-signal correlation. */
    traceId?: string;
    /** Any domain-specific context. */
    properties?: Record<string, unknown>;
    /** Address of the client that caused this event, for visitor attribution. */
    clientIp?: string;
    /** User-agent of that client. Umami DISCARDS an event that arrives without one — see `umami.ts`. */
    userAgent?: string;
    /** Host the request was addressed to, so events can be split per deployment. */
    hostname?: string;
    /**
     * The caller's consent choice. Read here, not passed separately, so
     * `emitAnalyticsEvent`'s own gate can decide without every call site changing: each one
     * already spreads {@link buildAnalyticsBase}'s return into this object. STRIPPED before an
     * event reaches a provider — see `emitAnalyticsEvent`; `AnalyticsProvider.capture` never sees it.
     */
    analyticsConsent?: 'granted' | 'denied';
}

// ─── The port ────────────────────────────────────────────────────────────────

/** The seam an analytics backend plugs into. Three implementations ship; see the registry below. */
export interface AnalyticsProvider {
    /** Reported by `GET /observability/health` as `integrations.analytics`. */
    name: string;

    /**
     * Record one event. Fire-and-forget by contract: analytics must never delay or fail a user
     * request, so this returns nothing and an implementation that fails does so quietly.
     */
    capture(event: AnalyticsEvent): void;

    /**
     * Whether this provider has what it needs to deliver an event.
     * `capture` is fire-and-forget, so an unconfigured provider warns once then discards silently —
     * the most common analytics failure, and invisible outside the provider. `none` always
     * answers `true`.
     */
    configured(): boolean;

    /**
     * Flush anything buffered and release the client.
     *
     * Called last in the shutdown chain (`runtime/server-lifecycle`). A provider that batches
     * loses its buffer on every deploy without this.
     */
    shutdown(): Promise<void>;
}

// ─── Registry ────────────────────────────────────────────────────────────────

/** Every implementation this build knows. `none` is the spelling for "analytics off". */
const PROVIDERS: Record<string, AnalyticsProvider> = {
    umami: umamiAnalyticsProvider,
    posthog: posthogAnalyticsProvider,
    none: noneAnalyticsProvider
};

/** Memoised provider handle — see `resolveAnalyticsProvider`. */
let provider: AnalyticsProvider | undefined;

/**
 * The configured provider, memoised on first use. Lazy so tests can vary the env per case, and
 * so a typo'd `NODE_ANALYTICS_PROVIDER` throws loudly here rather than resolving to `undefined`
 * silently. Turning analytics off has its own spelling (`none`).
 *
 * @returns the implementation `NODE_ANALYTICS_PROVIDER` names (default `umami`)
 */
export const resolveAnalyticsProvider = (): AnalyticsProvider => {
    provider ??= PROVIDERS[process.env.NODE_ANALYTICS_PROVIDER ?? 'umami'];
    return provider;
};

/** Test seam, like the mailer's `resetTransporter`. */
export const resetAnalyticsProvider = (): void => {
    provider = undefined;
};

// ─── Emit helpers ────────────────────────────────────────────────────────────

/**
 * Build the fields every call site would otherwise repeat.
 * Typed as `Pick<...>` so it stays in lockstep with `AnalyticsEvent` — renaming a field there
 * breaks this signature at compile time instead of quietly producing a wrong shape.
 *
 * @param context - the caller context built once in the controller, see `callerContextOf`
 */
export const buildAnalyticsBase = (
    context: CallerContext
): Pick<
    AnalyticsEvent,
    'distinctId' | 'traceId' | 'clientIp' | 'userAgent' | 'hostname' | 'analyticsConsent'
> => ({
    // CAVEAT: unauthenticated traffic all collapses onto the literal 'anonymous' id, so
    // pre-login events cannot be told apart per visitor *by this field*. Under Umami the
    // IP + user-agent hash below still separates them; under PostHog they do not separate.
    distinctId: context.caller.id ?? 'anonymous',
    // Read from the ambient OTel context — no plumbing needed at the call site. Safe unlike a
    // "current request" accessor would be: OTel's context manager is built to survive exactly
    // the async hops a service-tier call adds, which is not true of an ad hoc ALS lookup.
    traceId: getActiveSpanContext().traceId,
    clientIp: context.ip,
    userAgent: context.userAgent,
    hostname: context.host,
    // Carried through so `emitAnalyticsEvent` can gate on it without every call site (this
    // function's ~20 callers) changing.
    analyticsConsent: context.analyticsConsent
});

/**
 * Whether a caller's consent is required before capturing them in full.
 * Defaults `true`: Art. 25(2) says the PRIVATE setting is the default one, so a boilerplate that
 * shipped the permissive default would ship it into every project built on it. A deployment that
 * has taken its own legal advice about server-side, non-cookie analytics can opt out.
 */
const requireAnalyticsConsent = (): boolean =>
    environmentFlag('NODE_ANALYTICS_REQUIRE_CONSENT', true);

/**
 * Send one product analytics event to the configured provider.
 *
 * Returns `void` (fire-and-forget): analytics must never delay or fail a user request, so there
 * is nothing to await and nothing to handle.
 *
 * The consent gate lives here, the one choke point every module's event already passes through —
 * `analyticsConsent` is destructured off and never reaches a provider.
 * `denied` drops the event outright; `granted` (or the gate turned off) captures it in full;
 * anything else — unset, or no account to ask (pre-login traffic with no header either) —
 * captures a COARSENED copy: no `clientIp`, `distinctId` forced to `'anonymous'`. Dropping it
 * entirely would lose aggregate counts a deployment may have a real reason to keep; keeping it
 * identified would be exactly the profile Art. 6/7 withheld consent for.
 */
export const emitAnalyticsEvent = (event: AnalyticsEvent): void => {
    const { analyticsConsent, ...capturable } = event;

    if (!requireAnalyticsConsent() || analyticsConsent === 'granted') {
        resolveAnalyticsProvider().capture(capturable);
        return;
    }

    if (analyticsConsent === 'denied') return;

    resolveAnalyticsProvider().capture({
        ...capturable,
        clientIp: undefined,
        distinctId: 'anonymous'
    });
};

/**
 * Flush pending events and release the provider's client on server stop.
 * Resolves as a no-op when no provider was ever resolved — a process that emitted nothing has
 * nothing to flush, and resolving one here just to shut it down would turn a typo'd
 * `NODE_ANALYTICS_PROVIDER` into a crash on the way out.
 */
export const shutdownAnalytics = (): Promise<void> => {
    if (!provider) return Promise.resolve();
    return provider.shutdown().then(() => {
        // Clear the handle so a restarted app (or a test) builds a fresh client rather than
        // reusing a shut-down one, whose `capture()` calls would silently do nothing.
        provider = undefined;
    });
};
