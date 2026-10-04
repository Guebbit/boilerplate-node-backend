/**
 * The shop's own jurisdiction (`NODE_SHOP_COUNTRY`, declared on the manifest) and the bank-transfer
 * payment method's own deployment config — pure env reads, so the unit suite is enough; the
 * boot-time IBAN/BIC validation itself stays `payments/config.ts`'s own. Also the shop's identity
 * (legal name, address, email, phone), the return address with its fallback to it, and who pays
 * return postage.
 *
 * Driven through `assertModuleConfig` rather than by reading the manifest — the wiring is half
 * of what makes the check run at all.
 *
 * Every case sets `NODE_ENV` away from `test` first: the gate short-circuits under the test
 * environment, so a suite that left it alone would assert nothing.
 */
import { assertModuleConfig } from '@kernel/module-config';
import {
    bankTransferBeneficiary,
    bankTransferBic,
    bankTransferEnabled,
    bankTransferHoldHours,
    bankTransferIban,
    bankTransferIbanFriendly,
    maxOpenUnpaidOrdersPerAccount,
    orderFrontendLink,
    returnAddress,
    returnPostagePayer,
    shipToCountries,
    withdrawalPeriodDays,
    shopCountry,
    shopIdentity
} from '../../config';
import ordersModule from '../../module';
import { withoutEnvironmentInThisFile, setEnvironment } from '@tests/environment';

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
    ...IDENTITY_VARIABLES,
    'NODE_SHOP_VAT_NUMBER',
    'NODE_RETURN_ADDRESS_NAME',
    'NODE_RETURN_ADDRESS_STREET',
    'NODE_RETURN_ADDRESS_CITY',
    'NODE_RETURN_ADDRESS_ZIP',
    'NODE_RETURN_ADDRESS_COUNTRY',
    'NODE_RETURN_POSTAGE_PAYER',
    'NODE_SHIP_TO_COUNTRIES',
    'NODE_BANK_TRANSFER_BENEFICIARY',
    'NODE_BANK_TRANSFER_IBAN',
    'NODE_BANK_TRANSFER_BIC',
    'NODE_BANK_TRANSFER_HOLD_HOURS',
    'NODE_MAX_OPEN_UNPAID_ORDERS_PER_ACCOUNT',
    'NODE_FRONTEND_LINK_ORDER',
    'NODE_FRONTEND_URL',
    'NODE_WITHDRAWAL_PERIOD_DAYS'
] as const;

withoutEnvironmentInThisFile(TOUCHED);

/** A deployment that satisfies every check, for a case to break one thing in. */
const configure = (): void => {
    setEnvironment({ NODE_ENV: 'development' });
    setEnvironment({ NODE_URL: 'https://api.example.com/' });
    setEnvironment({ NODE_SHOP_COUNTRY: 'IT' });
    setEnvironment(IDENTITY);
};

describe('the shop jurisdiction boot gate', () => {
    it('refuses to boot with no NODE_SHOP_COUNTRY — a checkout with no VAT jurisdiction is not one', () => {
        configure();
        setEnvironment({ NODE_SHOP_COUNTRY: undefined });

        expect(() => assertModuleConfig([ordersModule], [])).toThrow(/NODE_SHOP_COUNTRY/);
    });
});

describe('reading the jurisdiction', () => {
    it('reads the field per call, so an override applies to the next read', () => {
        configure();
        setEnvironment({ NODE_SHOP_COUNTRY: 'FR' });

        expect(shopCountry()).toBe('FR');
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

describe('bankTransferEnabled', () => {
    it('is false with neither variable set', () => {
        expect(bankTransferEnabled()).toBe(false);
    });

    it('is false with only the beneficiary set', () => {
        setEnvironment({ NODE_BANK_TRANSFER_BENEFICIARY: 'Guebbit Shop' });
        expect(bankTransferEnabled()).toBe(false);
    });

    it('is false with only the IBAN set', () => {
        setEnvironment({ NODE_BANK_TRANSFER_IBAN: 'DE89370400440532013000' });
        expect(bankTransferEnabled()).toBe(false);
    });

    it('is true once both are set', () => {
        setEnvironment({ NODE_BANK_TRANSFER_BENEFICIARY: 'Guebbit Shop' });
        setEnvironment({ NODE_BANK_TRANSFER_IBAN: 'DE89370400440532013000' });
        expect(bankTransferEnabled()).toBe(true);
    });
});

describe('bankTransferBeneficiary / bankTransferIban / bankTransferBic', () => {
    it('answer undefined when unset', () => {
        expect(bankTransferBeneficiary()).toBeUndefined();
        expect(bankTransferIban()).toBeUndefined();
        expect(bankTransferBic()).toBeUndefined();
    });

    it('answer the configured value', () => {
        setEnvironment({ NODE_BANK_TRANSFER_BIC: 'COBADEFFXXX' });
        expect(bankTransferBic()).toBe('COBADEFFXXX');
    });
});

describe('bankTransferIbanFriendly', () => {
    it('is undefined when no IBAN is configured', () => {
        expect(bankTransferIbanFriendly()).toBeUndefined();
    });

    it('groups the IBAN into 4-character blocks', () => {
        setEnvironment({ NODE_BANK_TRANSFER_IBAN: 'DE89370400440532013000' });
        expect(bankTransferIbanFriendly()).toBe('DE89 3704 0044 0532 0130 00');
    });

    it('re-groups a value already typed with spaces, rather than doubling them', () => {
        setEnvironment({ NODE_BANK_TRANSFER_IBAN: 'DE89 3704 0044 0532 0130 00' });
        expect(bankTransferIbanFriendly()).toBe('DE89 3704 0044 0532 0130 00');
    });
});

describe('bankTransferHoldHours', () => {
    it('defaults to 168 (a week)', () => {
        expect(bankTransferHoldHours()).toBe(168);
    });

    it('reads NODE_BANK_TRANSFER_HOLD_HOURS when set', () => {
        setEnvironment({ NODE_BANK_TRANSFER_HOLD_HOURS: '48' });
        expect(bankTransferHoldHours()).toBe(48);
    });
});

describe('maxOpenUnpaidOrdersPerAccount', () => {
    it('defaults to 2, so a failed card can be retried while its hold runs out', () => {
        expect(maxOpenUnpaidOrdersPerAccount()).toBe(2);
    });

    it('reads NODE_MAX_OPEN_UNPAID_ORDERS_PER_ACCOUNT when set', () => {
        setEnvironment({ NODE_MAX_OPEN_UNPAID_ORDERS_PER_ACCOUNT: '5' });
        expect(maxOpenUnpaidOrdersPerAccount()).toBe(5);
    });

    // 0 would refuse every checkout: an account must be able to hold at least the order it places.
    it('refuses a ceiling below 1', () => {
        setEnvironment({ NODE_MAX_OPEN_UNPAID_ORDERS_PER_ACCOUNT: '0' });
        expect(() => maxOpenUnpaidOrdersPerAccount()).toThrow();
    });
});

/**
 * `orderFrontendLink` — this module's own D14 fix: `infrastructure/http/frontend-link.ts` only
 * turns a resolved template into a URL, so the default template and its env-var override live
 * here, not in infrastructure.
 */
describe('orderFrontendLink', () => {
    it('builds the order link off the default template, id in the path, no query string', () => {
        expect(orderFrontendLink({ locale: 'en', id: 'order-1' })).toBe(
            'http://localhost:8080/en/orders/order-1'
        );
    });

    it('lets a deployment override the template without touching account links', () => {
        setEnvironment({ NODE_FRONTEND_LINK_ORDER: 'my-orders/{id}/details' });

        expect(orderFrontendLink({ locale: 'en', id: 'order-1' })).toBe(
            'http://localhost:8080/en/my-orders/order-1/details'
        );
    });

    it('URL-encodes the id', () => {
        expect(orderFrontendLink({ locale: 'en', id: 'order 1/2' })).toBe(
            'http://localhost:8080/en/orders/order%201%2F2'
        );
    });
});

describe('the shop identity boot gate', () => {
    it.each(IDENTITY_VARIABLES)('refuses to boot with no %s', (name) => {
        configure();
        setEnvironment({ [name]: undefined });

        expect(() => assertModuleConfig([ordersModule], [])).toThrow(new RegExp(name));
    });

    it('does not require the VAT number', () => {
        configure();

        expect(() => assertModuleConfig([ordersModule], [])).not.toThrow();
    });

    it('refuses an email that is not one', () => {
        configure();
        setEnvironment({ NODE_SHOP_EMAIL: 'not-an-address' });

        expect(() => assertModuleConfig([ordersModule], [])).toThrow(/NODE_SHOP_EMAIL/);
    });
});

describe('the withdrawal period', () => {
    it('reads 30 when unset', () => {
        expect(withdrawalPeriodDays()).toBe(30);
    });

    it('refuses 20 at boot: less than the law plus the longest roll-over', () => {
        configure();
        setEnvironment({ NODE_WITHDRAWAL_PERIOD_DAYS: '20' });

        expect(() => assertModuleConfig([ordersModule], [])).toThrow(/NODE_WITHDRAWAL_PERIOD_DAYS/);
    });

    it('accepts 21 at boot and reads it back', () => {
        configure();
        setEnvironment({ NODE_WITHDRAWAL_PERIOD_DAYS: '21' });

        expect(() => assertModuleConfig([ordersModule], [])).not.toThrow();
        expect(withdrawalPeriodDays()).toBe(21);
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
