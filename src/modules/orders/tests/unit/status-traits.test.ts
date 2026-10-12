/**
 * @module
 * The status-traits record: one row per status, read by the predicates that used to list statuses.
 */
import { OrderStatus } from '@types';
import { ORDER_STATUS_TRAITS, statusesWhere } from '../../domain';

describe('ORDER_STATUS_TRAITS', () => {
    it('has exactly one row per contract status', () => {
        expect(Object.keys(ORDER_STATUS_TRAITS).toSorted()).toEqual(
            Object.values(OrderStatus).toSorted()
        );
    });

    it.each<[OrderStatus, boolean, boolean, boolean]>([
        // status, stockCommitted, beforeDispatch, withdrawable
        [OrderStatus.pending, false, true, true],
        [OrderStatus.paid, true, true, true],
        [OrderStatus.processing, true, true, true],
        [OrderStatus.shipped, true, false, true],
        [OrderStatus.delivered, true, false, true],
        [OrderStatus.cancelled, false, false, false]
    ])('%s', (status, stockCommitted, beforeDispatch, withdrawable) => {
        expect(ORDER_STATUS_TRAITS[status]).toMatchObject({
            stockCommitted,
            beforeDispatch,
            withdrawable
        });
    });
});

describe('statusesWhere', () => {
    it('lists matching statuses in contract order', () => {
        expect(statusesWhere((traits) => traits.fulfillment.followsSummary)).toEqual([
            OrderStatus.paid,
            OrderStatus.processing
        ]);
    });
});
