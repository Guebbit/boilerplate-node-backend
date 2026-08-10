import type { SendMailOptions } from 'nodemailer';
import type { Data } from 'ejs';
import { runWithLocale } from '@core/i18n';
import enTranslation from '../../../src/locales/en.json';
import itTranslation from '../../../src/locales/it.json';

/**
 * The boundary AsyncLocalStorage cannot cross.
 *
 * A request negotiates its locale and runs inside an ALS store, and everything on that async
 * chain resolves against it. `enqueueEmail` breaks the chain on purpose: the job goes onto a
 * queue and `workers/email.worker.ts` drains it later, possibly in another process, with no
 * store at all. So the locale has to travel IN the payload and be re-established by the worker.
 *
 * These tests are the guard for both halves — the producer recording it, and the consumer
 * restoring it — because getting it wrong fails silently: the ambient `t` falls back to the boot
 * language and every email ships in English with nothing logged.
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
jest.mock('@core/adapters/queue', () => ({
    isQueueEnabled: () => isQueueEnabledMock(),
    publishToQueue: (job: unknown) => publishToQueueMock(job)
}));

const TEMPLATE_DATA: Data = {
    pageMetaTitle: 'Meta title',
    pageMetaLinks: [],
    name: 'Ada'
};

const REQUEST: SendMailOptions = { to: 'ada@example.com', subject: 'ignored' };

/** The HTML the mocked SMTP transport was handed. */
const sentHtml = () => (sendMailMock.mock.calls[0][0] as { html: string }).html;

describe('enqueueEmail records the locale on the payload', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        isQueueEnabledMock.mockReturnValue(true);
        publishToQueueMock.mockResolvedValue(true);
    });

    it('defaults to the locale of the request that enqueued it', async () => {
        const { enqueueEmail } = await import('@core/adapters/mailer');

        await runWithLocale('it', () =>
            enqueueEmail(REQUEST, 'email-registration-confirm.ejs', TEMPLATE_DATA)
        );

        expect(publishToQueueMock).toHaveBeenCalledTimes(1);
        expect(publishToQueueMock.mock.calls[0][0].payload).toMatchObject({ locale: 'it' });
    });

    it('lets a caller override it, for work done on someone else’s behalf', async () => {
        const { enqueueEmail } = await import('@core/adapters/mailer');

        await runWithLocale('en', () =>
            enqueueEmail(REQUEST, 'email-registration-confirm.ejs', TEMPLATE_DATA, 'it')
        );

        expect(publishToQueueMock.mock.calls[0][0].payload).toMatchObject({ locale: 'it' });
    });
});

describe('the email worker renders in the payload’s locale', () => {
    beforeEach(() => jest.clearAllMocks());

    it('renders Italian for a job enqueued by an Italian request', async () => {
        const { handleEmailJob } = await import('../../../src/workers/email.worker');

        const acknowledged = await handleEmailJob({
            request: REQUEST,
            templateName: 'email-registration-confirm.ejs',
            data: TEMPLATE_DATA,
            locale: 'it'
        });

        expect(acknowledged).toBe(true);
        expect(sentHtml()).toContain(itTranslation.email['registration-confirm'].body);
        expect(sentHtml()).toContain('<html lang="it"');
    });

    it('renders English for an English job', async () => {
        const { handleEmailJob } = await import('../../../src/workers/email.worker');

        await handleEmailJob({
            request: REQUEST,
            templateName: 'email-registration-confirm.ejs',
            data: TEMPLATE_DATA,
            locale: 'en'
        });

        expect(sentHtml()).toContain(enTranslation.email['registration-confirm'].body);
    });

    /**
     * Jobs published before the field existed are still in the queue when this deploys.
     */
    it('falls back rather than failing when a job carries no locale', async () => {
        const { handleEmailJob } = await import('../../../src/workers/email.worker');

        const acknowledged = await handleEmailJob({
            request: REQUEST,
            templateName: 'email-registration-confirm.ejs',
            data: TEMPLATE_DATA
        });

        expect(acknowledged).toBe(true);
        expect(sentHtml()).toContain(enTranslation.email['registration-confirm'].body);
    });

    /**
     * The nack paths, which the locale wrapper must not swallow or convert into a throw: a job
     * the worker cannot process has to be reported as unprocessable, or it is redelivered
     * forever. Mirrors the same two cases on `pdf.worker.ts`.
     */
    it('discards a job with no recipient rather than rendering one', async () => {
        const { handleEmailJob } = await import('../../../src/workers/email.worker');

        await expect(
            handleEmailJob({ templateName: 'email-registration-confirm.ejs', locale: 'it' })
        ).resolves.toBe(false);

        expect(sendMailMock).not.toHaveBeenCalled();
    });

    it('discards a job with no template rather than rendering one', async () => {
        const { handleEmailJob } = await import('../../../src/workers/email.worker');

        await expect(handleEmailJob({ request: REQUEST, locale: 'it' })).resolves.toBe(false);

        expect(sendMailMock).not.toHaveBeenCalled();
    });

    it('nacks rather than throwing when the send fails', async () => {
        sendMailMock.mockRejectedValueOnce(new Error('smtp refused'));
        const { handleEmailJob } = await import('../../../src/workers/email.worker');

        await expect(
            handleEmailJob({
                request: REQUEST,
                templateName: 'email-registration-confirm.ejs',
                data: TEMPLATE_DATA,
                locale: 'it'
            })
        ).resolves.toBe(false);
    });

    /**
     * The point of the whole design: the worker must NOT inherit whatever locale happened to be
     * ambient when it was invoked. Two jobs drained back to back from inside an unrelated scope
     * must each answer in their own language.
     */
    it('ignores any ambient locale and uses the job’s own', async () => {
        const { handleEmailJob } = await import('../../../src/workers/email.worker');

        await runWithLocale('en', () =>
            handleEmailJob({
                request: REQUEST,
                templateName: 'email-registration-confirm.ejs',
                data: TEMPLATE_DATA,
                locale: 'it'
            })
        );

        expect(sentHtml()).toContain(itTranslation.email['registration-confirm'].body);
    });
});
