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
    CHECKOUT_FAILED: 'checkout_failed'
