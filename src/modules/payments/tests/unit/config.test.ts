/**
 * `payments/config.ts` — `listPaymentMethods` (what `GET /payments/methods` and checkout both
 * defer to) and `validateBankTransferConfig` (a boot-time check of the slice, run through
 * `ibantools`). Both are pure reads over the environment, so no database is needed.
 */
import {
    bankTransferBeneficiary,
    bankTransferBic,
    bankTransferEnabled,
    bankTransferHoldHours,
    bankTransferIban,
    bankTransferIbanFriendly,
    listPaymentMethods,
    validateBankTransferConfig
} from '../../config';
import { withoutEnvironmentInThisFile, setEnvironment } from '@tests/environment';

/** Sets both variables `bankTransferEnabled()` requires. */
const configureBankTransfer = () => {
    setEnvironment({ NODE_BANK_TRANSFER_BENEFICIARY: 'Guebbit Shop' });
    setEnvironment({ NODE_BANK_TRANSFER_IBAN: 'DE89370400440532013000' });
};

/**
 * Every variable these cases drive, cleared before each one and put back after the file.
 *
 * `tests/support/setup-environment.ts` configures bank transfer for the whole worker — the `shop` scenario
 * declares a guarantee that needs it offered — so "not configured at all" is a state this file has
 * to create rather than one it can assume.
 */
const TOUCHED = [
    'NODE_BANK_TRANSFER_BENEFICIARY',
    'NODE_BANK_TRANSFER_IBAN',
    'NODE_BANK_TRANSFER_BIC',
    'NODE_BANK_TRANSFER_HOLD_HOURS'
] as const;

withoutEnvironmentInThisFile(TOUCHED);

describe('listPaymentMethods', () => {
    it('offers only card when transfer is not configured', () => {
        expect(listPaymentMethods()).toEqual([{ id: 'card' }]);
    });

    it('offers bank_transfer too, with its hold-hours, once configured', () => {
        configureBankTransfer();
        expect(listPaymentMethods()).toEqual([
            { id: 'card' },
            { id: 'bank_transfer', holdHours: 168 }
        ]);
    });

    it('reflects a non-default hold length', () => {
        configureBankTransfer();
        setEnvironment({ NODE_BANK_TRANSFER_HOLD_HOURS: '48' });
        expect(listPaymentMethods()).toEqual([
            { id: 'card' },
            { id: 'bank_transfer', holdHours: 48 }
        ]);
    });

    it('leaves card out when no provider is configured', () => {
        setEnvironment({ NODE_PAYMENT_PROVIDER: undefined });
        configureBankTransfer();
        expect(listPaymentMethods()).toEqual([{ id: 'bank_transfer', holdHours: 168 }]);
    });

    it('offers nothing at all with no provider and no transfer: checkout is off', () => {
        setEnvironment({ NODE_PAYMENT_PROVIDER: undefined });
        expect(listPaymentMethods()).toEqual([]);
    });
});

describe('validateBankTransferConfig', () => {
    it('reports nothing when transfer is fully unconfigured', () => {
        expect(validateBankTransferConfig()).toEqual([]);
    });

    it('reports nothing for a valid IBAN and beneficiary', () => {
        configureBankTransfer();
        expect(validateBankTransferConfig()).toEqual([]);
    });

    it('refuses an IBAN with no beneficiary', () => {
        setEnvironment({ NODE_BANK_TRANSFER_IBAN: 'DE89370400440532013000' });
        expect(validateBankTransferConfig()).toEqual(['NODE_BANK_TRANSFER_BENEFICIARY']);
    });

    it('refuses a malformed IBAN', () => {
        setEnvironment({ NODE_BANK_TRANSFER_BENEFICIARY: 'Guebbit Shop' });
        setEnvironment({ NODE_BANK_TRANSFER_IBAN: 'not-an-iban' });
        expect(validateBankTransferConfig()).toEqual(['NODE_BANK_TRANSFER_IBAN']);
    });

    it('accepts an IBAN typed with spaces, same as ibantools does', () => {
        setEnvironment({ NODE_BANK_TRANSFER_BENEFICIARY: 'Guebbit Shop' });
        setEnvironment({ NODE_BANK_TRANSFER_IBAN: 'DE89 3704 0044 0532 0130 00' });
        expect(validateBankTransferConfig()).toEqual([]);
    });

    it('refuses a malformed BIC', () => {
        configureBankTransfer();
        setEnvironment({ NODE_BANK_TRANSFER_BIC: 'not-a-bic' });
        expect(validateBankTransferConfig()).toEqual(['NODE_BANK_TRANSFER_BIC']);
    });

    it('accepts a valid BIC', () => {
        configureBankTransfer();
        setEnvironment({ NODE_BANK_TRANSFER_BIC: 'COBADEFFXXX' });
        expect(validateBankTransferConfig()).toEqual([]);
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
