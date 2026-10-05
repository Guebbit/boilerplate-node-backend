/**
 * @module
 * What each domain event becomes in the inbox. One function per event, each a mapping from a
 * payload to the rows to write — the module's `subscribe()` wires them to the bus, and the writing
 * itself stays in `./inbox`.
 *
 * Severity is `warning` throughout: each message says "something you had changed without you
 * asking", which is worth a look and not an error.
 */

import { Types } from 'mongoose';
import type { DomainEventMap } from '@kernel/events';
import type { NewNotification } from '../repository';
import { notificationsCreate } from './inbox';

/** One row per owner of a removed product, all the same message. */
const removedFor = (
    code: 'notifications.cart-line-removed' | 'notifications.wishlist-item-removed',
    { userIds, productId, titles }: DomainEventMap['cart.lines_removed']
): NewNotification[] =>
    userIds.map((userId) => ({
        userId: new Types.ObjectId(userId),
        code,
        severity: 'warning',
        params: { productId, titles }
    }));

/** A product left the catalogue and with it these users' carts. */
export const onCartLinesRemoved = (payload: DomainEventMap['cart.lines_removed']): Promise<void> =>
    notificationsCreate(removedFor('notifications.cart-line-removed', payload));

/** A product left the catalogue and with it these users' wishlists. */
export const onWishlistItemsRemoved = (
    payload: DomainEventMap['wishlist.items_removed']
): Promise<void> => notificationsCreate(removedFor('notifications.wishlist-item-removed', payload));

/** A guest-cart merge could not add some lines at all: one message listing all of them. */
export const onCartMergeRefused = ({
    userId,
    lines
}: DomainEventMap['cart.merge_refused']): Promise<void> =>
    notificationsCreate([
        {
            userId: new Types.ObjectId(userId),
            code: 'notifications.cart-merge-refused',
            severity: 'warning',
            params: { lines }
        }
    ]);
