/**
 * Product analytics — the port, and the registry of implementations behind it.
 *
 * Distinct from metrics and tracing: this answers *product* questions ("how many users abandon
 * checkout?") rather than operational ones ("is p95 latency acceptable?").
 *
 * Twenty-one controllers call `emitAnalyticsEvent` and none of them knows where the event lands.
 * Which implementation answers is a deployment decision (`NODE_ANALYTICS_PROVIDER`), not a code
 * path — the same shape `NODE_PAYMENT_PROVIDER` uses in `@modules/payments/providers`, and for the
 * same reason: the boilerplate should not have to pick an analytics vendor on a project's behalf.
 *
 * The default is `umami`, because it is the one this repo's own compose stack starts. `posthog`
 * is a hosted alternative for projects that need identity-level funnels (see below), and `none`
 * is the honest choice for a deployment that collects nothing.
 *
 * ── Which one to pick ────────────────────────────────────────────────────────────────────────
 * Umami identifies a visitor by hashing IP + user-agent, not by user id, so "this *logged-in
 * user* did X then Y" is not a question it can answer — `distinctId` travels as an ordinary
 * event property (`user_id`) and is filterable, but it is not the join key. PostHog is built
 * around exactly that join and is the better answer when the funnel is identity-shaped; the cost
 * is a cloud dependency in an otherwise fully self-hosted estate.
 *
 * See: docs/tools/analytics.md
 */

import { getActiveSpanContext } from '@infrastructure/observability/tracer';
import { umamiAnalyticsProvider } from './umami';
import { posthogAnalyticsProvider } from './posthog';
import { noneAnalyticsProvider } from './none';

// ─── Event taxonomy ───────────────────────────────────────────────────────────

/**
 * Module name → that module's event names. Augmented per module; see `modules/cart/analytics.ts`.
 *
 * Intentionally empty here, exactly like `AuditActionMap` in `../audit.ts` and `DomainEventMap` in
 * `kernel/events.ts`: this is the extension point, and its members live with the domains that emit
 * them. The augmentation is type-only, so the vocabulary stays closed and `infrastructure` still
 * imports nothing from a module.
 *
 * `PRODUCTS_SEARCHED` is a fact about products and `CART_ITEM_ADDED` one about the cart. Both used
 * to be declared here, in the layer that must know no domain at all; now deleting a module takes
 * its names out of the funnel with it, and this file is left holding the transport.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- a declaration-merging seam: each module augments this map with its own events
export interface AnalyticsEventMap {}

/**
 * Every name this build can emit — whatever the enabled modules declare.
 *
 * The union is exactly the SERVER's half of one namespace shared with the paired frontend. The
 * client's half is declared in `shared/contracts/analytics.frontend.ts` and deliberately augments
 * nothing here, so `emitAnalyticsEvent` rejects a client name: this service cannot report a moment
 * it never observed, and no event can be written into Umami twice.
 */
export type AnalyticsEventName = AnalyticsEventMap[keyof AnalyticsEventMap];

// ─── Payload schema ───────────────────────────────────────────────────────────

/**
 * Core fields shared by every analytics event.
 *
 * The last three are attribution, and they exist because a server-side event has no browser
 * behind it: without the caller's address and user-agent forwarded on, every event the API emits
 * would be attributed to the API itself, collapsing an entire product's traffic onto one
 * "visitor". They are optional because a provider keyed on user id has no use for them.
 */
export interface AnalyticsEvent {
    /** Authenticated user ID, or `anonymous`. PostHog's `distinct_id`; a property under Umami. */
    distinctId: string;
    /** Event name, from the declaring module's own catalogue. */
    event: AnalyticsEventName;
    /** ISO-8601 timestamp; defaults to now if omitted. */
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
     * Flush anything buffered and release the client.
     *
     * Called last in the shutdown chain (`runtime/server-lifecycle`). A provider that batches
     * loses its buffer on every deploy without this.
     */
    shutdown(): Promise<void>;
}

// ─── Registry ────────────────────────────────────────────────────────────────

/** Every implementation this build knows. A typo'd env value must fail loudly, not fall back. */
const PROVIDERS: Record<string, AnalyticsProvider> = {
    umami: umamiAnalyticsProvider,
    posthog: posthogAnalyticsProvider,
    none: noneAnalyticsProvider
};

let provider: AnalyticsProvider | undefined;

/**
 * The configured provider, memoised on first use.
 *
 * Read lazily rather than at import time because tests vary the environment per case, and
 * because an env var read during module evaluation is fixed before `.env` has necessarily
 * been loaded.
 *
 * @returns the implementation `NODE_ANALYTICS_PROVIDER` names (default `umami`)
 * @throws when the env names a provider this build does not carry — a deployment
 *   misconfiguration that must surface at boot, not as analytics that silently record nothing
 */
export const resolveAnalyticsProvider = (): AnalyticsProvider => {
    if (provider) return provider;
    const name = process.env.NODE_ANALYTICS_PROVIDER ?? 'umami';
    const resolved = PROVIDERS[name] as (typeof PROVIDERS)[string] | undefined;
    if (!resolved)
        throw new Error(
            `Unknown analytics provider "${name}" — known: ${Object.keys(PROVIDERS).join(', ')}`
        );
    provider = resolved;
    return provider;
};

/** Test seam, like `resetPaymentProvider`. */
export const resetAnalyticsProvider = (): void => {
    provider = undefined;
};

// ─── Emit helpers ────────────────────────────────────────────────────────────

/**
 * Build the fields every call site would otherwise repeat.
 *
 * Typed as `Pick<...>` so it stays in lockstep with `AnalyticsEvent`: renaming a field there
 * breaks this signature at compile time instead of silently producing a wrong shape.
 * Usage: `emitAnalyticsEvent({ ...buildAnalyticsBase(request), event: cartAnalyticsEvents.CART_VIEWED })`
 *
 * @param request - the express request the event happened during
 */
export const buildAnalyticsBase = (request: {
    authContext?: { id?: string } | null;
    ip?: string;
    headers?: { 'user-agent'?: string; host?: string };
}): Pick<AnalyticsEvent, 'distinctId' | 'traceId' | 'clientIp' | 'userAgent' | 'hostname'> => ({
    // CAVEAT: unauthenticated traffic all collapses onto the literal 'anonymous' id, so
    // pre-login events cannot be told apart per visitor *by this field*. Under Umami the
    // IP + user-agent hash below still separates them; under PostHog they do not separate.
    distinctId: request.authContext?.id ?? 'anonymous',
    // Read from the ambient OTel context — no plumbing needed at the call site.
    traceId: getActiveSpanContext().traceId,
    clientIp: request.ip,
    userAgent: request.headers?.['user-agent'],
    hostname: request.headers?.host
});

/**
 * Send one product analytics event to the configured provider.
 *
 * Returns `void` (fire-and-forget): analytics must never delay or fail a user request, so there
 * is nothing to await and nothing to handle.
 */
export const emitAnalyticsEvent = (event: AnalyticsEvent): void => {
    resolveAnalyticsProvider().capture(event);
};

/**
 * Flush pending events and release the provider's client on server stop.
 *
 * Resolves without doing anything when no provider was ever resolved — a process that emitted
 * no events has nothing to flush, and resolving one here purely to shut it down would turn a
 * misconfigured `NODE_ANALYTICS_PROVIDER` into a crash on the way out.
 */
export const shutdownAnalytics = (): Promise<void> => {
    if (!provider) return Promise.resolve();
    return provider.shutdown().then(() => {
        // Clear the handle so a restarted app (or a test) builds a fresh client rather than
        // reusing a shut-down one, whose `capture()` calls would silently do nothing.
        provider = undefined;
    });
};
