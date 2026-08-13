    // Cart
    CART_VIEWED: 'cart_viewed',
    CART_ITEM_ADDED: 'cart_item_added',
    CART_ITEM_UPDATED: 'cart_item_updated',
    CART_ITEM_REMOVED: 'cart_item_removed',
    CART_CLEARED: 'cart_cleared',
    // `POST /cart/reorder/{orderId}` — an old order refilling the cart. A cart event, not an
    // orders one: the order is only read, the cart is what changes.
    CART_REORDERED: 'cart_reordered',

    // Checkout — `POST /cart/checkout` is the endpoint that reports these, so they live with it.
    // A name belongs to the code that emits it: delete this module and the two outcomes leave the
    // funnel with the endpoint that produced them.
    CHECKOUT_COMPLETED: 'checkout_completed',
    CHECKOUT_FAILED: 'checkout_failed'
