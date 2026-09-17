/**
 * @module
 * Move a flow-produced order into the past — itself and everything the application wrote
 * because of it.
 *
 * The flows run at boot, so without this every order in the demo shop is dated the minute the
 * container started: no trend on an analytics chart, no "last 30 days" filter with anything
 * outside it, and a dashboard that looks the same whatever period it is asked for.
 *
 * PER ORDER, never a blanket shift — that is what keeps the order, its payment, its shipment, its
 * hold, its stock movements and its audit rows agreeing with one another about when any of it
 * happened.
 */

import { orderModel } from '@modules/orders/model';
import { paymentModel } from '@modules/payments/model';
import { shipmentModel } from '@modules/delivery/model';
import { reservationModel, stockMovementModel } from '@modules/inventory/model';
import { auditLogModel } from '@modules/audit-logs/model';
import type { Model, QueryFilter } from 'mongoose';

/**
 * How to move one collection's share of an order's history.
 *
 * A factory rather than a table of `{ model, filter, dates }` rows: six unrelated document types
 * cannot sit in one array without erasing what each is, and erasing them is what would need an
 * `any`. Closing over each model here keeps every filter checked against its own schema.
 *
 * @param model - the collection holding the rows
 * @param find - how that collection names the order, given its id. Not one shared filter: three of
 *               the six store a real `ObjectId` reference, while `stockmovements` and `auditlogs`
 *               hold the id as a STRING in a free-text column (`reference`, `target_id`)
 * @param dates - the row's date columns, every one of which moves with the order
 * @returns a mover: give it an order and a distance, it rewrites that collection's rows
 */
const mover =
    <T>(model: Model<T>, find: (orderId: string) => QueryFilter<T>, dates: string[]) =>
    (orderId: string, days: number): Promise<unknown> =>
        model
            /*
             * `updatePipeline: true`: Mongoose 9 refuses an array update unless the caller says it
             * meant an aggregation pipeline, since a plain array is far more often a mistake.
             * https://mongoosejs.com/docs/migrating_to_9.html
             *
             * `timestamps: false` is load-bearing: Mongoose stamps `updatedAt` with the current
             * time on every update by default, which would undo half of what this write is for on
             * the very row it is rewriting.
             */
            .updateMany(find(orderId), [{ $set: shiftStage(dates, days) }], {
                updatePipeline: true,
                timestamps: false
            })
            .exec();

/**
 * Everything one order left behind, and the date columns on each.
 *
 * `updatedAt` moves with `createdAt` rather than staying put: a row last touched a minute ago
 * describing something that happened in March is the exact incoherence this pass exists to avoid.
 * `reservations.expiresAt` moves too — every backdated order's hold is long since committed or
 * released, and a deadline left at boot time would be the only date in the row disagreeing.
 */
const TRAILS = [
    mover(orderModel, (orderId) => ({ _id: orderId }), ['createdAt', 'updatedAt', 'deletedAt']),
    mover(paymentModel, (orderId) => ({ orderId }), ['createdAt', 'updatedAt', 'receivedAt']),
    mover(shipmentModel, (orderId) => ({ orderId }), ['createdAt', 'updatedAt', 'deliveredAt']),
    mover(reservationModel, (orderId) => ({ orderId }), ['createdAt', 'updatedAt', 'expiresAt']),
    mover(stockMovementModel, (orderId) => ({ reference: orderId }), ['createdAt', 'updatedAt']),
    mover(auditLogModel, (orderId) => ({ target_id: orderId }), ['timestamp'])
];

/**
 * The `$set` stage that moves every named date back by `days`.
 *
 * `$dateSubtract` answers null for a null or absent `startDate`, and `$ifNull` turns that into
 * `$$REMOVE` — so a column the row does not carry (`deletedAt` on an order nobody deleted) stays
 * absent instead of being written as null.
 * https://www.mongodb.com/docs/manual/reference/operator/aggregation/dateSubtract/
 */
const shiftStage = (dates: string[], days: number): Record<string, unknown> =>
    Object.fromEntries(
        dates.map((field) => [
            field,
            {
                $ifNull: [
                    { $dateSubtract: { startDate: `$${field}`, unit: 'day', amount: days } },
                    '$$REMOVE'
                ]
            }
        ])
    );

/**
 * Move one order and its whole trail `days` into the past.
 *
 * @param orderId - the order to age
 * @param days - how far back, in days. `0` leaves everything alone
 */
const backdateOrder = (orderId: string, days: number): Promise<void> =>
    days <= 0
        ? Promise.resolve()
        : Promise.all(TRAILS.map((move) => move(orderId, days))).then(() => undefined);

/**
 * Wait until the audit trail has stopped growing.
 *
 * `emitAuditEvent` is fire-and-forget by contract (`@modules/audit-logs/service`'s `record`
 * returns `void`), so the last few entries a flow produced may still be in flight when the final
 * HTTP response has already come back. Backdating before they land would leave them dated boot
 * time against an order dated three months ago.
 *
 * Two equal counts a beat apart, rather than a fixed sleep: a slow machine waits longer and a
 * fast one does not wait at all. The cap is a safety net — it settles in one or two rounds.
 */
const settleAuditTrail = async (): Promise<void> => {
    let previous = -1;
    for (let round = 0; round < 20; round += 1) {
        const count = await auditLogModel.countDocuments().exec();
        if (count === previous) return;
        previous = count;
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
};

/**
 * Age every order the flows produced, as `scenarios/flows/shop-history.ts` dated it.
 *
 * Concurrent across orders and sequential within one: two orders never share a row, and the six
 * collections of a single order are six separate writes.
 *
 * @param ages - order id → how many days back it belongs
 */
export const backdateHistory = (ages: Record<string, number>): Promise<void> =>
    settleAuditTrail()
        .then(() =>
            Promise.all(Object.entries(ages).map(([orderId, days]) => backdateOrder(orderId, days)))
        )
        .then(() => undefined);
