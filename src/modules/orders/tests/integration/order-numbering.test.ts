/**
 * @module
 * `allocateOrderNumber` — the one guarantee this feature exists for: no two orders ever get the
 * same number, and the sequence never skips, even under real concurrency. Integration, not unit,
 * since the atomicity being tested is `orderRepository.incrementOrderNumberCounter`'s single
 * `findOneAndUpdate` against a real Mongo — nothing here is provable against a mock.
 */
import { setupTestDb } from '@tests/setup-test-db';
import { allocateOrderNumber } from '../../services/order-numbering';
import { freezeDate } from '@tests/clock';

setupTestDb();

/** Splits `{year}-{sequence}` back into its two parts, as a number pair. */
const parse = (orderNumber: string): [year: number, sequence: number] => {
    const [year, sequence] = orderNumber.split('-', 2);
    return [Number(year), Number(sequence)];
};

describe('allocateOrderNumber', () => {
    it('formats the first number of a year as {year}-000001', async () => {
        const orderNumber = await allocateOrderNumber();

        const [year, sequence] = parse(orderNumber);
        expect(year).toBe(new Date().getUTCFullYear());
        expect(sequence).toBe(1);
        expect(orderNumber).toBe(`${year}-000001`);
    });

    it('advances the sequence by one on every call, serially', async () => {
        const first = await allocateOrderNumber();
        const second = await allocateOrderNumber();
        const third = await allocateOrderNumber();

        expect([first, second, third].map((n) => parse(n)[1])).toEqual([1, 2, 3]);
    });

    it('gives every concurrent caller a unique number, with no gap in the sequence', async () => {
        const CONCURRENT_CALLS = 50;

        // The whole point of the atomic `$inc`: fired together, not awaited one at a time, so a
        // read-then-increment race would show up here as a duplicate or a skipped sequence value.
        const orderNumbers = await Promise.all(
            Array.from({ length: CONCURRENT_CALLS }, () => allocateOrderNumber())
        );
        const sequences = orderNumbers.map((n) => parse(n)[1]).toSorted((a, b) => a - b);

        expect(new Set(sequences).size).toBe(CONCURRENT_CALLS);
        expect(sequences).toEqual(Array.from({ length: CONCURRENT_CALLS }, (_, i) => i + 1));
    });

    it('starts a fresh sequence at 1 for a new UTC year, leaving the old year untouched', async () => {
        const firstYearNumber = await allocateOrderNumber();
        const [firstYear] = parse(firstYearNumber);

        // Only `Date` moves: this call still does a real Mongo round trip — see `@tests/clock`.
        freezeDate(Date.UTC(firstYear + 1, 0, 1));
        try {
            const nextYearNumber = await allocateOrderNumber();
            const [nextYear, nextSequence] = parse(nextYearNumber);

            expect(nextYear).toBe(firstYear + 1);
            expect(nextSequence).toBe(1);
        } finally {
            jest.useRealTimers();
        }

        // Back in the original year, the sequence resumes where it left off — the new year's
        // counter is a separate document, not a reset of this one.
        const backInFirstYear = await allocateOrderNumber();
        expect(parse(backInFirstYear)).toEqual([firstYear, 2]);
    });
});
