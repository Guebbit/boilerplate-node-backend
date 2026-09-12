/**
 * `src/infrastructure/adapters/bank-transfer.ts` — the plain config getters `orders` and
 * `payments` both read, since neither may depend on the other. Pure env reads, so the unit suite
 * is enough; the boot-time IBAN/BIC validation itself is `payments/config.ts`'s own.
 */
import {
    bankTransferBeneficiary,
    bankTransferBic,
    bankTransferEnabled,
    bankTransferHoldHours,
    bankTransferIban,
    bankTransferIbanFriendly,
    bankTransferMaxOpenPerAccount
} from '@infrastructure/adapters/bank-transfer';

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
