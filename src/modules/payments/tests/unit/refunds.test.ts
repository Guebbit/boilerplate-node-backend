/**
 * @module
 * `performRefund`'s corrupted-row guard: a `succeeded` payment with no `providerRef` cannot have
 * had real money move (nothing succeeds before the provider is asked for an intent), so the status
 * move that follows must never be reported as a successful refund.
 */
import type { PaymentDocument } from '../../model';
import { paymentRepository } from '../../repository';
import { asStub } from '@tests/stub';

/*
 * The audit port is REPLACED, not spied on — a named import compiles to a non-configurable getter
 * on the CommonJS namespace, which `jest.spyOn` cannot redefine (see `create-audit.test.ts` for
 * the same reasoning applied to a different module).
 */
const recordAudit = jest.fn();
jest.mock('@infrastructure/observability/audit', () => ({
    __esModule: true,
    ...jest.requireActual('@infrastructure/observability/audit'),
    recordAudit: (...args: unknown[]) => recordAudit(...args)
}));

/*
 * The announcement's transaction is replaced too: this suite has no database, and what it asserts
 * (the audit outcome) does not depend on the outbox row. Atomicity is proved in the integration
 * suites against a real Mongo.
 */
jest.mock('@kernel/outbox', () => ({
    __esModule: true,
    ...jest.requireActual('@kernel/outbox'),
    announceInTransaction: (write: (session: unknown) => Promise<unknown>) => write({})
}));

afterEach(() => jest.restoreAllMocks());

/** A `succeeded` payment carrying no `providerRef` — the impossible, corrupted state under test. */
const corruptedPayment = asStub<PaymentDocument>({
    _id: 'payment-1',
    orderId: 'order-1',
    status: 'succeeded',
    provider: 'fake',
    providerRef: undefined,
    amount: 10,
    amountRefunded: 0,
    refunds: [],
    currency: 'EUR'
});

describe('performRefund — a succeeded payment with no providerRef', () => {
    it('audits a failure, not a success, for money that never actually moved', async () => {
        const refunded = asStub<PaymentDocument>({
            ...corruptedPayment,
            status: 'refunded',
            amountRefunded: 10,
            refunds: [{ status: 'succeeded' }]
        });
        jest.spyOn(paymentRepository, 'findByOrderId').mockResolvedValue(corruptedPayment);
        jest.spyOn(paymentRepository, 'addRefund').mockResolvedValue(
            asStub<PaymentDocument>({ ...corruptedPayment, amountRefunded: 10 })
        );
        jest.spyOn(paymentRepository, 'settleRefund').mockResolvedValue(refunded);
        jest.spyOn(paymentRepository, 'updateStatusIfIn').mockResolvedValue(refunded);

        // Imported after the mocks above are in place, so `performRefund` closes over the
        // replaced `recordAudit`.
        const { performRefund } = await import('../../services/refunds');
        const result = await performRefund('order-1', { caller: { role: 'admin' } } as never);

        expect(result?.status).toBe('refunded');
        expect(recordAudit).toHaveBeenCalledTimes(1);
        expect(recordAudit.mock.calls[0][1]).toMatchObject({
            action: 'admin.payment.refunded',
            outcome: 'failure'
        });
    });
});
