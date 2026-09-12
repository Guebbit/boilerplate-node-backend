/**
 * `payments/config.ts` — `listPaymentMethods` (what `GET /payments/methods` and checkout both
 * defer to) and `validateBankTransferConfig` (this module's boot-time `customCheck`, run through
 * `ibantools`). Both are pure reads over the environment, so no database is needed.
 */
import { listPaymentMethods, validateBankTransferConfig } from '../../config';

/** Sets both variables `bankTransferEnabled()` requires. */
const configureBankTransfer = () => {
    process.env.NODE_BANK_TRANSFER_BENEFICIARY = 'Guebbit Shop';
    process.env.NODE_BANK_TRANSFER_IBAN = 'DE89370400440532013000';
};

/**
 * The variables these cases drive, saved and put back around every one.
 *
 * Saved rather than deleted: `tests/support/setup.ts` configures bank transfer for the whole
 * worker (the `shop` scenario declares a guarantee that needs it offered), and `process.env` is
 * shared by every suite that worker runs. Clearing in `beforeEach` is what lets a case start from
 * "not configured" at all.
 */
const TOUCHED = [
    'NODE_BANK_TRANSFER_BENEFICIARY',
    'NODE_BANK_TRANSFER_IBAN',
    'NODE_BANK_TRANSFER_BIC',
    'NODE_BANK_TRANSFER_HOLD_HOURS',
    'NODE_BANK_TRANSFER_MAX_OPEN_PER_ACCOUNT'
] as const;

/** Each variable as the worker had it, so `afterEach` can restore an unset one as unset. */
const original = new Map(TOUCHED.map((key) => [key, process.env[key]]));

beforeEach(() => {
    for (const key of TOUCHED) delete process.env[key];
});

afterEach(() => {
    for (const key of TOUCHED) {
        const value = original.get(key);
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
});

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
        process.env.NODE_BANK_TRANSFER_HOLD_HOURS = '48';
        expect(listPaymentMethods()).toEqual([
            { id: 'card' },
            { id: 'bank_transfer', holdHours: 48 }
        ]);
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
        process.env.NODE_BANK_TRANSFER_IBAN = 'DE89370400440532013000';
        expect(validateBankTransferConfig()).toEqual(['NODE_BANK_TRANSFER_BENEFICIARY']);
    });

    it('refuses a malformed IBAN', () => {
        process.env.NODE_BANK_TRANSFER_BENEFICIARY = 'Guebbit Shop';
        process.env.NODE_BANK_TRANSFER_IBAN = 'not-an-iban';
        expect(validateBankTransferConfig()).toEqual(['NODE_BANK_TRANSFER_IBAN']);
    });

    it('accepts an IBAN typed with spaces, same as ibantools does', () => {
        process.env.NODE_BANK_TRANSFER_BENEFICIARY = 'Guebbit Shop';
        process.env.NODE_BANK_TRANSFER_IBAN = 'DE89 3704 0044 0532 0130 00';
        expect(validateBankTransferConfig()).toEqual([]);
    });

    it('refuses a malformed BIC', () => {
        configureBankTransfer();
        process.env.NODE_BANK_TRANSFER_BIC = 'not-a-bic';
        expect(validateBankTransferConfig()).toEqual(['NODE_BANK_TRANSFER_BIC']);
    });

    it('accepts a valid BIC', () => {
        configureBankTransfer();
        process.env.NODE_BANK_TRANSFER_BIC = 'COBADEFFXXX';
        expect(validateBankTransferConfig()).toEqual([]);
    });
});
