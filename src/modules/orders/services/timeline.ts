/**
 * @module
 * The order's timeline: what happened to it, in order, readable by the buyer and by staff.
 *
 * Two writers, one door. `orders` appends its own moves inside the move's transaction; a module
 * that depends on `orders` (payments, delivery, returns, invoicing) calls {@link appendTimeline}
 * inside ITS transaction. `orders` cannot listen to them: they import it, so listening would be a
 * cycle.
 *
 * @see docs/modules/orders.md#the-timeline
 */

import type { ClientSession } from 'mongoose';
import { logger } from '@infrastructure/adapters/logger';
import { toObjectId } from '@infrastructure/persistence/create-repository';
import { callerForSubject } from '@kernel/permissions';
import { heldRules } from '@kernel/ability';
import type { AuthContext, CallerContext, OrderTimelineEntry } from '@types';
import { t } from '@infrastructure/i18n';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { recordAudit } from '@infrastructure/observability/audit';
import { withTransaction } from '@infrastructure/runtime/database';
import { ordersAuditActions } from '../audit';
import { orderEventRepository, orderRepository } from '../repository';
import { ownOrderIds } from './read';
import type { OrderDocument, OrderEventDocument } from '../model';
import { encryptPii, decryptPii } from '@infrastructure/security/pii-encryption';
import { timelineNoteAad } from '../pii';
import { orderEventTextRetentionDays } from '../config';
import { presentTimeline, presentTimelineEntry } from '../presenter';
import { BUYER_VISIBLE_TYPES, type TimelineEntryInput } from '../domain';
import {
    buildPaginatedMeta,
    normalizePagination,
    type PaginatedMeta,
    type PaginationInput
} from '@infrastructure/persistence/search';
import { DAY_MS } from '@domain-primitives/time';

/**
 * Store one row and hand it back. A staff note's text is encrypted here, under the order's id, so no
 * writer can leave one in plaintext; the presenter decrypts it.
 *
 * @param orderId - the order the row is about
 * @param entry - what happened
 * @param session - the caller's open transaction
 */
const insertRow = (
    orderId: string,
    entry: TimelineEntryInput,
    session: ClientSession
): Promise<OrderEventDocument> =>
    orderEventRepository.create(
        {
            orderId: toObjectId(orderId),
            at: entry.at ?? new Date(),
            type: entry.type,
            ...(entry.actor ? { actor: entry.actor } : {}),
            // Only a variant that declares `text` has the key; `in` narrows the union to it.
            ...('text' in entry && entry.text
                ? {
                      text:
                          entry.type === 'note_added'
                              ? encryptPii(entry.text, timelineNoteAad(orderId))
                              : entry.text
                  }
                : {}),
            data: { ...entry.data }
        },
        session
    );

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
): Promise<void> => insertRow(orderId, entry, session).then(() => undefined);

/**
 * Append several rows in order, in the caller's transaction. One after another: a transaction's
 * session does not take parallel operations, and the rows must keep the order they were given.
 *
 * @param orderId - the order the rows are about
 * @param entries - what happened, oldest first
 * @param session - the caller's open transaction
 */
const appendTimelineAll = async (
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
 * Leave a staff note on an order: one `note_added` row, written in its own transaction.
 *
 * @param orderId - the order
 * @param text - what staff wrote (1..2000, checked at the door)
 * @param context - the staff member, who holds `update:Order` (the route asked)
 * @returns the entry with `201`, or a 404 for an order that is not there. The audit row names the
 *   note's length, never its text.
 */
export const addNote = (
    orderId: string,
    text: string,
    context: CallerContext
): Promise<ResponseSuccess<OrderTimelineEntry> | ResponseReject> =>
    orderRepository.findByIdScoped(orderId).then((order) => {
        if (!order) return generateReject(404, [t('orders.not-found')]);

        return withTransaction((session) =>
            insertRow(orderId, { type: 'note_added', actor: context.caller.id, text }, session)
        ).then((row) => {
            recordAudit(context, {
                action: ordersAuditActions.ADMIN_ORDER_NOTE_ADDED,
                outcome: 'success',
                targetType: 'order',
                targetId: orderId,
                metadata: { eventId: String(row._id), length: text.length }
            });
            return generateSuccess(presentTimelineEntry(row, 'staff'), 201);
        });
    });

/**
 * Withdraw a wrong staff note: its text is unset, the row stays. One conditional write, so an
 * unknown id, a row of another order, another type and a note already withdrawn are all one 404.
 *
 * @param orderId - the order the note is on
 * @param eventId - the note's entry id
 * @param context - the staff member, who holds `update:Order` (the route asked)
 * @returns `204`-shaped success, or a 404. The audit row names the withdrawn text's length.
 */
export const deleteNote = (
    orderId: string,
    eventId: string,
    context: CallerContext
): Promise<ResponseSuccess<undefined> | ResponseReject> =>
    orderEventRepository.clearNoteText(orderId, eventId).then((before) => {
        if (!before?.text) return generateReject(404, [t('orders.not-found')]);

        const { length } = decryptPii(before.text, timelineNoteAad(orderId), 'order timeline note');
        recordAudit(context, {
            action: ordersAuditActions.ADMIN_ORDER_NOTE_DELETED,
            outcome: 'success',
            targetType: 'order',
            targetId: orderId,
            metadata: { eventId, length }
        });
        return generateSuccess(undefined, 204);
    });

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
 * One page of an order's timeline as this caller may read it, newest first. The order itself is
 * already checked: the controller reached it through `getForCaller`.
 *
 * @param orderId - the order
 * @param authContext - the caller; staff see every row and its actor, the buyer neither the
 *   staff-only rows nor any actor
 * @param pagination - `page`/`pageSize` as they came off the request
 * @returns the page and its meta; `totalItems` counts only rows this caller may read
 */
export const readTimeline = (
    orderId: string,
    authContext: AuthContext | undefined,
    pagination: PaginationInput
): Promise<{ items: OrderTimelineEntry[]; meta: PaginatedMeta }> => {
    const reader = readsEveryOrder(authContext) ? 'staff' : 'buyer';
    const page = normalizePagination(pagination);
    return orderEventRepository
        .findPageByOrderId(orderId, reader === 'staff' ? undefined : BUYER_VISIBLE_TYPES, page)
        .then(({ rows, totalItems }) => ({
            items: presentTimeline(rows, reader),
            meta: buildPaginatedMeta(page, totalItems)
        }));
};

/**
 * Every timeline row of one account's own orders, for `POST /account/export`. Staff text and
 * staff-only rows are included (the export is the buyer's data, not the buyer's screen), but an
 * `actor` only when it is the exporting account itself: who at the shop wrote a row stays in the
 * audit log (CJEU Pankki S, C-579/21).
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
                // The `buyer` audience leaves the actor out; only the account's own id is put back.
                ...presentTimelineEntry(event, 'buyer'),
                ...(event.actor === userId ? { actor: event.actor } : {}),
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
 * @internal Deletes any order's timeline: only this module's order removal may call it, so it is not on `orderService`.
 */
export const deleteTimelineOf = (orderId: string): Promise<void> =>
    orderEventRepository.deleteByOrderId(orderId).then(() => undefined);
