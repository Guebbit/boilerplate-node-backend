/**
 * @module
 * `orders`' example values for the generated API client collections.
 *
 * Not a literal, and it cannot be one: the demo shop's orders are produced by driving real
 * checkouts, so their ids are minted when the shop is built and differ every time. Bruno, Insomnia
 * and Postman all read `{{name}}` as a collection variable at send time, so this hands the reader
 * a slot to fill instead of an id that 404s. The orders section's own first probe fills it.
 */

import type { CollectionValues } from '../collection-values';

/** What a generated request puts where an ORDER id belongs. */
const ORDER_ID_VARIABLE = '{{orderId}}';

/** The generated collections' order example values. */
export const collectionValues: CollectionValues = {
    byProperty: { orderId: ORDER_ID_VARIABLE },
    pathParam: (name, template) =>
        name === 'id' && template.startsWith('/orders') ? ORDER_ID_VARIABLE : undefined,
    tokens: { seedOrderId: ORDER_ID_VARIABLE, seedDeletedOrderId: '{{deletedOrderId}}' }
};
