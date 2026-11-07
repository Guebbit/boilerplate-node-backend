/**
 * @module
 * The type → audience table: which timeline rows a buyer may read. The staff-only set is written
 * out, so moving a type across the line is a decision a diff shows rather than a side effect.
 * That the table names every type the contract has is the contract test's job
 * (`contract/timeline-variants.contract.test.ts`).
 */
import { TIMELINE_AUDIENCE } from '../../domain';

describe('the timeline audience table', () => {
    it('keeps exactly these types from the buyer', () => {
        const hidden = Object.entries(TIMELINE_AUDIENCE)
            .filter(([, audience]) => audience === 'staff')
            .map(([type]) => type);

        expect(hidden.toSorted()).toEqual([
            'address_corrected',
            'dispute_closed',
            'dispute_opened',
            'fulfillment_held',
            'fulfillment_released',
            'refund_canceled',
            'refund_failed',
            'refund_reversed',
            'status_overridden'
        ]);
    });
});
