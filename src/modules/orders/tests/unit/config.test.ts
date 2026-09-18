/**
 * The shop identity this module prints on an invoice: `NODE_SHOP_COUNTRY` declared on the
 * manifest, and the two optional fields that are deliberately NOT. Also the bank-transfer payment
 * method's own deployment config — pure env reads, so the unit suite is enough; the boot-time
 * IBAN/BIC validation itself stays `payments/config.ts`'s own.
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
    shopCountry,
    shopLegalName,
    shopVatNumber
} from '../../config';
import ordersModule from '../../module';
import { withoutEnvironmentInThisFile } from '@tests/environment';

/** Every variable this gate reads, cleared before each case and put back after the file. */
const TOUCHED = [
    'NODE_SMTP_HOST',
    'NODE_ANTIBOT_PROVIDER',
    'NODE_ANTIBOT_EMAIL_POLICY',
    'NODE_WEBHOOK_DEMO_SINK_URL',
    'NODE_ENV',
    'NODE_URL',
    'NODE_SHOP_COUNTRY',
    'NODE_SHOP_VAT_NUMBER',
    'NODE_SHOP_LEGAL_NAME',
    'NODE_BANK_TRANSFER_BENEFICIARY',
    'NODE_BANK_TRANSFER_IBAN',
    'NODE_BANK_TRANSFER_BIC',
    'NODE_BANK_TRANSFER_HOLD_HOURS',
    'NODE_BANK_TRANSFER_MAX_OPEN_PER_ACCOUNT'
] as const;

withoutEnvironmentInThisFile(TOUCHED);

/** A deployment that satisfies every check, for a case to break one thing in. */
const configure = (): void => {
    process.env.NODE_ENV = 'development';
    process.env.NODE_URL = 'https://api.example.com/';
    process.env.NODE_SHOP_COUNTRY = 'IT';
};

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
