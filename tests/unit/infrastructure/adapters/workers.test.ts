/**
 * The two queue consumers — `email.worker.ts` and `pdf.worker.ts`.
 *
 * Both answer the same question for the broker, and it is a two-valued one: `true` acks the job,
 * `false` nacks it to the dead-letter queue. Getting that boolean backwards is the failure worth
 * guarding, because neither outcome throws and both look like "the worker ran" in a log:
 * a failed send acked is an email silently dropped, and a malformed job requeued is a poison
 * message the broker redelivers forever.
 *
 * The side effect each one exists for — SMTP, puppeteer — is mocked. What is under test is the
 * decision, not the delivery: which payloads are rejected before any work starts, and how a
 * rejected promise from the thing that does the work is turned into a verdict.
 */

import { logger } from '@infrastructure/adapters/logger';

jest.mock('@infrastructure/adapters/mailer', () => ({ nodemailer: jest.fn() }));
jest.mock('@infrastructure/adapters/pdf', () => ({ renderHtmlToPdf: jest.fn() }));
jest.mock('ejs', () => ({ renderFile: jest.fn() }));

import { nodemailer } from '@infrastructure/adapters/mailer';
import { renderHtmlToPdf } from '@infrastructure/adapters/pdf';
import ejs from 'ejs';
import { EMAIL_QUEUE, PDF_QUEUE } from '@infrastructure/adapters/queue';
import {
    handleEmailJob,
    EMAIL_QUEUE as workerEmailQueue
} from '@infrastructure/adapters/email.worker';
import { handlePdfJob, PDF_QUEUE as workerPdfQueue } from '@infrastructure/adapters/pdf.worker';

const mockedMailer = nodemailer as jest.MockedFunction<typeof nodemailer>;
const mockedPdf = renderHtmlToPdf as jest.MockedFunction<typeof renderHtmlToPdf>;
const mockedEjs = ejs.renderFile as unknown as jest.Mock;

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    jest.spyOn(logger, 'error').mockImplementation(() => logger);
    jest.spyOn(logger, 'info').mockImplementation(() => logger);
});

afterAll(() => jest.restoreAllMocks());

/**
 * The queue name each worker re-exports.
 *
 * `queue.ts` owns both spellings so that a producer and its consumer cannot drift — a typo on
 * either side is not an error anywhere, it is a message published to a queue nobody drains. The
 * worker re-exports its own so the registry that wires consumer to queue reads one import rather
 * than two, and identity is the assertion: a re-export resolving to a different value is exactly
 * the drift `queue.ts` centralises the constant to prevent.
 */
describe('the queue names', () => {
    it('re-exports the email queue unchanged', () => {
        expect(workerEmailQueue).toBe(EMAIL_QUEUE);
    });

    it('re-exports the pdf queue unchanged', () => {
        expect(workerPdfQueue).toBe(PDF_QUEUE);
    });

    it('keeps the two queues distinct', () => {
        // One name for both would have the PDF consumer draining email jobs, which `handlePdfJob`
        // discards as malformed — a queue that silently eats every message.
        expect(workerEmailQueue).not.toBe(workerPdfQueue);
    });
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
    ])('discards a job with %s, without sending', async (_label, malformed) => {
        await expect(
            handleEmailJob(malformed as Parameters<typeof handleEmailJob>[0])
        ).resolves.toBe(false);
        expect(mockedMailer).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalled();
    });

    it('nacks — rather than throwing — when the send rejects', async () => {
        mockedMailer.mockRejectedValue(new Error('SMTP refused'));

        // The rejection must not escape: an unhandled rejection in a consumer takes the whole
        // worker process down, and with it every other job on the queue.
        await expect(handleEmailJob(job)).resolves.toBe(false);
        expect(logger.error).toHaveBeenCalledWith(
            expect.objectContaining({ error: 'SMTP refused' })
        );
    });
});

describe('handlePdfJob', () => {
    const job = {
        templatePath: 'views/invoice.ejs',
        outputPath: '/tmp/invoice.pdf',
        templateData: { locale: 'it', total: 10 }
    } as Parameters<typeof handlePdfJob>[0];

    it('renders the template, writes the PDF and acks', async () => {
        mockedEjs.mockResolvedValue('<html lang="it"></html>');
        mockedPdf.mockResolvedValue(undefined as never);

        await expect(handlePdfJob(job)).resolves.toBe(true);
        // `templateData` reaches the template as-is, `locale` included — that is what puts the
        // right language in `<html lang>` without the worker knowing which one it is.
        expect(mockedEjs).toHaveBeenCalledWith(expect.stringContaining('invoice.ejs'), {
            locale: 'it',
            total: 10
        });
        expect(mockedPdf).toHaveBeenCalledWith('<html lang="it"></html>', {
            format: 'A4',
            path: '/tmp/invoice.pdf'
        });
    });

    it.each([
        ['no template path', { outputPath: '/tmp/invoice.pdf' }],
        ['no output path', { templatePath: 'views/invoice.ejs' }],
        ['an empty job', {}],
        ['a null job', null],
        ['an undefined job', undefined]
    ])('discards a job with %s, without rendering', async (_label, malformed) => {
        await expect(handlePdfJob(malformed as Parameters<typeof handlePdfJob>[0])).resolves.toBe(
            false
        );
        expect(mockedEjs).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalled();
    });

    it('nacks when the template fails to render', async () => {
        mockedEjs.mockRejectedValue(new Error('template missing'));

        await expect(handlePdfJob(job)).resolves.toBe(false);
        expect(mockedPdf).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith(
            expect.objectContaining({ error: 'template missing' })
        );
    });

    it('nacks when the PDF render fails after a successful template render', async () => {
        mockedEjs.mockResolvedValue('<html></html>');
        mockedPdf.mockRejectedValue(new Error('puppeteer crashed'));

        // The second half of the chain has its own failure mode: the markup was fine and the
        // browser died, which must still nack rather than ack an unwritten file.
        await expect(handlePdfJob(job)).resolves.toBe(false);
        expect(logger.error).toHaveBeenCalledWith(
            expect.objectContaining({ error: 'puppeteer crashed' })
        );
    });
});
