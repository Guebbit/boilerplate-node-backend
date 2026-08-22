/**
 * `src/infrastructure/observability/analytics/` — the provider port and its three implementations.
 *
 * Twenty-one controllers emit through this module and none of them can tell whether the event
 * arrived, because the contract is fire-and-forget by design. That makes every failure here
 * silent by construction, and it is why the cases below assert on the wire payload rather than on
 * a return value: what a provider *sends* is the only observable it has.
 *
 * The Umami cases in particular encode a behaviour discovered against a live umami 2.14 and
 * invisible from its API: an event posted without a `User-Agent` header is discarded, and the
 * response is still `200`. Nothing about that is guessable from the code, so it is pinned here.
 */
import {
    resolveAnalyticsProvider,
    resetAnalyticsProvider,
    emitAnalyticsEvent,
    buildAnalyticsBase,
    shutdownAnalytics,
    type AnalyticsEvent
} from '@infrastructure/observability/analytics';
// A real name rather than a string literal: the transport is what is under test here, but the
// event it carries should still be one the app can actually emit.
import { accountAnalyticsEvents } from '@modules/account/analytics';
import { productsAnalyticsEvents } from '@modules/products/analytics';
import { cartAnalyticsEvents } from '@modules/cart/analytics';
import { ordersAnalyticsEvents } from '@modules/orders/analytics';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockCapture = jest.fn();
const mockShutdown = jest.fn().mockResolvedValue(void 0);

jest.mock('posthog-node', () => ({
    PostHog: jest.fn().mockImplementation(() => ({
        capture: mockCapture,
        shutdown: mockShutdown
    }))
}));

const mockLoggerWarn = jest.fn();
const mockLoggerDebug = jest.fn();

jest.mock('@infrastructure/adapters/logger', () => ({
    logger: {
        warn: (...args: unknown[]) => mockLoggerWarn(...args),
        debug: (...args: unknown[]) => mockLoggerDebug(...args),
        info: jest.fn(),
        error: jest.fn()
    }
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- the mocked class is reached through jest's module registry, not an import
const { PostHog: mockedPostHog } = require('posthog-node') as {
    PostHog: jest.MockedClass<new (...args: unknown[]) => unknown>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Umami settings that make the provider send rather than warn. */
const configureUmami = () => {
    process.env.NODE_ANALYTICS_PROVIDER = 'umami';
    process.env.NODE_UMAMI_INGEST_HOST = 'http://umami:3000';
    process.env.NODE_UMAMI_WEBSITE_ID = 'site-uuid';
};

const configurePostHog = () => {
    process.env.NODE_ANALYTICS_PROVIDER = 'posthog';
    process.env.NODE_POSTHOG_API_KEY = 'phc_test_key';
    process.env.NODE_POSTHOG_HOST = 'https://app.posthog.com';
};

const clearAnalyticsEnvironment = () => {
    delete process.env.NODE_ANALYTICS_PROVIDER;
    delete process.env.NODE_UMAMI_INGEST_HOST;
    delete process.env.NODE_UMAMI_HOST;
    delete process.env.NODE_UMAMI_WEBSITE_ID;
    delete process.env.NODE_POSTHOG_API_KEY;
    delete process.env.NODE_POSTHOG_HOST;
};

/**
 * Let the fire-and-forget `fetch` chain settle.
 *
 * `capture()` returns before its request does — deliberately — so an assertion made on the same
 * tick would run before the provider's own `.then` had a chance to.
 */
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** The single `fetch` call the Umami provider made, decoded. */
const sentRequest = (): { url: string; headers: Record<string, string>; body: JsonPayload } => {
    const [url, init] = (globalThis.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    return {
        url,
        headers: init.headers as Record<string, string>,
        body: JSON.parse(init.body as string) as JsonPayload
    };
};

interface JsonPayload {
    type: string;
    payload: {
        website: string;
        hostname?: string;
        url: string;
        name: string;
        data: Record<string, unknown>;
    };
}

beforeEach(() => {
    resetAnalyticsProvider();
    clearAnalyticsEnvironment();
    jest.clearAllMocks();
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
});

// ─── Provider selection ───────────────────────────────────────────────────────

describe('resolveAnalyticsProvider', () => {
    it('defaults to umami — the backend the compose stack already starts', () => {
        expect(resolveAnalyticsProvider().name).toBe('umami');
    });

    it.each([
        ['umami', 'umami'],
        ['posthog', 'posthog'],
        ['none', 'none']
    ])('selects %s when NODE_ANALYTICS_PROVIDER names it', (configured, expected) => {
        process.env.NODE_ANALYTICS_PROVIDER = configured;

        expect(resolveAnalyticsProvider().name).toBe(expected);
    });

    it('throws on a name this build does not carry, rather than falling back', () => {
        // A silent fallback would mean a typo'd deployment records events into the wrong
        // system — or nothing at all — and looks healthy while doing it.
        process.env.NODE_ANALYTICS_PROVIDER = 'mixpanel';

        expect(() => resolveAnalyticsProvider()).toThrow(/Unknown analytics provider "mixpanel"/);
    });

    it('names the providers it does carry in that error, so the fix is in the message', () => {
        process.env.NODE_ANALYTICS_PROVIDER = 'typo';

        expect(() => resolveAnalyticsProvider()).toThrow(/umami, posthog, none/);
    });

    it('memoises, so the environment cannot change under a running process', () => {
        expect(resolveAnalyticsProvider().name).toBe('umami');
        process.env.NODE_ANALYTICS_PROVIDER = 'none';

        expect(resolveAnalyticsProvider().name).toBe('umami');
    });

    it('re-reads the environment after a reset', () => {
        resolveAnalyticsProvider();
        process.env.NODE_ANALYTICS_PROVIDER = 'none';
        resetAnalyticsProvider();

        expect(resolveAnalyticsProvider().name).toBe('none');
    });
});

// ─── Umami provider ───────────────────────────────────────────────────────────

describe('the umami provider', () => {
    it('posts the event to the ingest host', () => {
        configureUmami();
        emitAnalyticsEvent({ distinctId: 'u1', event: productsAnalyticsEvents.PRODUCT_VIEWED });

        expect(sentRequest().url).toBe('http://umami:3000/api/send');
    });

    it('tolerates a trailing slash on the host, because someone will paste one', () => {
        configureUmami();
        process.env.NODE_UMAMI_INGEST_HOST = 'http://umami:3000/';
        emitAnalyticsEvent({ distinctId: 'u1', event: productsAnalyticsEvents.PRODUCT_VIEWED });

        expect(sentRequest().url).toBe('http://umami:3000/api/send');
    });

    it('falls back to the public host when no ingest host is set', () => {
        // Correct only where the API and the browser reach Umami at the same address, which is
        // why it is a fallback rather than the setting.
        process.env.NODE_ANALYTICS_PROVIDER = 'umami';
        process.env.NODE_UMAMI_HOST = 'https://analytics.example.com';
        process.env.NODE_UMAMI_WEBSITE_ID = 'site-uuid';
        emitAnalyticsEvent({ distinctId: 'u1', event: productsAnalyticsEvents.PRODUCT_VIEWED });

        expect(sentRequest().url).toBe('https://analytics.example.com/api/send');
    });

    it('sends the website id and the event name', () => {
        configureUmami();
        emitAnalyticsEvent({ distinctId: 'u1', event: cartAnalyticsEvents.CART_ITEM_ADDED });

        const { body } = sentRequest();
        expect(body.type).toBe('event');
        expect(body.payload.website).toBe('site-uuid');
        expect(body.payload.name).toBe('cart_item_added');
    });

    it('ALWAYS sends a User-Agent, because Umami discards the event without one and still says 200', () => {
        configureUmami();
        emitAnalyticsEvent({ distinctId: 'u1', event: ordersAnalyticsEvents.ORDER_CREATED });

        expect(sentRequest().headers['User-Agent']).toBeTruthy();
    });

    it("forwards the caller's user-agent so the event attributes to their visitor", () => {
        configureUmami();
        emitAnalyticsEvent({
            distinctId: 'u1',
            event: ordersAnalyticsEvents.ORDER_CREATED,
            userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/131.0.0.0'
        });

        expect(sentRequest().headers['User-Agent']).toBe(
            'Mozilla/5.0 (X11; Linux x86_64) Chrome/131.0.0.0'
        );
    });

    it("forwards the caller's address, which is half of Umami's visitor hash", () => {
        configureUmami();
        emitAnalyticsEvent({
            distinctId: 'u1',
            event: ordersAnalyticsEvents.ORDER_CREATED,
            clientIp: '203.0.113.9'
        });

        expect(sentRequest().headers['X-Forwarded-For']).toBe('203.0.113.9');
    });

    it('omits X-Forwarded-For entirely when there is no client address', () => {
        // Sending the header empty would have Umami hash an empty address as if it were one.
        configureUmami();
        emitAnalyticsEvent({ distinctId: 'u1', event: ordersAnalyticsEvents.ORDER_CREATED });

        expect('X-Forwarded-For' in sentRequest().headers).toBe(false);
    });

    it('carries distinctId as a queryable `user_id`, the only place a user id can live here', () => {
        configureUmami();
        emitAnalyticsEvent({
            distinctId: 'user-42',
            event: cartAnalyticsEvents.CHECKOUT_COMPLETED
        });

        expect(sentRequest().body.payload.data.user_id).toBe('user-42');
    });

    it('carries the trace id, and omits the key entirely when untraced', () => {
        configureUmami();
        emitAnalyticsEvent({
            distinctId: 'u1',
            event: cartAnalyticsEvents.CHECKOUT_COMPLETED,
            traceId: 'abc123'
        });
        expect(sentRequest().body.payload.data.trace_id).toBe('abc123');

        jest.clearAllMocks();
        emitAnalyticsEvent({ distinctId: 'u1', event: cartAnalyticsEvents.CHECKOUT_COMPLETED });
        expect('trace_id' in sentRequest().body.payload.data).toBe(false);
    });

    it('keeps caller properties, and does not let one of them overwrite user_id', () => {
        configureUmami();
        emitAnalyticsEvent({
            distinctId: 'real-user',
            event: cartAnalyticsEvents.CART_ITEM_ADDED,
            properties: { product_id: 'prod-7', user_id: 'spoofed' }
        });

        const { data } = sentRequest().body.payload;
        expect(data.product_id).toBe('prod-7');
        expect(data.user_id).toBe('real-user');
    });

    it('strips the port from the hostname, which Umami rejects with a 400', () => {
        // `Host` carries a port on every non-default port, so `localhost:3000` — the entire
        // local development case — was refused outright until this was stripped.
        configureUmami();
        emitAnalyticsEvent({
            distinctId: 'u1',
            event: productsAnalyticsEvents.PRODUCT_VIEWED,
            hostname: 'localhost:3000'
        });

        expect(sentRequest().body.payload.hostname).toBe('localhost');
    });

    it('leaves a bracketed IPv6 host intact, port or no port', () => {
        configureUmami();
        emitAnalyticsEvent({
            distinctId: 'u1',
            event: productsAnalyticsEvents.PRODUCT_VIEWED,
            hostname: '[::1]:3000'
        });
        expect(sentRequest().body.payload.hostname).toBe('[::1]');

        jest.clearAllMocks();
        emitAnalyticsEvent({
            distinctId: 'u1',
            event: productsAnalyticsEvents.PRODUCT_VIEWED,
            hostname: '[::1]'
        });
        expect(sentRequest().body.payload.hostname).toBe('[::1]');
    });

    it('sends nothing, and warns once, when the website id is missing', () => {
        process.env.NODE_ANALYTICS_PROVIDER = 'umami';
        process.env.NODE_UMAMI_INGEST_HOST = 'http://umami:3000';

        emitAnalyticsEvent({ distinctId: 'u1', event: productsAnalyticsEvents.PRODUCT_VIEWED });
        emitAnalyticsEvent({ distinctId: 'u1', event: productsAnalyticsEvents.PRODUCT_VIEWED });

        expect(globalThis.fetch).not.toHaveBeenCalled();
        // Once, not twice: a misconfigured provider would otherwise fill the log with itself.
        expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
    });

    it('warns when Umami rejects the event, because every later one fails the same way', () => {
        configureUmami();
        (globalThis.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 404 });
        emitAnalyticsEvent({ distinctId: 'u1', event: productsAnalyticsEvents.PRODUCT_VIEWED });

        return settle().then(() => {
            expect(mockLoggerWarn).toHaveBeenCalledWith(
                expect.objectContaining({ status: 404, event: 'product_viewed' })
            );
        });
    });

    it('swallows a transport failure rather than rejecting into the request that caused it', () => {
        configureUmami();
        (globalThis.fetch as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));

        expect(() =>
            emitAnalyticsEvent({ distinctId: 'u1', event: productsAnalyticsEvents.PRODUCT_VIEWED })
        ).not.toThrow();

        return settle().then(() => {
            // Debug, not warn: a developer running without the analytics container up would
            // otherwise get one warning per request.
            expect(mockLoggerDebug).toHaveBeenCalled();
            expect(mockLoggerWarn).not.toHaveBeenCalled();
        });
    });
});

// ─── PostHog provider ─────────────────────────────────────────────────────────

describe('the posthog provider', () => {
    it('instantiates the client once and reuses it', () => {
        configurePostHog();
        emitAnalyticsEvent({ distinctId: 'u1', event: accountAnalyticsEvents.USER_LOGGED_IN });
        emitAnalyticsEvent({ distinctId: 'u1', event: productsAnalyticsEvents.PRODUCT_VIEWED });

        expect(mockedPostHog).toHaveBeenCalledTimes(1);
        expect(mockedPostHog).toHaveBeenCalledWith(
            'phc_test_key',
            expect.objectContaining({ host: 'https://app.posthog.com' })
        );
    });

    it('captures the event with its distinctId and properties', () => {
        configurePostHog();
        const event: AnalyticsEvent = {
            distinctId: 'user-42',
            event: cartAnalyticsEvents.CART_ITEM_ADDED,
            properties: { product_id: 'prod-7', quantity: 2 }
        };
        emitAnalyticsEvent(event);

        expect(mockCapture).toHaveBeenCalledWith(
            expect.objectContaining({
                distinctId: 'user-42',
                event: 'cart_item_added',
                properties: expect.objectContaining({ product_id: 'prod-7', quantity: 2 })
            })
        );
    });

    it('includes trace_id when traced, and omits the key when not', () => {
        configurePostHog();
        emitAnalyticsEvent({
            distinctId: 'u1',
            event: cartAnalyticsEvents.CHECKOUT_COMPLETED,
            traceId: 'abc123'
        });
        const traced = mockCapture.mock.calls[0][0] as { properties: Record<string, unknown> };
        expect(traced.properties.trace_id).toBe('abc123');

        mockCapture.mockClear();
        emitAnalyticsEvent({ distinctId: 'u1', event: productsAnalyticsEvents.PRODUCT_VIEWED });
        const untraced = mockCapture.mock.calls[0][0] as { properties: Record<string, unknown> };
        expect('trace_id' in untraced.properties).toBe(false);
    });

    it('sends nothing, and warns once, when the credentials are missing', () => {
        process.env.NODE_ANALYTICS_PROVIDER = 'posthog';

        emitAnalyticsEvent({ distinctId: 'u1', event: accountAnalyticsEvents.USER_LOGGED_IN });
        emitAnalyticsEvent({ distinctId: 'u1', event: accountAnalyticsEvents.USER_LOGGED_IN });

        expect(mockedPostHog).not.toHaveBeenCalled();
        expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
    });
});

// ─── The `none` provider ──────────────────────────────────────────────────────

describe('the none provider', () => {
    it('reaches no backend at all, and says nothing about it', () => {
        process.env.NODE_ANALYTICS_PROVIDER = 'none';
        // Configured credentials must not tempt it: `none` is a stated choice, not a fallback.
        process.env.NODE_UMAMI_INGEST_HOST = 'http://umami:3000';
        process.env.NODE_UMAMI_WEBSITE_ID = 'site-uuid';

        emitAnalyticsEvent({ distinctId: 'u1', event: accountAnalyticsEvents.USER_LOGGED_IN });

        expect(globalThis.fetch).not.toHaveBeenCalled();
        expect(mockedPostHog).not.toHaveBeenCalled();
        expect(mockLoggerWarn).not.toHaveBeenCalled();
    });

    /**
     * The half of `none` that only runs at shutdown, and the reason it is worth a test of its own:
     * `stopServices` awaits `shutdownAnalytics()`, so a provider whose `shutdown()` rejected — or
     * returned something unawaitable — would hang or crash a process on its way out, in the one
     * code path no request ever exercises.
     */
    it('shuts down cleanly, so selecting it cannot break process exit', () => {
        process.env.NODE_ANALYTICS_PROVIDER = 'none';
        emitAnalyticsEvent({ distinctId: 'u1', event: accountAnalyticsEvents.USER_LOGGED_IN });

        return expect(shutdownAnalytics()).resolves.toBeUndefined();
    });
});

// ─── Shutdown ─────────────────────────────────────────────────────────────────

describe('shutdownAnalytics', () => {
    it('flushes a PostHog client that buffered events', () => {
        configurePostHog();
        emitAnalyticsEvent({ distinctId: 'u1', event: accountAnalyticsEvents.USER_SIGNED_UP });

        return shutdownAnalytics().then(() => {
            expect(mockShutdown).toHaveBeenCalledTimes(1);
        });
    });

    it('resolves without resolving a provider when none was ever used', () => {
        // Otherwise a misconfigured NODE_ANALYTICS_PROVIDER would throw on the way OUT of a
        // process that never emitted an event, turning a config typo into a crashing shutdown.
        process.env.NODE_ANALYTICS_PROVIDER = 'nonsense';

        return expect(shutdownAnalytics()).resolves.toBeUndefined();
    });
});

// ─── buildAnalyticsBase ───────────────────────────────────────────────────────

describe('buildAnalyticsBase', () => {
    it('lifts the attribution a server-side event has no other way to carry', () => {
        const base = buildAnalyticsBase({
            authContext: { id: 'user-9' },
            ip: '198.51.100.4',
            headers: { 'user-agent': 'Chrome/131', host: 'api.example.com' }
        });

        expect(base).toMatchObject({
            distinctId: 'user-9',
            clientIp: '198.51.100.4',
            userAgent: 'Chrome/131',
            hostname: 'api.example.com'
        });
    });

    it("falls back to 'anonymous' for unauthenticated traffic", () => {
        expect(buildAnalyticsBase({}).distinctId).toBe('anonymous');
        expect(buildAnalyticsBase({ authContext: null }).distinctId).toBe('anonymous');
    });

    it('leaves attribution undefined rather than inventing it', () => {
        const base = buildAnalyticsBase({ authContext: { id: 'u1' } });

        expect(base.clientIp).toBeUndefined();
        expect(base.userAgent).toBeUndefined();
    });
});

// The CATALOGUE itself is not asserted here. Each module owns its names in
// `src/modules/<name>/analytics.ts`, and `tests/cross-cutting/contract-bundles.test.ts` checks
// that the published frontend catalogue lists none of what those modules declare. This file
// owns the transport.
