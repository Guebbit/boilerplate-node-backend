/**
 * The shop identity this module prints on an invoice: `NODE_SHOP_COUNTRY` declared on the
 * manifest, and the two optional fields that are deliberately NOT.
 *
 * Driven through `assertRequiredConfig` rather than by reading the manifest — the wiring is half
 * of what makes the check run at all.
 *
 * Every case sets `NODE_ENV` away from `test` first: the gate short-circuits under the test
 * environment, so a suite that left it alone would assert nothing.
 */
import { assertRequiredConfig } from '@kernel/required-config';
import { shopCountry, shopLegalName, shopVatNumber } from '../../config';
import ordersModule from '../../module';

/** The variables this gate reads, restored after each case so ordering cannot matter. */
const TOUCHED = [
    'NODE_SMTP_HOST',
    'NODE_ANTIBOT_PROVIDER',
    'NODE_ANTIBOT_EMAIL_POLICY',
    'NODE_WEBHOOK_DEMO_SINK_URL',
    'NODE_ENV',
    'NODE_URL',
    'NODE_SHOP_COUNTRY',
    'NODE_SHOP_VAT_NUMBER',
    'NODE_SHOP_LEGAL_NAME'
] as const;

/** Every var in `TOUCHED` as it was found, so `afterEach` can restore an unset one as unset. */
const original = new Map(TOUCHED.map((key) => [key, process.env[key]]));

/** A deployment that satisfies every check, for a case to break one thing in. */
const configure = (): void => {
    process.env.NODE_ENV = 'development';
    process.env.NODE_URL = 'https://api.example.com/';
    process.env.NODE_SHOP_COUNTRY = 'IT';
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

describe('the shop identity boot gate', () => {
    it('refuses to boot with no NODE_SHOP_COUNTRY — an invoice with no jurisdiction is not one', () => {
        configure();
        delete process.env.NODE_SHOP_COUNTRY;

        expect(() => assertRequiredConfig([ordersModule])).toThrow(/NODE_SHOP_COUNTRY/);
    });

    it('boots with neither optional identity field set', () => {
        configure();
        delete process.env.NODE_SHOP_VAT_NUMBER;
        delete process.env.NODE_SHOP_LEGAL_NAME;

        expect(() => assertRequiredConfig([ordersModule])).not.toThrow();
    });
});

describe('reading the identity', () => {
    it('reads each field per call, so a correction needs no restart', () => {
        configure();
        process.env.NODE_SHOP_COUNTRY = 'FR';

        expect(shopCountry()).toBe('FR');
    });

    it.each([
        ['NODE_SHOP_VAT_NUMBER', shopVatNumber],
        ['NODE_SHOP_LEGAL_NAME', shopLegalName]
    ] as const)('reads an empty %s as absent, never as an empty string', (key, read) => {
        configure();
        process.env[key] = '';

        // The invoice template omits the row entirely on `undefined`; `''` would render a blank one.
        expect(read()).toBeUndefined();
    });
});
