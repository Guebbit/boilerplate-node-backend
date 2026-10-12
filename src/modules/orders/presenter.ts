/**
 * @module
 * The one place an order document becomes the `Order` contract. `services/scope.ts`'s
 * `withActions` builds on this — resolving each line's live `current` picture and merging in what
 * this caller may do — but this is the one line that turns storage into wire.
 */

import type { Order, OrderTimelineEntry } from '@types';
import type { OrderDocument, OrderEventDocument } from './model';
import { isBuyerVisible } from './domain';

/**
 * `.toJSON()`'s return type is the schema's own `Document['toJSON']` overload, not this module's
 * `Order` contract — the same reasoning `products/presenter.ts`'s `presentProduct` documents, one
 * cast narrowing what the compiler cannot see through on its own.
 */
export const presentOrder = (document: OrderDocument): Order => document.toJSON() as Order;

/**
 * One timeline row as the buyer or staff reads it. The buyer's view carries no `actor`: who at the
 * shop did something is the shop's business, and the row's own type says what happened.
 *
 * @param event - the stored row
 * @param audience - `staff` sees the actor, `buyer` never does
 */
export const presentTimelineEntry = (
    event: OrderEventDocument,
    audience: 'buyer' | 'staff'
): OrderTimelineEntry => ({
    id: String(event._id),
    at: event.at.toISOString(),
    type: event.type,
    ...(audience === 'staff' && event.actor ? { actor: event.actor } : {}),
    ...(event.text ? { text: event.text } : {}),
    data: event.data
});

/**
 * The rows of an order a given audience may read, in the order they were stored.
 *
 * @param events - every stored row of the order
 * @param audience - who is reading
 */
export const presentTimeline = (
    events: readonly OrderEventDocument[],
    audience: 'buyer' | 'staff'
): OrderTimelineEntry[] =>
    events
        .filter((event) => audience === 'staff' || isBuyerVisible(event.type))
        .map((event) => presentTimelineEntry(event, audience));
