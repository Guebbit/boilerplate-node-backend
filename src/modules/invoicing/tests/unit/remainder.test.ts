/**
 * @module
 * `remainderLines` — what an invoice still stands for after credit notes took part of it. Pure
 * data in, lines out; `src/modules/invoicing/tests/integration/correct-invoice.test.ts` covers it through a real correction.
 */
import { remainderLines } from '../../domain';

/** An invoice of 110.00 at 10% and 122.00 at 22%. */
const INVOICE = [
    { rate: 0.1, grossAmount: '110.00' },
    { rate: 0.22, grossAmount: '122.00' }
];

describe('remainderLines', () => {
    it('is the whole invoice, one line per rate, when nothing was credited', () => {
        expect(remainderLines(INVOICE, [], 'EUR', 'Rest')).toEqual([
            { title: 'Rest', quantity: 1, unitPrice: '110.00', taxRate: 0.1 },
            { title: 'Rest', quantity: 1, unitPrice: '122.00', taxRate: 0.22 }
        ]);
    });

    it('takes each credit note off the rate it credited, never off another', () => {
        const lines = remainderLines(
            INVOICE,
            [[{ rate: 0.22, grossAmount: '22.00' }], [{ rate: 0.22, grossAmount: '0.50' }]],
            'EUR',
            'Rest'
        );

        expect(lines.map((line) => [line.taxRate, line.unitPrice])).toEqual([
            [0.1, '110.00'],
            [0.22, '99.50']
        ]);
    });

    it('leaves out a rate that was credited in full, and is empty once everything was', () => {
        const oneRate = remainderLines(
            INVOICE,
            [[{ rate: 0.1, grossAmount: '110.00' }]],
            'EUR',
            'x'
        );
        const everything = remainderLines(INVOICE, [INVOICE], 'EUR', 'x');

        expect(oneRate.map((line) => line.taxRate)).toEqual([0.22]);
        expect(everything).toEqual([]);
    });
});
