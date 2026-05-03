import {
    isPostHogEnabled,
    emitAnalyticsEvent,
    shutdownAnalytics,
    AnalyticsEvent,
    IAnalyticsEvent,
} from '@utils/analytics';

// ─── Mock posthog-node ────────────────────────────────────────────────────────

// Keep references to the individual mock fns so tests can assert on them directly.
const mockCapture = jest.fn();
const mockShutdown = jest.fn().mockResolvedValue(void 0);

jest.mock('posthog-node', () => ({
    PostHog: jest.fn().mockImplementation(() => ({
        capture: mockCapture,
        shutdown: mockShutdown,
    })),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PostHog: mockedPostHog } = require('posthog-node') as { PostHog: jest.MockedClass<{ new (...args: unknown[]): unknown }> };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const enablePostHog = () => {
    process.env.NODE_POSTHOG_API_KEY = 'phc_test_key';
    process.env.NODE_POSTHOG_HOST = 'https://app.posthog.com';
};

const disablePostHog = () => {
    delete process.env.NODE_POSTHOG_API_KEY;
    delete process.env.NODE_POSTHOG_HOST;
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('isPostHogEnabled()', () => {
    afterEach(disablePostHog);

    it('returns false when neither env var is set', () => {
        disablePostHog();
        expect(isPostHogEnabled()).toBe(false);
    });

    it('returns false when only API key is set', () => {
        process.env.NODE_POSTHOG_API_KEY = 'phc_key';
        expect(isPostHogEnabled()).toBe(false);
    });

    it('returns false when only host is set', () => {
        process.env.NODE_POSTHOG_HOST = 'https://app.posthog.com';
        expect(isPostHogEnabled()).toBe(false);
    });

    it('returns true when both env vars are set', () => {
        enablePostHog();
        expect(isPostHogEnabled()).toBe(true);
    });
});

describe('AnalyticsEvent enum', () => {
    it('defines all expected event names', () => {
        expect(AnalyticsEvent.USER_SIGNED_UP).toBe('user_signed_up');
        expect(AnalyticsEvent.USER_LOGGED_IN).toBe('user_logged_in');
        expect(AnalyticsEvent.PRODUCTS_SEARCHED).toBe('products_searched');
        expect(AnalyticsEvent.PRODUCT_VIEWED).toBe('product_viewed');
        expect(AnalyticsEvent.CART_ITEM_ADDED).toBe('cart_item_added');
        expect(AnalyticsEvent.CART_ITEM_UPDATED).toBe('cart_item_updated');
        expect(AnalyticsEvent.CART_ITEM_REMOVED).toBe('cart_item_removed');
        expect(AnalyticsEvent.CART_CLEARED).toBe('cart_cleared');
        expect(AnalyticsEvent.CHECKOUT_COMPLETED).toBe('checkout_completed');
        expect(AnalyticsEvent.CHECKOUT_FAILED).toBe('checkout_failed');
        expect(AnalyticsEvent.ORDER_CREATED).toBe('order_created');
    });
});

describe('emitAnalyticsEvent()', () => {
    beforeEach(async () => {
        // Drain any existing client first, then clear mock state so assertions start clean.
        await shutdownAnalytics();
        jest.clearAllMocks();
    });

    afterEach(disablePostHog);

    it('does nothing when PostHog is disabled', () => {
        disablePostHog();
        emitAnalyticsEvent({
            distinctId: 'user-1',
            event: AnalyticsEvent.USER_LOGGED_IN,
        });
        expect(mockedPostHog).not.toHaveBeenCalled();
    });

    it('instantiates PostHog client on first call when enabled', () => {
        enablePostHog();
        emitAnalyticsEvent({
            distinctId: 'user-1',
            event: AnalyticsEvent.USER_LOGGED_IN,
        });
        expect(mockedPostHog).toHaveBeenCalledTimes(1);
        expect(mockedPostHog).toHaveBeenCalledWith(
            'phc_test_key',
            expect.objectContaining({ host: 'https://app.posthog.com' })
        );
    });

    it('reuses the same client on subsequent calls', () => {
        enablePostHog();
        emitAnalyticsEvent({ distinctId: 'u1', event: AnalyticsEvent.USER_LOGGED_IN });
        emitAnalyticsEvent({ distinctId: 'u1', event: AnalyticsEvent.PRODUCT_VIEWED });
        expect(mockedPostHog).toHaveBeenCalledTimes(1);
    });

    it('calls client.capture with correct distinctId and event', () => {
        enablePostHog();
        const event: IAnalyticsEvent = {
            distinctId: 'user-42',
            event: AnalyticsEvent.CART_ITEM_ADDED,
            properties: { product_id: 'prod-7', quantity: 2 },
        };
        emitAnalyticsEvent(event);

        expect(mockCapture).toHaveBeenCalledTimes(1);
        const payload = mockCapture.mock.calls[0][0] as {
            distinctId: string;
            event: string;
            properties: Record<string, unknown>;
        };
        expect(payload.distinctId).toBe('user-42');
        expect(payload.event).toBe('cart_item_added');
        expect(payload.properties.product_id).toBe('prod-7');
        expect(payload.properties.quantity).toBe(2);
    });

    it('includes trace_id in properties when provided', () => {
        enablePostHog();
        emitAnalyticsEvent({
            distinctId: 'u1',
            event: AnalyticsEvent.CHECKOUT_COMPLETED,
            traceId: 'abc123',
        });

        const payload = mockCapture.mock.calls[0][0] as {
            properties: Record<string, unknown>;
        };
        expect(payload.properties.trace_id).toBe('abc123');
    });

    it('does not include trace_id property when traceId is omitted', () => {
        enablePostHog();
        emitAnalyticsEvent({
            distinctId: 'u1',
            event: AnalyticsEvent.PRODUCT_VIEWED,
        });

        const payload = mockCapture.mock.calls[0][0] as {
            properties: Record<string, unknown>;
        };
        expect('trace_id' in payload.properties).toBe(false);
    });
});

describe('shutdownAnalytics()', () => {
    beforeEach(async () => {
        // Drain any existing client first, then clear mock state so assertions start clean.
        await shutdownAnalytics();
        jest.clearAllMocks();
    });

    afterEach(disablePostHog);

    it('flushes the client if one has been created', async () => {
        enablePostHog();
        emitAnalyticsEvent({ distinctId: 'u1', event: AnalyticsEvent.USER_SIGNED_UP });

        await shutdownAnalytics();
        expect(mockShutdown).toHaveBeenCalledTimes(1);
    });

    it('resolves immediately when no client has been created', async () => {
        disablePostHog();
        await expect(shutdownAnalytics()).resolves.toBeUndefined();
    });
});
