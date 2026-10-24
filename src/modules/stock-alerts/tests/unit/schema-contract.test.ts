/**
 * @module
 * The `stockalerts` schema's contract — the declarations, not the documents. One row per user and
 * product is a database fact here, not a service check: that pair's unique index is what makes
 * asking twice the same request, so a dropped `unique` changes nothing a valid fixture shows.
 */
import { stockAlertSchema } from '@modules/stock-alerts/model';
import { indexOptionSpecs, indexSpecs, optionsOf, refOf, requiredPaths } from '@tests/schema';

describe('stockAlertSchema', () => {
    it('requires who asked and about what, and nothing else', () => {
        expect(requiredPaths(stockAlertSchema)).toEqual(['productId', 'userId']);
    });

    it('points each side at the collection it names', () => {
        expect(refOf(stockAlertSchema, 'userId')).toBe('User');
        expect(refOf(stockAlertSchema, 'productId')).toBe('Product');
    });

    it('makes "one request per user and product" a database fact', () => {
        expect(indexOptionSpecs(stockAlertSchema)).toContain('userId_1_productId_1: unique=true');
    });

    it('declares the unique pair and the per-product lookup, and nothing else', () => {
        expect(indexSpecs(stockAlertSchema)).toEqual([
            'productId_1: productId+1',
            'userId_1_productId_1: userId+1, productId+1'
        ]);
    });

    it('keeps timestamps', () => {
        expect(optionsOf(stockAlertSchema).timestamps).toBe(true);
    });
});
