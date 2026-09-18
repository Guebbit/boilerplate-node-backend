/**
 * `email.worker.ts` — the one remaining domainless queue consumer.
 *
 * It answers the same question for the broker every worker in this codebase does, and it has
 * THREE outcomes, not two:
 *
 *   - resolve `true`  → ack — done
 *   - resolve `false` → nack without requeue → the dead-letter queue, permanently
 *   - reject          → nack WITH requeue → tried again when the world is healthier
 *
 * The line between the last two is the one worth guarding, because it is the line between "this
 * email will be sent when SMTP comes back" and "this email is lost". A payload that names no
 * recipient will never become valid, so it is refused; an SMTP timeout says nothing about the job,
 * so it is left to reject and the broker redelivers it.
 *
 * The side effect it exists for — SMTP — is mocked. What is under test is the decision, not the
 * delivery: which payloads are refused before any work starts, and which failures are allowed to
 * escape. PDF generation moved to `orders/transport/invoice-pdf.ts` and is tested there now.
 */

import { logger } from '@infrastructure/adapters/logger';

jest.mock('@infrastructure/adapters/mailer', () => ({ nodemailer: jest.fn() }));

import { nodemailer } from '@infrastructure/adapters/mailer';
import { EMAIL_QUEUE } from '@infrastructure/adapters/queue';
import {
    handleEmailJob,
    EMAIL_QUEUE as workerEmailQueue
} from '@infrastructure/adapters/email.worker';

const mockedMailer = nodemailer as jest.MockedFunction<typeof nodemailer>;

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    jest.spyOn(logger, 'error').mockImplementation(() => logger);
});

afterAll(() => jest.restoreAllMocks());

/**
 * `queue.ts` owns the spelling so that a producer and its consumer cannot drift — a typo on
 * either side is not an error anywhere, it is a message published to a queue nobody drains. The
 * worker re-exports its own so the registry that wires consumer to queue reads one import rather
 * than two, and identity is the assertion.
 */
it('re-exports the email queue unchanged', () => {
    expect(workerEmailQueue).toBe(EMAIL_QUEUE);
});

describe('handleEmailJob', () => {
    const job = {
        request: { to: 'ada@example.com' },
        templateName: 'welcome',
        data: { name: 'Ada' }
    } as Parameters<typeof handleEmailJob>[0];

    it('sends the job and acks it', async () => {
        mockedMailer.mockResolvedValue(undefined as never);

        await expect(handleEmailJob(job)).resolves.toBe(true);
        // The producer resolved the copy before publishing, so the worker forwards `data`
        // untouched — re-resolving it here would render in the worker's language, not the
        // requester's.
        expect(mockedMailer).toHaveBeenCalledWith(job.request, 'welcome', { name: 'Ada' });
    });

    it('defaults absent template data to an empty object rather than passing undefined', async () => {
        mockedMailer.mockResolvedValue(undefined as never);

        await handleEmailJob({ request: job.request, templateName: 'welcome' });

        expect(mockedMailer).toHaveBeenCalledWith(job.request, 'welcome', {});
    });

    /*
     * Every payload the guard rejects. `Partial` is honest about the broker: an older producer, or
     * a hand-published message, can deliver any of these — and each must be discarded rather than
     * reaching nodemailer with a missing recipient.
     */
    it.each([
        ['no recipient', { request: { to: '' }, templateName: 'welcome' }],
        ['no request at all', { templateName: 'welcome' }],
        ['no template name', { request: { to: 'ada@example.com' } }],
        ['an empty job', {}],
        // `job?.` guards the job itself, not only its fields: a broker can deliver a null body.
        ['a null job', null],
        ['an undefined job', undefined]
    ])('refuses a job with %s, without sending', async (_label, malformed) => {
        await expect(
            handleEmailJob(malformed as Parameters<typeof handleEmailJob>[0])
        ).resolves.toBe(false);
        expect(mockedMailer).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalled();
    });

    it('lets a failed send reject, so the broker requeues it', async () => {
        const failure = new Error('SMTP refused');
        mockedMailer.mockRejectedValue(failure);

        // Not `false`. A refused connection, a timeout, greylisting — none of them are facts about
        // this job, and `consumeFromQueue` requeues a rejection for exactly that reason. Answering
        // `false` here dead-letters a password reset because SMTP blinked.
        await expect(handleEmailJob(job)).rejects.toThrow('SMTP refused');
        // Logged on the way out: the requeue is what saves the email, the log is what makes a job
        // that keeps failing visible instead of a queue that quietly refills.
        expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ error: failure }));
    });
});
