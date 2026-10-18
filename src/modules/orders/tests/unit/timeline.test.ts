/**
 * @module
 * The type → audience table: which timeline rows a buyer may read. The staff-only set is written
 * out, so moving a type across the line is a decision a diff shows rather than a side effect.
 */
import { OrderTimelineType } from '@types';
import { TIMELINE_AUDIENCE, isBuyerVisible } from '../../domain';

describe('the timeline audience table', () => {
    it('keeps exactly these types from the buyer', () => {
        const hidden = Object.values(OrderTimelineType).filter((type) => !isBuyerVisible(type));

        expect(hidden.toSorted()).toEqual([
            'address_corrected',
            'fulfillment_held',
            'fulfillment_released',
            'refund_failed',
            'status_overridden'
        ]);
    });

    it('decides every type the contract names, and no other', () => {
        expect(Object.keys(TIMELINE_AUDIENCE).toSorted()).toEqual(
            Object.values(OrderTimelineType).toSorted()
        );
    });
});
