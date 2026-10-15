/**
 * @module
 * The order's timeline: what happened to it, in order, readable by the buyer and by staff.
 *
 * Two writers, one door. `orders` appends its own moves inside the move's transaction; a module
 * that depends on `orders` (payments, delivery, returns, invoicing) calls {@link appendTimeline}
 * inside ITS transaction. `orders` cannot listen to them: they import it, so listening would be a
 * cycle.
 *
 * See: docs/modules/orders.md#the-timeline
 */

import type { ClientSession } from 'mongoose';
import { logger } from '@infrastructure/adapters/logger';
import { toObjectId } from '@infrastructure/persistence/create-repository';
import { callerForSubject } from '@kernel/permissions';
import { heldRules } from '@kernel/ability';
import type { AuthContext, OrderTimelineEntry } from '@types';
import { orderEventRepository } from '../repository';
import { ownOrderIds } from './read';
import type { OrderDocument } from '../model';
import { orderEventTextRetentionDays } from '../config';
import { presentTimeline, presentTimelineEntry } from '../presenter';
import type { TimelineEntryInput } from '../domain';
import { DAY_MS } from '@infrastructure/runtime/time';

/**
 * Append one row to an order's timeline, in the caller's transaction so the row commits with the
 * fact it describes or not at all.
 *
 * @param orderId - the order the row is about
 * @param entry - what happened; ids and codes in `data`, never a sibling module's free text
 * @param session - the caller's open transaction
 */
export const appendTimeline = (
    orderId: string,
    entry: TimelineEntryInput,
    session: ClientSession
): Promise<void> =>
    orderEventRepository
        .create(
            {
                orderId: toObjectId(orderId),
                at: entry.at ?? new Date(),
                type: entry.type,
                ...(entry.actor ? { actor: entry.actor } : {}),
                ...(entry.text ? { text: entry.text } : {}),
                data: { ...entry.data }
            },
            session
        )
        .then(() => undefined);

/**
 * Append several rows in order, in the caller's transaction. One after another: a transaction's
 * session does not take parallel operations, and the rows must keep the order they were given.
 *
 * @param orderId - the order the rows are about
 * @param entries - what happened, oldest first
 * @param session - the caller's open transaction
 */
export const appendTimelineAll = async (
    orderId: string,
    entries: readonly TimelineEntryInput[],
    session: ClientSession
): Promise<void> => {
    for (const entry of entries) await appendTimeline(orderId, entry, session);
};

/**
 * A conditional status write that also leaves its timeline rows: the rows are appended only when
 * the write landed, in its transaction, so a lost race writes neither.
 *
 * @param write - the conditional write; `null` when it matched nothing
 * @param rows - builds the rows from the order the write returned
 */
export const withTimeline =
    (
        write: (session: ClientSession) => Promise<OrderDocument | null>,
        rows: (order: OrderDocument) => readonly TimelineEntryInput[]
    ) =>
    (session: ClientSession): Promise<OrderDocument | null> =>
        write(session).then((order) =>
            order
                ? appendTimelineAll(String(order._id), rows(order), session).then(() => order)
                : order
        );

/**
 * Whether the caller reads every order: the staff view of a timeline. By the held key, not by the
 * CASL action — `read:Order` shares the action, so asking CASL would admit every buyer.
 *
 * @param authContext - the caller
 */
const readsEveryOrder = (authContext: AuthContext | undefined): boolean =>
    authContext !== undefined &&
    heldRules(callerForSubject(authContext, 'Order')).has('display:Order');

/**
 * An order's timeline as this caller may read it, oldest first. The order itself is already
 * checked: the controller reached it through `getForCaller`.
 *
 * @param orderId - the order
 * @param authContext - the caller; staff see every row and its actor, the buyer neither the
 *   staff-only rows nor any actor
 */
export const readTimeline = (
    orderId: string,
    authContext: AuthContext | undefined
): Promise<OrderTimelineEntry[]> =>
    orderEventRepository
        .findByOrderId(orderId)
        .then((events) =>
            presentTimeline(events, readsEveryOrder(authContext) ? 'staff' : 'buyer')
        );

/**
 * Every timeline row of one account's own orders, for `POST /account/export`. The full rows, actor
 * and staff text included: the export is the buyer's data, not the buyer's screen.
 *
 * @param userId - the account requesting its export
 * @returns each row with the order it belongs to
 */
export const collectTimelineOf = (
    userId: string
): Promise<(OrderTimelineEntry & { orderId: string })[]> =>
    ownOrderIds(userId).then((orderIds) =>
        orderEventRepository.findByOrderIds(orderIds).then((events) =>
            events.map((event) => ({
                ...presentTimelineEntry(event, 'staff'),
                orderId: String(event.orderId)
            }))
        )
    );

/**
 * Forget which row an erased staff account made: the rows stay, the person goes.
 *
 * @param userId - the erased account
 * @param session - the erasure's transaction
 */
export const clearTimelineActor = (userId: string, session: ClientSession): Promise<void> =>
    orderEventRepository.clearActor(userId, session).then(() => undefined);

/**
 * `reap:orders`'s second sweep: unset the free text of every row older than
 * `NODE_ORDER_EVENT_TEXT_RETENTION_DAYS`. The row, its type and its codes stay.
 *
 * @returns how many rows lost their text
 */
export const scrubTimelineText = (): Promise<number> =>
    orderEventRepository
        .scrubTextBefore(new Date(Date.now() - orderEventTextRetentionDays() * DAY_MS))
        .then((scrubbed) => {
            if (scrubbed > 0)
                // Stryker disable next-line all
                logger.info({ message: 'Scrubbed timeline text past retention.', scrubbed });
            return scrubbed;
        });

/**
 * Remove the timeline of an order that was hard-deleted.
 *
 * @param orderId - the deleted order
 */
export const deleteTimelineOf = (orderId: string): Promise<void> =>
    orderEventRepository.deleteByOrderId(orderId).then(() => undefined);
