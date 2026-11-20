/**
 * @module
 * The outbox backstop driven the way `npm run job` drives it: nothing registered by the test,
 * only what `prepareJob` installs. The backstop builds the buyer's mail from a row the web process
 * wrote, so it must read the same copy the app does: the admin's edit, and the fallback language
 * when the buyer's own was switched off.
 *
 * Jest preloads the translation files and templates for every suite, so "dictionaries missing"
 * cannot be reproduced here: the templates are emptied by hand, and deleting `needs` from the job
 * declarations is the guard for the translation half.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { orderService } from '@modules/orders';
import paymentsModule from '@modules/payments/module';
import { payByCard } from '@modules/payments/tests/factories';
import { localeEntryRepository } from '@modules/locales/repository';
import { givenLocale } from '@modules/locales/tests/factories';
import { backendApp } from '@modules/locales/apps';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { callerContextAs } from '@tests/callers';
import { asSuccess } from '@tests/response';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import {
    registerTemplateDirectories,
    registeredTemplateNames
} from '@infrastructure/adapters/template-registry';
import { registerLocaleOverrideProvider, resetLocaleOverrides } from '@infrastructure/i18n';
import { resetDomainEvents } from '@kernel/events';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import { appJobs } from '../../src/app/jobs';
import { prepareJob, runJobWork } from '../../scripts/ops/prepare-job';

// Only the send is doubled: the build (copy, template names) runs for real.
jest.mock('@infrastructure/adapters/mailer', () => ({
    ...jest.requireActual('@infrastructure/adapters/mailer'),
    enqueueEmail: jest.fn()
}));

/** Stands in for the mail queue; the cases assert how it was called. */
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

setupTestDb();

afterEach(() => {
    resetDomainEvents();
    registerLocaleOverrideProvider(undefined);
    resetLocaleOverrides();
    jest.restoreAllMocks();
});

/**
 * The backstop job, as declared.
 * @throws {Error} when the job is not declared
 */
const sweepOutbox = () => {
    const job = appJobs.find(({ name }) => name === 'sweep:outbox');
    if (!job) throw new Error('sweep:outbox is not declared');
    return job;
};

/**
 * A card payment the web process settled, whose `payment.succeeded` row then waits for the
 * backstop: what a crash between the commit and the relay leaves behind.
 *
 * @param locale - the buyer's saved language
 */
const settledWithRowPending = async (locale: string) => {
    registerCheckoutModules([paymentsModule]);
    const user = await createUser({ locale });
    const product = await createProduct({ onHand: 10 });
    const created = await orderService.create(
        user.id,
        user.email,
        [{ productId: String(product._id), quantity: 1 }],
        callerContextAs('admin')
    );
    await payByCard(asSuccess(created).data, user);
    await settleOutboxNudges();

    await outboxEventModel.updateMany(
        {},
        { $set: { status: 'pending', nextAttemptAt: new Date(0) }, $unset: { publishedAt: 1 } }
    );
    // The backstop is a new process: nothing wired, nothing sent yet.
    resetDomainEvents();
    mockEnqueueEmail.mockClear();
};

/** The `payments.payment-received` mails sent so far. */
const paymentReceivedMails = () =>
    mockEnqueueEmail.mock.calls.filter(([, template]) => template === 'payments.payment-received');

describe('the outbox sweep run through the job runner', () => {
    it('sends the payment-received mail with the copy the admin edited', async () => {
        await givenLocale('en');
        await localeEntryRepository.create({
            locale: 'en',
            app: backendApp(),
            key: 'payments.email-received.subject',
            value: 'Paid in full, thank you'
        });
        await settledWithRowPending('en');

        await prepareJob();
        await runJobWork(sweepOutbox());

        const [mail] = paymentReceivedMails();
        expect(mail[0].subject).toBe('Paid in full, thank you');
        expect(await outboxEventModel.findOne({ name: 'payment.succeeded' }).lean()).toMatchObject({
            status: 'published'
        });
    });

    it('writes in the fallback language when the buyer’s own was switched off', async () => {
        await givenLocale('en');
        await givenLocale('it', { active: false });
        await settledWithRowPending('it');

        await prepareJob();
        await runJobWork(sweepOutbox());

        const [mail] = paymentReceivedMails();
        expect(mail[0].subject).toBe('Payment received');
    });

    it('registers the mail templates, so a mail sent inline in cron can render', async () => {
        registerTemplateDirectories([]);
        expect(registeredTemplateNames()).toEqual([]);

        await prepareJob();

        expect(registeredTemplateNames()).toContain('payments.payment-received');
    });

    it('rejects when the relay itself fails, so the runner records the failure', async () => {
        const job = { ...sweepOutbox(), run: () => Promise.reject(new Error('relay down')) };

        await expect(runJobWork(job)).rejects.toThrow('relay down');
    });
});
