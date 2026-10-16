/**
 * `src/infrastructure/persistence/yearly-counter.ts` — the printed form of a yearly number.
 * The atomic increment itself is proven against a real database by the order and invoice
 * numbering suites.
 */
import { formatYearlySequence } from '@infrastructure/persistence/yearly-counter';

describe('formatYearlySequence', () => {
    it('writes the year, a dash and a six-digit zero-padded sequence', () => {
        expect(formatYearlySequence(2026, 41)).toBe('2026-000041');
    });

    it('does not truncate a sequence wider than the padding', () => {
        expect(formatYearlySequence(2026, 1_234_567)).toBe('2026-1234567');
    });
});
