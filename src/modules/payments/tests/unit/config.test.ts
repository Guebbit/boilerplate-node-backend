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

afterEach(() => {
    delete process.env.NODE_BANK_TRANSFER_BENEFICIARY;
    delete process.env.NODE_BANK_TRANSFER_IBAN;
    delete process.env.NODE_BANK_TRANSFER_BIC;
    delete process.env.NODE_BANK_TRANSFER_HOLD_HOURS;
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
