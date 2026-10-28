/**
 * @module
 * Every id a customer can put in a request, sorted into what it is. The ownership sweeps
 * (`tests/contract/ownership-contract.test.ts` and `ownership-shop.contract.test.ts`) hold each
 * `OWNED_*` entry to one claim: another customer's id answers exactly like an id that does not
 * exist.
 *
 * The sorting is by hand, the finding is not: the completeness check derives every path, body and
 * query id from the mounted routes and `openapi.yaml`, and fails when one is in no list or a list
 * entry is no longer derived.
 *
 * Key shapes:
 *   path id          `METHOD /path/:param` (the route as mounted, no trailing slash)
 *   body or query id `METHOD /path#field`, `[]` marking an array (`lines[].productId`)
 *
 * No module imports: `demo:remove` strips the shop, and this file must survive it. `module` says
 * whose route it is, so a stripped checkout drops the entry instead of failing the check.
 */

/** One classified id. */
export interface OwnedId {
    /** The route (and field) the id travels in, in the key shapes above. */
    key: string;
    /** The folder under `src/modules/` that mounts the route. */
    module: string;
}

/** Builds the entries of one module. */
const of = (module: string, keys: readonly string[]): OwnedId[] =>
    keys.map((key) => ({ key, module }));

/**
 * Ids that name no row anyone owns: a method or provider name, or a public product. A customer
 * cannot reach another customer's data through them.
 */
export const NOT_AN_OWNED_ID: readonly OwnedId[] = [
    ...of('account', [
        'POST /account/reauth/methods/:method/send',
        'POST /account/2fa/methods/:method/setup',
        'POST /account/2fa/methods/:method/send',
        'POST /account/2fa/methods/:method/confirm',
        'POST /account/2fa/methods/:method/remove',
        'POST /account/oauth/links/:provider',
        'DELETE /account/oauth/links/:provider'
    ]),
    ...of('cart', [
        'PATCH /cart/items/:productId',
        'DELETE /cart/items/:productId',
        'POST /cart/items#productId',
        'POST /cart/merge#lines[].productId'
    ]),
    ...of('wishlist', [
        'POST /wishlist/items/:productId/move-to-cart',
        'DELETE /wishlist/items/:productId',
        'POST /wishlist/items#productId'
    ]),
    ...of('stock-alerts', ['DELETE /stock-alerts/:productId', 'POST /stock-alerts#productId']),
    ...of('returns', ['POST /returns#lines[].productId']),
    ...of('orders', ['GET /orders#productId', 'POST /orders/search#productId']),
    ...of('delivery', [
        'GET /delivery/fulfillment-orders#productId',
        'GET /delivery/fulfillment-orders/summary#productId'
    ])
];

/**
 * Request properties named `*Id` that are not typed `Id`, and so are not a lookup of someone's
 * row. The tripwire fails on any other, which would be an owned reference nobody typed.
 */
export const NOT_AN_ID_BY_NAME: readonly string[] = ['shippingMethodId'];

/** Path ids: another customer's row must answer 404, like a missing one. */
export const OWNED_PATH: readonly OwnedId[] = [
    ...of('orders', ['GET /orders/:id', 'POST /orders/:id/cancel', 'GET /orders/:id/timeline']),
    ...of('invoicing', [
        'GET /orders/:id/invoice',
        'GET /orders/:id/credit-notes',
        'GET /orders/:id/credit-notes/:creditNoteId'
    ]),
    ...of('payments', [
        'GET /orders/:id/payments',
        'GET /payments/:id',
        'GET /payments/:id/refunds/:refundId',
        'POST /payments/:id/confirm',
        'POST /payments/:id/sync'
    ]),
    ...of('delivery', [
        'GET /orders/:id/fulfillment-orders',
        'GET /orders/:id/shipments',
        'GET /delivery/fulfillment-orders/:id',
        'GET /delivery/shipments/:id'
    ]),
    ...of('addresses', [
        'GET /account/addresses/:addressId',
        'PUT /account/addresses/:addressId',
        'PATCH /account/addresses/:addressId',
        'DELETE /account/addresses/:addressId',
        'PUT /account/addresses/:addressId/default'
    ]),
    ...of('account', ['GET /account/sessions/:sessionId', 'DELETE /account/sessions/:sessionId']),
    ...of('notifications', ['GET /notifications/:id', 'DELETE /notifications/:id']),
    ...of('returns', ['GET /returns/:id'])
];

/** Body ids: another customer's row must answer like a missing one, with the documented status. */
export const OWNED_BODY: readonly OwnedId[] = [
    ...of('cart', [
        'POST /cart/checkout#addressId',
        'POST /cart/checkout#billingAddressId',
        'POST /cart/reorder#orderId'
    ]),
    ...of('payments', ['POST /payments#orderId']),
    ...of('returns', [
        'POST /returns#orderId',
        'POST /returns#fulfillmentOrderId',
        'GET /returns/options#orderId'
    ])
];

/** List filters: a foreign id narrows the list to nothing, so the answer is an empty page. */
export const OWNED_FILTER: readonly OwnedId[] = [
    ...of('returns', ['GET /returns#orderId']),
    ...of('orders', [
        'GET /orders#id[]',
        'GET /orders#userId',
        'POST /orders/search#id[]',
        'POST /orders/search#userId'
    ])
];

/** The keys the sweeps own, by family, for the completeness check. */
export const FAMILIES = {
    NOT_AN_OWNED_ID,
    OWNED_PATH,
    OWNED_BODY,
    OWNED_FILTER
} as const;
