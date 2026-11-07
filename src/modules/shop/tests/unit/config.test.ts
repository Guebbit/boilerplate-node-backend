/**
 * @module
 * The shop's own settings — the VAT country it reads off the operator, the time zone, the operator's
 * phone it requires, the return address with its fallback to the operator's, who pays return
 * postage, the ship-to countries and the currency. Pure env reads, so the unit suite is enough.
 *
 * Driven through `assertModuleConfig` rather than by reading the manifest — the wiring is half
 * of what makes the check run at all.
 *
 * Every case sets `NODE_ENV` away from `test` first: the gate short-circuits under the test
 * environment, so a suite that left it alone would assert nothing.
 */
import { assertModuleConfig } from '@kernel/module-config';
import shopModule from '../../module';
import accountModule from '@modules/account/module';
import { operatorIdentity } from '@modules/account';
import { withoutEnvironmentInThisFile, setEnvironment } from '@tests/environment';
import {
    returnAddress,
    returnPostagePayer,
    shipToCountries,
    shopCountry,
    shopCurrency,
    shopTimezone,
    traderPhone
} from '../../service';

/** The operator variables the shop reads, each with a value that satisfies its rule. */
const IDENTITY = {
    NODE_LEGAL_NAME: 'Guebbit Demo Shop Srl',
    NODE_LEGAL_STREET: 'Via Roma 1',
    NODE_LEGAL_CITY: 'Milano',
    NODE_LEGAL_ZIP: '20100',
    NODE_LEGAL_PHONE: '+39 02 1234567'
} as const;

/** The identity a deployment sets besides {@link IDENTITY}. */
const COUNTRY = { NODE_LEGAL_COUNTRY: 'IT' } as const;

/** The names of {@link IDENTITY}, in declaration order. */
const IDENTITY_VARIABLES = Object.keys(IDENTITY) as (keyof typeof IDENTITY)[]; // `as`: Object.keys is string[]

/** Every variable this gate reads, cleared before each case and put back after the file. */
const TOUCHED = [
    'NODE_ENV',
    'NODE_URL',
    ...Object.keys(COUNTRY),
    'NODE_SHOP_TIMEZONE',
    ...IDENTITY_VARIABLES,
    'NODE_LEGAL_VAT_NUMBER',
    'NODE_LEGAL_EMAIL',
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
    setEnvironment(COUNTRY);
    setEnvironment({ NODE_SHOP_TIMEZONE: 'Europe/Rome' });
    setEnvironment(IDENTITY);
};

describe('reading the jurisdiction', () => {
    it('reads the field per call, so an override applies to the next read', () => {
        configure();
        setEnvironment({ NODE_LEGAL_COUNTRY: 'FR' });

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
        configure();

        expect(shipToCountries()).toEqual(['IT']);
    });

    it('reads the configured list over the shop country, upper-cased and trimmed', () => {
        configure();
        setEnvironment({ NODE_SHIP_TO_COUNTRIES: 'it, fr ,de' });

        expect(shipToCountries()).toEqual(['IT', 'FR', 'DE']);
    });
});

describe('the shop phone boot gate', () => {
    it('refuses to boot with no NODE_LEGAL_PHONE: a distance trader states a telephone number', () => {
        configure();
        setEnvironment({ NODE_LEGAL_PHONE: undefined });

        expect(() => assertModuleConfig([shopModule], [])).toThrow(/NODE_LEGAL_PHONE/);
    });

    it('boots with the phone set', () => {
        configure();

        expect(() => assertModuleConfig([shopModule], [])).not.toThrow();
    });

    it('is not asked of a deployment without the shop module', () => {
        configure();
        setEnvironment({ NODE_LEGAL_PHONE: undefined });

        expect(() => assertModuleConfig([], [])).not.toThrow();
    });
});

/**
 * The account module reduced to its own config slice (the first of its three). The other two
 * slices are the token and OAuth secrets, which have nothing to do with the phone rule.
 */
const accountSliceOnly = { ...accountModule, config: accountModule.config?.slice(0, 1) };

describe('the account phone rule, the other half of the split', () => {
    it('boots with no NODE_LEGAL_PHONE: the site is entitled to an operator, not to a telephone', () => {
        configure();
        setEnvironment({ NODE_LEGAL_PHONE: undefined });

        expect(() => assertModuleConfig([accountSliceOnly], [])).not.toThrow();
    });

    it('publishes an operator identity with no phone when none is set', () => {
        configure();
        setEnvironment({ NODE_LEGAL_PHONE: undefined });

        expect(operatorIdentity()).not.toHaveProperty('phone');
    });
});

describe('traderPhone', () => {
    it('reads the operator phone', () => {
        configure();

        expect(traderPhone()).toBe('+39 02 1234567');
    });

    it('throws a ConfigError when read unset, rather than print an empty notice', () => {
        configure();
        setEnvironment({ NODE_LEGAL_PHONE: undefined });

        expect(() => traderPhone()).toThrow(/NODE_LEGAL_PHONE/);
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
