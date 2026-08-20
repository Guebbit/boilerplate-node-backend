/**
 * The two queue consumers — `email.worker.ts` and `pdf.worker.ts`.
 *
 * Both answer the same question for the broker, and it has THREE outcomes, not two:
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
 * The side effect each one exists for — SMTP, puppeteer — is mocked. What is under test is the
 * decision, not the delivery: which payloads are refused before any work starts, and which
 * failures are allowed to escape.
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
const mockedEjs = jest.mocked(ejs.renderFile) as jest.Mock;

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
    ])('refuses a job with %s, without sending', async (_label, malformed) => {
        await expect(
            handleEmailJob(malformed as Parameters<typeof handleEmailJob>[0])
        ).resolves.toBe(false);
        expect(mockedMailer).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalled();
    });

    it('lets a failed send reject, so the broker requeues it', async () => {
        mockedMailer.mockRejectedValue(new Error('SMTP refused'));

        // Not `false`. A refused connection, a timeout, greylisting — none of them are facts about
        // this job, and `consumeFromQueue` requeues a rejection for exactly that reason. Answering
        // `false` here dead-letters a password reset because SMTP blinked.
        await expect(handleEmailJob(job)).rejects.toThrow('SMTP refused');
        // Logged on the way out: the requeue is what saves the email, the log is what makes a job
        // that keeps failing visible instead of a queue that quietly refills.
        expect(logger.error).toHaveBeenCalledWith(
            expect.objectContaining({ error: 'SMTP refused' })
        );
    });
});

describe('handlePdfJob', () => {
    const job = {
        templatePath: 'shared/views/invoice.ejs',
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
        ['no output path', { templatePath: 'shared/views/invoice.ejs' }],
        ['an empty job', {}],
        ['a null job', null],
        ['an undefined job', undefined]
    ])('refuses a job with %s, without rendering', async (_label, malformed) => {
        await expect(handlePdfJob(malformed as Parameters<typeof handlePdfJob>[0])).resolves.toBe(
            false
        );
        expect(mockedEjs).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalled();
    });

    it('lets a failed template render reject, so the broker requeues it', async () => {
        mockedEjs.mockRejectedValue(new Error('template missing'));

        await expect(handlePdfJob(job)).rejects.toThrow('template missing');
        expect(mockedPdf).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith(
            expect.objectContaining({ error: 'template missing' })
        );
    });

    it('lets a failed PDF render reject after a successful template render', async () => {
        mockedEjs.mockResolvedValue('<html></html>');
        mockedPdf.mockRejectedValue(new Error('puppeteer crashed'));

        // The second half of the chain has its own failure mode: the markup was fine and the
        // browser died. A dead browser is the most transient failure this file has — it must not
        // ack an unwritten file, and it must not throw the job away either.
        await expect(handlePdfJob(job)).rejects.toThrow('puppeteer crashed');
        expect(logger.error).toHaveBeenCalledWith(
            expect.objectContaining({ error: 'puppeteer crashed' })
        );
    });
});
