/**
 * @module
 * The shop's own settings — jurisdiction, time zone, identity (legal name, address, email, phone),
 * the return address with its fallback to it, who pays return postage, the ship-to countries and
 * the currency. Pure env reads, so the unit suite is enough.
 *
 * Driven through `assertModuleConfig` rather than by reading the manifest — the wiring is half
 * of what makes the check run at all.
 *
 * Every case sets `NODE_ENV` away from `test` first: the gate short-circuits under the test
 * environment, so a suite that left it alone would assert nothing.
 */
import { assertModuleConfig } from '@kernel/module-config';
import shopModule from '../../module';
import { withoutEnvironmentInThisFile, setEnvironment } from '@tests/environment';
import {
    returnAddress,
    returnPostagePayer,
    shipToCountries,
    shopCountry,
    shopCurrency,
    shopIdentity,
    shopTimezone
} from '../../service';

/** The required identity variables, each with a value that satisfies its rule. */
const IDENTITY = {
    NODE_SHOP_LEGAL_NAME: 'Guebbit Demo Shop Srl',
    NODE_SHOP_STREET: 'Via Roma 1',
    NODE_SHOP_CITY: 'Milano',
    NODE_SHOP_ZIP: '20100',
    NODE_SHOP_EMAIL: 'shop@example.com',
    NODE_SHOP_PHONE: '+39 02 1234567'
} as const;

/** The names of {@link IDENTITY}, in declaration order. */
const IDENTITY_VARIABLES = Object.keys(IDENTITY) as (keyof typeof IDENTITY)[]; // `as`: Object.keys is string[]

/** Every variable this gate reads, cleared before each case and put back after the file. */
const TOUCHED = [
    'NODE_ENV',
    'NODE_URL',
    'NODE_SHOP_COUNTRY',
    'NODE_SHOP_TIMEZONE',
    ...IDENTITY_VARIABLES,
    'NODE_SHOP_VAT_NUMBER',
    'NODE_RETURN_ADDRESS_NAME',
    'NODE_RETURN_ADDRESS_STREET',
    'NODE_RETURN_ADDRESS_CITY',
    'NODE_RETURN_ADDRESS_ZIP',
    'NODE_RETURN_ADDRESS_COUNTRY',
    'NODE_RETURN_POSTAGE_PAYER',
    'NODE_SHIP_TO_COUNTRIES',
    'NODE_DEFAULT_CURRENCY'
] as const;

withoutEnvironmentInThisFile(TOUCHED);

/** A deployment that satisfies every check, for a case to break one thing in. */
const configure = (): void => {
    setEnvironment({ NODE_ENV: 'development' });
    setEnvironment({ NODE_URL: 'https://api.example.com/' });
    setEnvironment({ NODE_SHOP_COUNTRY: 'IT' });
    setEnvironment({ NODE_SHOP_TIMEZONE: 'Europe/Rome' });
    setEnvironment(IDENTITY);
};

describe('the shop jurisdiction boot gate', () => {
    it('refuses to boot with no NODE_SHOP_COUNTRY — a checkout with no VAT jurisdiction is not one', () => {
        configure();
        setEnvironment({ NODE_SHOP_COUNTRY: undefined });

        expect(() => assertModuleConfig([shopModule], [])).toThrow(/NODE_SHOP_COUNTRY/);
    });
});

describe('reading the jurisdiction', () => {
    it('reads the field per call, so an override applies to the next read', () => {
        configure();
        setEnvironment({ NODE_SHOP_COUNTRY: 'FR' });

        expect(shopCountry()).toBe('FR');
    });
});

describe('the shop time zone', () => {
    it('refuses to boot with no NODE_SHOP_TIMEZONE', () => {
        configure();
        setEnvironment({ NODE_SHOP_TIMEZONE: undefined });

        expect(() => assertModuleConfig([shopModule], [])).toThrow(/NODE_SHOP_TIMEZONE/);
    });

    it('refuses a fixed offset, which ignores summer time', () => {
        configure();
        setEnvironment({ NODE_SHOP_TIMEZONE: '+01:00' });

        expect(() => assertModuleConfig([shopModule], [])).toThrow(/NODE_SHOP_TIMEZONE/);
    });

    it('reads the canonical name per call', () => {
        configure();
        setEnvironment({ NODE_SHOP_TIMEZONE: 'europe/rome' });

        expect(shopTimezone()).toBe('Europe/Rome');
    });

    it('throws a ConfigError when read unset', () => {
        setEnvironment({ NODE_SHOP_TIMEZONE: undefined });

        expect(() => shopTimezone()).toThrow(/NODE_SHOP_TIMEZONE/);
    });
});

describe('shipToCountries', () => {
    it("defaults to the shop's own country alone", () => {
        setEnvironment({ NODE_SHOP_COUNTRY: 'IT' });

        expect(shipToCountries()).toEqual(['IT']);
    });

    it('is empty when neither variable is set', () => {
        setEnvironment({ NODE_SHOP_COUNTRY: undefined });

        expect(shipToCountries()).toEqual([]);
    });

    it('reads the configured list over the shop country, upper-cased and trimmed', () => {
        setEnvironment({ NODE_SHOP_COUNTRY: 'IT' });
        setEnvironment({ NODE_SHIP_TO_COUNTRIES: 'it, fr ,de' });

        expect(shipToCountries()).toEqual(['IT', 'FR', 'DE']);
    });
});

describe('the shop identity boot gate', () => {
    it.each(IDENTITY_VARIABLES)('refuses to boot with no %s', (name) => {
        configure();
        setEnvironment({ [name]: undefined });

        expect(() => assertModuleConfig([shopModule], [])).toThrow(new RegExp(name));
    });

    it('does not require the VAT number', () => {
        configure();

        expect(() => assertModuleConfig([shopModule], [])).not.toThrow();
    });

    it('refuses an email that is not one', () => {
        configure();
        setEnvironment({ NODE_SHOP_EMAIL: 'not-an-address' });

        expect(() => assertModuleConfig([shopModule], [])).toThrow(/NODE_SHOP_EMAIL/);
    });
});

describe('shopIdentity', () => {
    it('reads every field, leaving the VAT number out when unset', () => {
        configure();

        expect(shopIdentity()).toEqual({
            legalName: 'Guebbit Demo Shop Srl',
            street: 'Via Roma 1',
            city: 'Milano',
            zip: '20100',
            country: 'IT',
            email: 'shop@example.com',
            phone: '+39 02 1234567'
        });
    });

    it('carries the VAT number when set', () => {
        configure();
        setEnvironment({ NODE_SHOP_VAT_NUMBER: 'IT12345678901' });

        expect(shopIdentity().vatNumber).toBe('IT12345678901');
    });

    it('refuses to answer with a required field unset, rather than print an empty notice', () => {
        configure();
        setEnvironment({ NODE_SHOP_PHONE: undefined });

        expect(() => shopIdentity()).toThrow(/NODE_SHOP_PHONE/);
    });
});

describe('returnAddress', () => {
    it('is the shop address when no return address is configured', () => {
        configure();

        expect(returnAddress()).toEqual({
            name: 'Guebbit Demo Shop Srl',
            street: 'Via Roma 1',
            city: 'Milano',
            zip: '20100',
            country: 'IT'
        });
    });

    it('is the configured address, country upper-cased', () => {
        configure();
        setEnvironment({ NODE_RETURN_ADDRESS_NAME: 'Returns dept' });
        setEnvironment({ NODE_RETURN_ADDRESS_STREET: 'Via Torino 9' });
        setEnvironment({ NODE_RETURN_ADDRESS_CITY: 'Torino' });
        setEnvironment({ NODE_RETURN_ADDRESS_ZIP: '10100' });
        setEnvironment({ NODE_RETURN_ADDRESS_COUNTRY: 'it' });

        expect(returnAddress()).toEqual({
            name: 'Returns dept',
            street: 'Via Torino 9',
            city: 'Torino',
            zip: '10100',
            country: 'IT'
        });
    });

    it('reads a partly-set return address as unset, and falls back to the shop address', () => {
        configure();
        setEnvironment({ NODE_RETURN_ADDRESS_STREET: 'Via Torino 9' });

        expect(returnAddress().street).toBe('Via Roma 1');
    });
});

describe('returnPostagePayer', () => {
    it('is the consumer unless the shop says otherwise: Art. 14(1)’s default', () => {
        expect(returnPostagePayer()).toBe('consumer');
    });

    it('is the shop when a deployment offers free returns', () => {
        setEnvironment({ NODE_RETURN_POSTAGE_PAYER: 'shop' });

        expect(returnPostagePayer()).toBe('shop');
    });

    it('refuses a value that is neither, rather than guessing who pays', () => {
        setEnvironment({ NODE_RETURN_POSTAGE_PAYER: 'nobody' });

        expect(() => returnPostagePayer()).toThrow(/NODE_RETURN_POSTAGE_PAYER/);
    });
});

describe('shopCurrency', () => {
    it('defaults to EUR', () => {
        expect(shopCurrency()).toBe('EUR');
    });

    it('reads NODE_DEFAULT_CURRENCY, the variable the infrastructure slice declares', () => {
        setEnvironment({ NODE_DEFAULT_CURRENCY: 'GBP' });

        expect(shopCurrency()).toBe('GBP');
    });

    it('upper-cases a lower-case code, so every order and payment freezes the same spelling', () => {
        setEnvironment({ NODE_DEFAULT_CURRENCY: 'eur' });

        expect(shopCurrency()).toBe('EUR');
    });

    it.each(['EURO', 'XYZ'])('refuses %s at boot, the code no provider would ever echo', (code) => {
        configure();
        setEnvironment({ NODE_DEFAULT_CURRENCY: code });

        expect(() => assertModuleConfig([shopModule], [])).toThrow(/NODE_DEFAULT_CURRENCY/);
    });
});
