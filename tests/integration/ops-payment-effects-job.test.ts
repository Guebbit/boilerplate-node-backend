/**
 * @module
 * The payment reconcile sweep driven the way `npm run job` drives it. A webhook the provider
 * never delivered is settled by this job, so "payment received" must leave the SAME run: the job
 * boots like the app and settles the outbox nudge it caused, instead of waiting for `sweep:outbox`
 * (which is a different process, and a different minute).
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { paymentService } from '@modules/payments/services';
import { paymentRepository } from '@modules/payments/repository';
import { paymentsJobs } from '@modules/payments/jobs';
import paymentsModule from '@modules/payments/module';
import { fakePaymentProvider } from '@scenarios/support/doubles/payments/fake';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { asCustomer } from '@tests/callers';
import { withEnvironmentOverrides } from '@tests/environment';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { resetDomainEvents } from '@kernel/events';
import { prepareJob, runJobWork } from '../../scripts/ops/prepare-job';

// Only the send is doubled: the buyer lookup and the mail build run for real.
jest.mock('@infrastructure/adapters/mailer', () => ({
    ...jest.requireActual('@infrastructure/adapters/mailer'),
    enqueueEmail: jest.fn()
}));
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

setupTestDb();

afterEach(() => {
    resetDomainEvents();
    jest.restoreAllMocks();
});

/** The payment effects sweep, as declared. */
const sweepPaymentEffects = () => {
    const job = paymentsJobs.find(({ name }) => name === 'sweep:payment-effects');
    if (!job) throw new Error('sweep:payment-effects is not declared');
    return job;
};

/** An order whose card the provider charged, with no webhook ever seen. */
const chargedAtProvider = async () => {
    registerCheckoutModules([paymentsModule]);
    const user = await createUser();
    const product = await createProduct({ price: '25.00', onHand: 10 });
    const order = await createOrder(user, [toOrderItem(product, 2)]);
    const orderId = String(order._id);
    await paymentService.createIntent(orderId, asCustomer(user.id));
    const payment = await paymentRepository.findByOrderId(orderId);
    await fakePaymentProvider.confirm(String(payment?.providerRef), 'pm_card_visa');
    // The job is a new process: nothing wired yet.
    resetDomainEvents();
    mockEnqueueEmail.mockClear();
    return { order };
};

describe('the payment effects sweep run through the job runner', () => {
    it('mails the buyer in the same run that settles the payment', () =>
        withEnvironmentOverrides({ NODE_PAYMENT_RECONCILE_MINUTES: '0' }, async () => {
            const { order } = await chargedAtProvider();

            await prepareJob();
            await runJobWork(sweepPaymentEffects());

            const mails = mockEnqueueEmail.mock.calls.filter(
                ([, template]) => template === 'payments.payment-received'
            );
            expect(mails.map(([envelope]) => envelope.to)).toEqual([order.email]);
        }));

    it('sends nothing when the run settles nothing', () =>
        withEnvironmentOverrides({ NODE_PAYMENT_RECONCILE_MINUTES: '0' }, async () => {
            registerCheckoutModules([paymentsModule]);
            resetDomainEvents();

            await prepareJob();
            await runJobWork(sweepPaymentEffects());

            expect(mockEnqueueEmail).not.toHaveBeenCalled();
        }));
});
