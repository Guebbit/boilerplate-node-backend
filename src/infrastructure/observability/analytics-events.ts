/**
 * The analytics event names BOTH repos emit.
 *
 * ─── Generated, and byte-identical in the paired repository — do not hand-edit ───────────────
 * Backend:  src/infrastructure/observability/analytics-events.ts
 * Frontend: src/infrastructure/analyticsEvents.ts
 * Each domain owns its names in `src/modules/<name>/analytics.fragment.ts`; the backend runs
 * `npm run contracts:bundle` and the frontend receives a copy. `npm run check:spec-identity`
 * fails the build on the commit that forks them. Two filenames because the lint configs disagree
 * on case; the CONTENT must match exactly.
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * One funnel is built across both trackers, so a name spelled differently on each side errors
 * nowhere and silently produces two half-events no dashboard adds up. Hence a closed set, and
 * snake_case `noun_pastTenseVerb`, which PostHog's UI sorts well.
 *
 * A `const` object rather than an `enum`: the frontend's lint requires `E`-prefixed enums and the
 * backend's does not, so no single `enum` satisfies both.
 *
 * Events only ONE side emits do not belong here.
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

    // Checkout — `POST /cart/checkout` is the endpoint that reports these, so they live with it.
    // A name belongs to the code that emits it: delete this module and the two outcomes leave the
    // funnel with the endpoint that produced them.
    CHECKOUT_COMPLETED: 'checkout_completed',
    CHECKOUT_FAILED: 'checkout_failed',

    // Orders
    ORDER_CREATED: 'order_created',
    ORDERS_VIEWED: 'orders_viewed'
} as const;

/** Any name declared above. */
export type TSharedAnalyticsEventName = (typeof analyticsEvents)[keyof typeof analyticsEvents];
