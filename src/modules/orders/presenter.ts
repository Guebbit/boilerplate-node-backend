/**
 * @module
 * The one place an order document becomes the `Order` contract. `services/scope.ts`'s
 * `withActions` builds on this — resolving each line's live `current` picture and merging in what
 * this caller may do — but this is the one line that turns storage into wire.
 */

import type { ExportOrder, Order, OrderActions, OrderListItem, OrderTimelineEntry } from '@types';
import type { OrderDocument, OrderEventDocument } from './model';
import { TIMELINE_AUDIENCE } from './domain';
import { decryptPii } from '@infrastructure/security/pii-encryption';
import { timelineNoteAad } from './pii';

/**
 * `.toJSON()`'s return type is the schema's own `Document['toJSON']` overload, not this module's
 * `Order` contract — the same reasoning `products/presenter.ts`'s `presentProduct` documents, one
 * cast narrowing what the compiler cannot see through on its own.
 */
export const presentOrder = (document: OrderDocument): Order => document.toJSON() as Order;

/**
 * One row of the orders list: only what the table renders, so no address, email, line or note
 * leaves through a list. The full record is `GET /orders/{id}`, which is audited.
 *
 * @param order - the wire order the search produced
 * @param actions - what the requesting caller may do to it
 */
export const presentOrderListItem = (order: ExportOrder, actions: OrderActions): OrderListItem => ({
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    returnStatus: order.returnStatus,
    totalPrice: order.totalPrice,
    currency: order.currency,
    ...(order.paidAt === undefined ? {} : { paidAt: order.paidAt }),
    ...(order.createdAt === undefined ? {} : { createdAt: order.createdAt }),
    ...(order.deletedAt === undefined ? {} : { deletedAt: order.deletedAt }),
    actions
});

/**
 * The text of one stored row as a reader gets it: a staff note is ciphertext bound to its order,
 * every other type's text is stored as written.
 */
const textOf = (event: OrderEventDocument): string | undefined =>
    event.text && event.type === 'note_added'
        ? decryptPii(event.text, timelineNoteAad(String(event.orderId)), 'order timeline note')
        : event.text;

/**
 * One timeline row as the buyer or staff reads it. The buyer's view carries no `actor`: who at the
 * shop did something is the shop's business, and the row's own type says what happened. The row's
 * own `audience` is a fact of its type, whoever reads it.
 *
 * The one `as` of the timeline's read side: storage holds `type` and `data` apart. It is typed on
 * write via `appendTimeline` (one trusted writer), from a `TimelineEntryInput` that pairs each
 * type with its own `data`. The export builds on this, so neither reader casts again.
 *
 * @param event - the stored row
 * @param reader - `staff` sees the actor, `buyer` never does
 */
export const presentTimelineEntry = (
    event: OrderEventDocument,
    reader: 'buyer' | 'staff'
): OrderTimelineEntry => {
    const text = textOf(event);
    const entry = {
        id: String(event._id),
        at: event.at.toISOString(),
        type: event.type,
        audience: TIMELINE_AUDIENCE[event.type],
        ...(reader === 'staff' && event.actor ? { actor: event.actor } : {}),
        ...(text ? { text } : {}),
        data: event.data
    };
    return entry as OrderTimelineEntry;
};

/**
 * Present a page of an order's rows for one reader. The audience filter is the query's job
 * (`BUYER_VISIBLE_TYPES`), so a buyer's page and its count agree.
 *
 * @param events - the page's stored rows, already narrowed to what the reader may see
 * @param reader - who is reading
 */
export const presentTimeline = (
    events: readonly OrderEventDocument[],
    reader: 'buyer' | 'staff'
): OrderTimelineEntry[] => events.map((event) => presentTimelineEntry(event, reader));
