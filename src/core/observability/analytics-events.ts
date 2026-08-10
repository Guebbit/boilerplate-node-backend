/**
 * The analytics event names BOTH repos emit.
 *
 * ─── This file is byte-identical in the paired repository ───────────────────────────────────
 * Backend:  src/core/observability/analytics-events.ts
 * Frontend: src/stores/analyticsEvents.ts
 * (Two names because the two lint configs disagree on filename case; the CONTENT must match
 * exactly. `npm run check:spec-identity` fails the build on the commit that forks them.)
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Why it is shared at all: the backend sends these to PostHog and the frontend sends them to its
 * own tracker, and a funnel is built across both. A name that exists on one side only, or is
 * spelled differently on each, does not error anywhere — it silently produces two half-events
 * that no dashboard adds up. That is the failure this file exists to make impossible.
 *
 * A closed set rather than free-form strings, for the same reason: a typo (`user_signedup`)
 * creates a second event that fragments every funnel built on the first. The naming convention is
 * snake_case `noun_pastTenseVerb`, which is what PostHog's UI sorts and groups well.
 *
 * A `const` object rather than an `enum`, deliberately: the frontend's lint config requires enums
 * to be `E`-prefixed and the backend's does not, so no single `enum` declaration can satisfy both.
 * The object is also what makes the names usable as plain strings by whichever tracker each side
 * talks to.
 *
 * Events emitted by only ONE side do not belong here — see the frontend's own
 * lifecycle events, which it spreads on top of these.
 */
export const analyticsEvents = {
    // Auth / onboarding
    USER_SIGNED_UP: 'user_signed_up',
    USER_LOGGED_IN: 'user_logged_in',
    USER_PROFILE_VIEWED: 'user_profile_viewed',
    ACCOUNT_DELETED: 'account_deleted',

    // Product discovery
    PRODUCTS_SEARCHED: 'products_searched',
    PRODUCT_VIEWED: 'product_viewed',

    // Cart
    CART_VIEWED: 'cart_viewed',
    CART_ITEM_ADDED: 'cart_item_added',
    CART_ITEM_UPDATED: 'cart_item_updated',
    CART_ITEM_REMOVED: 'cart_item_removed',
    CART_CLEARED: 'cart_cleared',

    // Checkout / orders
    CHECKOUT_COMPLETED: 'checkout_completed',
    CHECKOUT_FAILED: 'checkout_failed',
    ORDER_CREATED: 'order_created',
    ORDERS_VIEWED: 'orders_viewed'
} as const;

/** Any name declared above. */
export type TSharedAnalyticsEventName = (typeof analyticsEvents)[keyof typeof analyticsEvents];
