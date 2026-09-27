/**
 * @module
 * The one place an order document becomes the `Order` contract. `services/scope.ts`'s
 * `withActions` builds on this — resolving each line's live `current` picture and merging in what
 * this caller may do — but this is the one line that turns storage into wire.
 */

import type { Order } from '@types';
import type { OrderDocument } from './model';

/**
 * `.toJSON()`'s return type is the schema's own `Document['toJSON']` overload, not this module's
 * `Order` contract — the same reasoning `products/presenter.ts`'s `presentProduct` documents, one
 * cast narrowing what the compiler cannot see through on its own.
 */
export const presentOrder = (document: OrderDocument): Order => document.toJSON() as Order;
