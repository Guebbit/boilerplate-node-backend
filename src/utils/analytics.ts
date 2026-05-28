import { PostHog } from 'posthog-node';

// ─── Configuration helpers ────────────────────────────────────────────────────

/** Returns true only when both API key and host are set in the environment. */
export const isPostHogEnabled = (): boolean =>
    Boolean(process.env.NODE_POSTHOG_API_KEY && process.env.NODE_POSTHOG_HOST);

// Lazily created so the client is never instantiated when analytics are disabled.
let _client: PostHog | undefined;

/** Returns the shared PostHog client, creating it on first call. */
const getClient = (): PostHog => {
    if (!_client) {
        _client = new PostHog(process.env.NODE_POSTHOG_API_KEY!, {
            host: process.env.NODE_POSTHOG_HOST,
            // Disable auto-flush; we flush manually on shutdown.
            flushAt: 20,
            flushInterval: 10_000
        });
    }
    return _client;
};

/** Flush pending events and shut down the PostHog client on server stop. */
export const shutdownAnalytics = async (): Promise<void> => {
    if (_client) {
        await _client.shutdown();
        _client = undefined;
    }
};

// ─── Event taxonomy ───────────────────────────────────────────────────────────
// See docs/guide/product-analytics.md for the full event catalog.

export enum AnalyticsEvent {
    // Auth / onboarding
    USER_SIGNED_UP = 'user_signed_up',
    USER_LOGGED_IN = 'user_logged_in',
    USER_PROFILE_VIEWED = 'user_profile_viewed',

    // Product discovery
    PRODUCTS_SEARCHED = 'products_searched',
    PRODUCT_VIEWED = 'product_viewed',

    // Cart
    CART_VIEWED = 'cart_viewed',
    CART_ITEM_ADDED = 'cart_item_added',
    CART_ITEM_UPDATED = 'cart_item_updated',
    CART_ITEM_REMOVED = 'cart_item_removed',
    CART_CLEARED = 'cart_cleared',

    // Checkout / orders
    CHECKOUT_COMPLETED = 'checkout_completed',
    CHECKOUT_FAILED = 'checkout_failed',
    ORDER_CREATED = 'order_created',
    ORDERS_VIEWED = 'orders_viewed'
}

// ─── Payload schema ───────────────────────────────────────────────────────────

/** Core fields shared by every analytics event. */
export interface IAnalyticsEvent {
    /** PostHog distinct_id: authenticated user ID or a session/anonymous ID. */
    distinctId: string;
    /** Event name from AnalyticsEvent enum. */
    event: AnalyticsEvent;
    /** ISO-8601 timestamp; defaults to now if omitted. */
    timestamp?: Date;
    /** OTel trace ID for cross-signal correlation. */
    traceId?: string;
    /** Any domain-specific context. */
    properties?: Record<string, unknown>;
}

// ─── Emit helper ─────────────────────────────────────────────────────────────

/**
 * Send one product analytics event to PostHog.
 * Silently does nothing when PostHog is not configured — no breaking change.
 */
export const emitAnalyticsEvent = (event: IAnalyticsEvent): void => {
    if (!isPostHogEnabled()) return;

    getClient().capture({
        distinctId: event.distinctId,
        event: event.event,
        timestamp: event.timestamp,
        properties: {
            ...event.properties,
            // Attach OTel trace ID for log/trace/analytics correlation.
            ...(event.traceId ? { trace_id: event.traceId } : {})
        }
    });
};
