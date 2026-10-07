/**
 * @module
 * The return schema's contract. The order is the only owner a return has — there is no `userId`
 * field to leak, which is what lets account erasure leave the record alone (Art. 17(3)(b)/(e)).
 */
import { returnSchema } from '@modules/returns/model';
import { enumOf, indexOptionSpecs, refOf, requiredPaths, typeOf, defaultOf } from '@tests/schema';

describe('returnSchema', () => {
    it('requires what a return is about, and why', () => {
        expect(requiredPaths(returnSchema)).toEqual([
            'currency',
            'lines',
            'orderId',
            'orderNumber',
            'reason',
            'returnPostage'
        ]);
    });

    it('keeps no link to a person — keyed by the order alone', () => {
        expect(returnSchema.path('userId')).toBeUndefined();
    });

    it('points at the order as a real ObjectId reference', () => {
        expect(typeOf(returnSchema, 'orderId')).toBe('ObjectId');
        expect(refOf(returnSchema, 'orderId')).toBe('Order');
    });

    it('starts requested, and closes the vocabularies', () => {
        expect(defaultOf(returnSchema, 'status')).toBe('requested');
        expect(enumOf(returnSchema, 'status')).toEqual([
            'requested',
            'approved',
            'declined',
            'received',
            'closed'
        ]);
        expect(enumOf(returnSchema, 'reason')).toEqual([
            'withdrawal',
            'defective',
            'wrong_item',
            'other'
        ]);
        expect(enumOf(returnSchema, 'returnPostage')).toEqual(['consumer', 'shop']);
    });

    it('indexes the two reads it serves — one order’s returns, and the staff queue', () => {
        const specs = indexOptionSpecs(returnSchema);

        expect(specs.join(' ')).toContain('returns_orderId_createdAt');
        expect(specs.join(' ')).toContain('returns_status_createdAt');
    });
});
