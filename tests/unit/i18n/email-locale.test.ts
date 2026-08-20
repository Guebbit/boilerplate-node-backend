import type { EmailRequest } from '@infrastructure/adapters/mailer';
import { runWithLocale } from '@infrastructure/i18n';
import enAccount from '@modules/account/locales/en.json';
import itAccount from '@modules/account/locales/it.json';

/**
 * Where an email's language is decided, and where it is not.
 *
 * A request negotiates its locale and runs inside an ALS store, so everything on that async chain
 * resolves against it. `enqueueEmail` breaks the chain on purpose: the job goes onto a queue and
 * `workers/email.worker.ts` drains it later, possibly in another process, with no store at all.
 *
 * The answer is not to rebuild the store on the far side — it is to leave nothing to resolve. The
 * producer translates while the request is alive, so the payload carries finished copy and the
 * worker is language-blind by construction. These tests guard both halves: that the producer
 * really does resolve (and in the right language), and that the worker really does not care what
 * locale surrounds it.
 *
 * SMTP is mocked out; `nodemailer` here is this repo's own render-and-send wrapper, not the
 * package. What is asserted is the rendered HTML and the subject, which is the copy.
 */

const sendMailMock = jest.fn().mockResolvedValue({ messageId: 'test' });
jest.mock('nodemailer', () => ({
    createTransport: () => ({ sendMail: sendMailMock })
}));

const publishToQueueMock = jest.fn().mockResolvedValue(true);
const isQueueEnabledMock = jest.fn().mockReturnValue(true);
jest.mock('@infrastructure/adapters/queue', () => ({
    isQueueEnabled: () => isQueueEnabledMock(),
    publishToQueue: (job: unknown) => publishToQueueMock(job)
}));

import { registrationConfirmEmail } from '@modules/account/emails';

const REQUEST: EmailRequest = { to: 'ada@example.com', subject: 'ignored' };

/** The English and Italian spellings of the one line asserted throughout. */
const BODY = {
    en: enAccount.account.email['registration-confirm'].body,
    it: itAccount.account.email['registration-confirm'].body
};

/**
 * A job exactly as `enqueueEmail` would have published it: the builder's output, unmodified.
 * Nothing is added on the way to the queue and no locale travels with it.
 */
const jobFor = (locale: string) => {
    const content = registrationConfirmEmail(locale, 'Ada');
    return { request: REQUEST, templateName: content.template, data: content.data };
};

/** The HTML the mocked SMTP transport was handed. */
const sentHtml = () => (sendMailMock.mock.calls[0][0] as { html: string }).html;

describe('the producer resolves the copy before publishing', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        isQueueEnabledMock.mockReturnValue(true);
        publishToQueueMock.mockResolvedValue(true);
    });

    it('puts finished text on the queue, in the language it was asked for', async () => {
        const { enqueueEmail } = await import('@infrastructure/adapters/mailer');

        const content = registrationConfirmEmail('it', 'Ada');
        await enqueueEmail(
            { ...REQUEST, subject: content.subject },
            content.template,
            content.data
        );

        expect(publishToQueueMock).toHaveBeenCalledTimes(1);
        const { payload } = publishToQueueMock.mock.calls[0][0] as {
            payload: { data: Record<string, unknown>; request: EmailRequest };
        };
        // The copy itself, not a key and not a locale to look one up with.
        expect(payload.data.body).toBe(BODY.it);
        expect(payload.request.subject).toBe(
            itAccount.account.email['registration-confirm'].subject
        );
    });

    it('carries no locale at all — every string is already decided', async () => {
        const { enqueueEmail } = await import('@infrastructure/adapters/mailer');

        const content = registrationConfirmEmail('it', 'Ada');
        await enqueueEmail(REQUEST, content.template, content.data);

        const { payload } = publishToQueueMock.mock.calls[0][0] as {
            payload: Record<string, unknown> & { data: Record<string, unknown> };
        };
        expect(payload).not.toHaveProperty('locale');
        // `data.locale` is the `<html lang>` value the template prints — a finished string like
        // any other, not something the worker resolves against.
        expect(payload.data.locale).toBe('it');
        expect(payload.data.footer).toBe('Inviata dal team di Ecommerce Demo.');
    });

    it('ignores the ambient locale — the argument decides, not the scope', async () => {
        const { enqueueEmail } = await import('@infrastructure/adapters/mailer');

        await runWithLocale('en', () => {
            const content = registrationConfirmEmail('it', 'Ada');
            return enqueueEmail(REQUEST, content.template, content.data);
        });

        const { payload } = publishToQueueMock.mock.calls[0][0] as {
            payload: { data: Record<string, unknown> };
        };
        expect(payload.data.body).toBe(BODY.it);
    });
});

describe('the email worker renders the copy it was given', () => {
    beforeEach(() => jest.clearAllMocks());

    it('sends the Italian text an Italian request enqueued', async () => {
        const { handleEmailJob } = await import('@infrastructure/adapters/email.worker');

        const acknowledged = await handleEmailJob(jobFor('it'));

        expect(acknowledged).toBe(true);
        expect(sentHtml()).toContain(BODY.it);
        expect(sentHtml()).toContain('<html lang="it"');
    });

    it('sends English for an English job', async () => {
        const { handleEmailJob } = await import('@infrastructure/adapters/email.worker');

        await handleEmailJob(jobFor('en'));

        expect(sentHtml()).toContain(BODY.en);
    });

    /**
     * The point of the whole design. The worker holds no locale, consults no dictionary and runs
     * with whatever store happens to surround it — here, deliberately the wrong one. The email
     * still goes out in Italian, because the language was decided before the job existed.
     */
    it('ignores the ambient locale entirely', async () => {
        const { handleEmailJob } = await import('@infrastructure/adapters/email.worker');
        const job = jobFor('it');

        await runWithLocale('en', () => handleEmailJob(job));

        expect(sentHtml()).toContain(BODY.it);
    });

    /**
     * The nack paths: a job the worker cannot process has to be reported as unprocessable, or it
     * is redelivered forever. Mirrors the same two cases on `pdf.worker.ts`.
     */
    it('discards a job with no recipient rather than rendering one', async () => {
        const { handleEmailJob } = await import('@infrastructure/adapters/email.worker');

        await expect(
            handleEmailJob({ templateName: 'account.registration-confirm.ejs' })
        ).resolves.toBe(false);

        expect(sendMailMock).not.toHaveBeenCalled();
    });

    it('discards a job with no template rather than rendering one', async () => {
        const { handleEmailJob } = await import('@infrastructure/adapters/email.worker');

        await expect(handleEmailJob({ request: REQUEST })).resolves.toBe(false);

        expect(sendMailMock).not.toHaveBeenCalled();
    });

    it('lets a failed send reject, so the email is retried rather than dropped', async () => {
        sendMailMock.mockRejectedValueOnce(new Error('smtp refused'));
        const { handleEmailJob } = await import('@infrastructure/adapters/email.worker');

        // A refused SMTP connection says nothing about this job. `false` would dead-letter it;
        // a rejection puts it back on the queue — see the worker's own docblock.
        await expect(handleEmailJob(jobFor('it'))).rejects.toThrow('smtp refused');
    });
});
