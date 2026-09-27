/**
 * The shop's own jurisdiction (`NODE_SHOP_COUNTRY`, declared on the manifest) and the bank-transfer
 * payment method's own deployment config — pure env reads, so the unit suite is enough; the
 * boot-time IBAN/BIC validation itself stays `payments/config.ts`'s own. The shop's LEGAL identity
 * for invoicing (legal name, VAT number, street address) is `@modules/invoicing`'s own config —
 * see that module's `tests/unit/config.test.ts`.
 *
 * Driven through `assertRequiredConfig` rather than by reading the manifest — the wiring is half
 * of what makes the check run at all.
 *
 * Every case sets `NODE_ENV` away from `test` first: the gate short-circuits under the test
 * environment, so a suite that left it alone would assert nothing.
 */
import { assertRequiredConfig } from '@kernel/required-config';
import {
    bankTransferBeneficiary,
    bankTransferBic,
    bankTransferEnabled,
    bankTransferHoldHours,
    bankTransferIban,
    bankTransferIbanFriendly,
    bankTransferMaxOpenPerAccount,
    orderFrontendLink,
    shipToCountries,
    shopCountry
} from '../../config';
import ordersModule from '../../module';
import { withoutEnvironmentInThisFile } from '@tests/environment';

/** Every variable this gate reads, cleared before each case and put back after the file. */
const TOUCHED = [
    'NODE_ENV',
    'NODE_URL',
    'NODE_SHOP_COUNTRY',
    'NODE_SHIP_TO_COUNTRIES',
    'NODE_BANK_TRANSFER_BENEFICIARY',
    'NODE_BANK_TRANSFER_IBAN',
    'NODE_BANK_TRANSFER_BIC',
    'NODE_BANK_TRANSFER_HOLD_HOURS',
    'NODE_BANK_TRANSFER_MAX_OPEN_PER_ACCOUNT',
    'NODE_FRONTEND_LINK_ORDER',
    'NODE_FRONTEND_URL'
] as const;

withoutEnvironmentInThisFile(TOUCHED);

/** A deployment that satisfies every check, for a case to break one thing in. */
const configure = (): void => {
    process.env.NODE_ENV = 'development';
    process.env.NODE_URL = 'https://api.example.com/';
    process.env.NODE_SHOP_COUNTRY = 'IT';
};

describe('the shop jurisdiction boot gate', () => {
    it('refuses to boot with no NODE_SHOP_COUNTRY — a checkout with no VAT jurisdiction is not one', () => {
        configure();
        delete process.env.NODE_SHOP_COUNTRY;

        expect(() => assertRequiredConfig([ordersModule])).toThrow(/NODE_SHOP_COUNTRY/);
    });
});

describe('reading the jurisdiction', () => {
    it('reads the field per call, so a correction needs no restart', () => {
        configure();
        process.env.NODE_SHOP_COUNTRY = 'FR';

        expect(shopCountry()).toBe('FR');
    });
});

describe('shipToCountries', () => {
    it("defaults to the shop's own country alone", () => {
        process.env.NODE_SHOP_COUNTRY = 'IT';

        expect(shipToCountries()).toEqual(['IT']);
    });

    it('is empty when neither variable is set', () => {
        delete process.env.NODE_SHOP_COUNTRY;

        expect(shipToCountries()).toEqual([]);
    });

    it('reads the configured list over the shop country, upper-cased and trimmed', () => {
        process.env.NODE_SHOP_COUNTRY = 'IT';
        process.env.NODE_SHIP_TO_COUNTRIES = 'it, fr ,de';

        expect(shipToCountries()).toEqual(['IT', 'FR', 'DE']);
    });
});

describe('bankTransferEnabled', () => {
    it('is false with neither variable set', () => {
        expect(bankTransferEnabled()).toBe(false);
    });

    it('is false with only the beneficiary set', () => {
        process.env.NODE_BANK_TRANSFER_BENEFICIARY = 'Guebbit Shop';
        expect(bankTransferEnabled()).toBe(false);
    });

    it('is false with only the IBAN set', () => {
        process.env.NODE_BANK_TRANSFER_IBAN = 'DE89370400440532013000';
        expect(bankTransferEnabled()).toBe(false);
    });

    it('is true once both are set', () => {
        process.env.NODE_BANK_TRANSFER_BENEFICIARY = 'Guebbit Shop';
        process.env.NODE_BANK_TRANSFER_IBAN = 'DE89370400440532013000';
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
        process.env.NODE_BANK_TRANSFER_BIC = 'COBADEFFXXX';
        expect(bankTransferBic()).toBe('COBADEFFXXX');
    });
});

describe('bankTransferIbanFriendly', () => {
    it('is undefined when no IBAN is configured', () => {
        expect(bankTransferIbanFriendly()).toBeUndefined();
    });

    it('groups the IBAN into 4-character blocks', () => {
        process.env.NODE_BANK_TRANSFER_IBAN = 'DE89370400440532013000';
        expect(bankTransferIbanFriendly()).toBe('DE89 3704 0044 0532 0130 00');
    });

    it('re-groups a value already typed with spaces, rather than doubling them', () => {
        process.env.NODE_BANK_TRANSFER_IBAN = 'DE89 3704 0044 0532 0130 00';
        expect(bankTransferIbanFriendly()).toBe('DE89 3704 0044 0532 0130 00');
    });
});

describe('bankTransferHoldHours', () => {
    it('defaults to 168 (a week)', () => {
        expect(bankTransferHoldHours()).toBe(168);
    });

    it('reads NODE_BANK_TRANSFER_HOLD_HOURS when set', () => {
        process.env.NODE_BANK_TRANSFER_HOLD_HOURS = '48';
        expect(bankTransferHoldHours()).toBe(48);
    });
});

describe('bankTransferMaxOpenPerAccount', () => {
    it('defaults to 2', () => {
        expect(bankTransferMaxOpenPerAccount()).toBe(2);
    });

    it('reads NODE_BANK_TRANSFER_MAX_OPEN_PER_ACCOUNT when set', () => {
        process.env.NODE_BANK_TRANSFER_MAX_OPEN_PER_ACCOUNT = '5';
        expect(bankTransferMaxOpenPerAccount()).toBe(5);
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
        process.env.NODE_FRONTEND_LINK_ORDER = 'my-orders/{id}/details';

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
