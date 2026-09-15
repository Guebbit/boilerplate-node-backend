/**
 * The catalogue's own boot gate: the two VAT rates, declared on this module's manifest and
 * range-checked by its `customCheck`.
 *
 * Driven through `assertRequiredConfig` rather than by calling `invalidVatRateConfig` directly —
 * the manifest wiring is half of what makes the check run at all, and a test that skipped it
 * would still pass with `customCheck` unset.
 *
 * Every case sets `NODE_ENV` away from `test` first: the gate short-circuits under the test
 * environment, so a suite that left it alone would assert nothing.
 */
import { assertRequiredConfig } from '@kernel/required-config';
import { vatRateDefault, vatRateReduced } from '../../config';
import productsModule from '../../module';

/** The variables this gate reads, restored after each case so ordering cannot matter. */
const TOUCHED = [
    'NODE_ENV',
    'NODE_URL',
    'NODE_VAT_RATE_DEFAULT',
    'NODE_VAT_RATE_REDUCED',
    'NODE_SMTP_HOST',
    'NODE_ANTIBOT_PROVIDER',
    'NODE_ANTIBOT_EMAIL_POLICY',
    'NODE_WEBHOOK_DEMO_SINK_URL'
] as const;

/** Every var in `TOUCHED` as it was found, so `afterEach` can restore an unset one as unset. */
const original = new Map(TOUCHED.map((key) => [key, process.env[key]]));

/** A deployment that satisfies every check, for a case to break one thing in. */
const configure = (): void => {
    process.env.NODE_ENV = 'development';
    process.env.NODE_URL = 'https://api.example.com/';
    process.env.NODE_VAT_RATE_DEFAULT = '0.22';
    process.env.NODE_VAT_RATE_REDUCED = '0.1';
    // The app-level and other modules' gates run in the same pass; this suite is about this
    // module's own variables, so the few that a developer's `.env` happens to set are cleared.
    delete process.env.NODE_SMTP_HOST;
    delete process.env.NODE_ANTIBOT_PROVIDER;
    delete process.env.NODE_ANTIBOT_EMAIL_POLICY;
    delete process.env.NODE_WEBHOOK_DEMO_SINK_URL;
};

afterEach(() => {
    for (const [key, value] of original)
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
});

describe('the VAT rate boot gate', () => {
    it('refuses to boot with neither rate set', () => {
        configure();
        delete process.env.NODE_VAT_RATE_DEFAULT;
        delete process.env.NODE_VAT_RATE_REDUCED;

        expect(() => assertRequiredConfig([productsModule])).toThrow(
            /NODE_VAT_RATE_DEFAULT.*NODE_VAT_RATE_REDUCED|NODE_VAT_RATE_REDUCED.*NODE_VAT_RATE_DEFAULT/
        );
    });

    it.each(['abc', '1', '1.5', '-0.1'])(
        'refuses a rate that does not parse into [0, 1) (%s)',
        (rate) => {
            configure();
            process.env.NODE_VAT_RATE_DEFAULT = rate;

            expect(() => assertRequiredConfig([productsModule])).toThrow(/NODE_VAT_RATE_DEFAULT/);
        }
    );

    it('accepts a rate of exactly 0 — a shop that charges no VAT at all', () => {
        configure();
        process.env.NODE_VAT_RATE_DEFAULT = '0';

        expect(() => assertRequiredConfig([productsModule])).not.toThrow();
    });

    it('accepts a fully configured catalogue', () => {
        configure();

        expect(() => assertRequiredConfig([productsModule])).not.toThrow();
    });
});

describe('reading the rates', () => {
    it('reads each rate per call, so a change needs no restart', () => {
        configure();
        process.env.NODE_VAT_RATE_DEFAULT = '0.05';

        expect(vatRateDefault()).toBe(0.05);
    });

    it('falls back for the test environment and the demo profile, which skip the gate', () => {
        configure();
        delete process.env.NODE_VAT_RATE_DEFAULT;
        delete process.env.NODE_VAT_RATE_REDUCED;

        expect(vatRateDefault()).toBe(0.22);
        expect(vatRateReduced()).toBe(0.1);
    });
});
