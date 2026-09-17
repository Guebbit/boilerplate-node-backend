/**
 * @module
 * `resolveTaxRate` — every product resolves to SOME rate, this is the one place that decides
 * which. Restores the two rate env vars after each case so the suite-wide fallback set by
 * `tests/support/setup.ts` cannot leak between cases here.
 */
import { resolveTaxRate } from '../../tax';

const ORIGINAL = {
    default: process.env.NODE_VAT_RATE_DEFAULT,
    reduced: process.env.NODE_VAT_RATE_REDUCED
};

afterEach(() => {
    process.env.NODE_VAT_RATE_DEFAULT = ORIGINAL.default;
    process.env.NODE_VAT_RATE_REDUCED = ORIGINAL.reduced;
});

describe('resolveTaxRate', () => {
    it('resolves an absent tax class to the shop default', () => {
        process.env.NODE_VAT_RATE_DEFAULT = '0.22';

        expect(resolveTaxRate(undefined)).toBe(0.22);
    });

    it('resolves "reduced" to the reduced rate, not the default', () => {
        process.env.NODE_VAT_RATE_DEFAULT = '0.22';
        process.env.NODE_VAT_RATE_REDUCED = '0.1';

        expect(resolveTaxRate('reduced')).toBe(0.1);
    });

    it('resolves "zero" to 0, regardless of configuration', () => {
        process.env.NODE_VAT_RATE_DEFAULT = '0.22';
        process.env.NODE_VAT_RATE_REDUCED = '0.1';

        expect(resolveTaxRate('zero')).toBe(0);
    });

    it('never returns undefined — every product resolves to a real rate', () => {
        for (const taxClass of [undefined, 'reduced', 'zero'] as const)
            expect(typeof resolveTaxRate(taxClass)).toBe('number');
    });
});
