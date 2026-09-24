/**
 * `enqueueEmail` — the queue-or-send-inline dispatch in `src/infrastructure/adapters/mailer.ts`.
 *
 * Which branch runs decides whether a password-reset email is delivered or silently dropped, and
 * the failure is invisible: `enqueueEmail` resolves `void` either way, so a caller cannot tell a
 * queued job from a lost one. It is also agnostic boilerplate — "publish to a broker, fall back to
 * doing it inline" is the pattern every project built on this repo inherits, whatever it sends.
 *
 * The two paths, from `enqueueEmail`'s own point of view:
 *
 *   1. publish resolves true  → enqueue, log at debug, do NOT send inline
 *   2. publish resolves false → send inline
 *
 * There is no `isQueueEnabled()` pre-check here any more — `publishToQueue` already resolves
 * `false` with no I/O when the broker is unconfigured, so "no broker" and "broker configured but
 * refused/timed out" both land on path 2, indistinguishably. That collapse is deliberate: which of
 * the two happened is `queue.test.ts`'s claim to prove, not this file's.
 *
 * Path 2 is the one worth the most: the broker-down half of it only happens when something else is
 * already broken.
 */
import type { EmailJobPayload } from '@types';
import type { Data } from 'ejs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const sendMailMock = jest.fn().mockResolvedValue({ messageId: 'smtp-1' });
jest.mock('nodemailer', () => ({
    createTransport: () => ({ sendMail: sendMailMock })
}));

const publishToQueueMock = jest.fn();
jest.mock('@infrastructure/adapters/queue', () => ({
    publishToQueue: (job: unknown) => publishToQueueMock(job)
}));

const loggerMock = { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
/*
 * Getters rather than `logger: loggerMock`, and the difference is not stylistic.
 *
 * `jest.mock` is hoisted above everything, so the factory runs the moment the mocked module is
 * first required. How soon that is depends on the transform: TypeScript emits each `require` where
 * its `import` stood, which puts it after the `const` above, while swc follows ESM and hoists
 * imports to the top — which puts it BEFORE, and reading `loggerMock` there throws
 * `Cannot access 'loggerMock' before initialization`.
 *
 * A getter body runs on property access instead of at factory time, by which point the `const` is
 * initialised under either. The two mocks above are already safe for the same reason: each reaches
 * its variable from inside a function rather than at the top level of the object.
 */
jest.mock('@infrastructure/adapters/logger', () => ({
    __esModule: true,
    get logger() {
        return loggerMock;
    },
    get auditLogger() {
        return loggerMock;
    }
}));

import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { spoolAttachment } from '@infrastructure/adapters/mail-spool';

/** Whether a path names a real file. */
const fileExists = (target: string): Promise<boolean> =>
    stat(target).then(
        () => true,
        () => false
    );

const REQUEST: EmailJobPayload['request'] = {
    to: 'ada@example.com',
    subject: 'Reset your password'
};
const TEMPLATE = 'account.reset-request';
/**
 * Every variable the chosen template interpolates — which, since templates stopped translating,
 * means the finished copy a producer would have resolved. The inline paths RENDER for real (only
 * the SMTP transport is mocked), so a missing variable is an EJS ReferenceError rather than a
 * silently blank line — which is itself a useful property of this setup.
 */
const DATA: Data = {
    locale: 'en',
    pageMetaTitle: 'Reset',
    pageMetaLinks: [],
    greeting: 'Hello, Ada!',
    intro: 'We received a request to reset your password.',
    linkLabel: 'Reset my password',
    linkUrl: 'https://example.com/en/password-reset/confirm?token=reset-token-value',
    ignore: 'If you did not request this, you can safely ignore this email.',
    footer: 'Sent by the Ecommerce Demo team.'
};

let spoolRoot: string;
const originalSpoolPath = process.env.NODE_MAIL_SPOOL_PATH;

beforeEach(async () => {
    jest.clearAllMocks();
    sendMailMock.mockResolvedValue({ messageId: 'smtp-1' });
    spoolRoot = await mkdtemp(path.join(tmpdir(), 'mailer-dispatch-test-'));
    process.env.NODE_MAIL_SPOOL_PATH = spoolRoot;
});

afterEach(async () => {
    await rm(spoolRoot, { recursive: true, force: true });
    if (originalSpoolPath === undefined) delete process.env.NODE_MAIL_SPOOL_PATH;
    else process.env.NODE_MAIL_SPOOL_PATH = originalSpoolPath;
});

describe('enqueueEmail — path 1: publish resolves true', () => {
    beforeEach(() => {
        publishToQueueMock.mockResolvedValue(true);
    });

    it('publishes the job', async () => {
        await enqueueEmail(REQUEST, TEMPLATE, DATA);

        expect(publishToQueueMock).toHaveBeenCalledTimes(1);
    });

    it('does NOT also send the email inline', async () => {
        // The duplicate-delivery bug: enqueue and send. The user gets two reset emails and the
        // second token invalidates the first.
        await enqueueEmail(REQUEST, TEMPLATE, DATA);

        expect(sendMailMock).not.toHaveBeenCalled();
    });

    it('defaults to normal priority', async () => {
        await enqueueEmail(REQUEST, TEMPLATE, DATA);

        const { priority } = publishToQueueMock.mock.calls[0][0] as { priority: string };
        expect(priority).toBe('normal');
    });

    it('passes an explicit priority through to the queue', async () => {
        // Auth flows (password reset, account deletion/setup, email verification) pass 'high' —
        // a person is actively waiting on a short-TTL link, not an FYI.
        await enqueueEmail(REQUEST, TEMPLATE, DATA, 'high');

        const { priority } = publishToQueueMock.mock.calls[0][0] as { priority: string };
        expect(priority).toBe('high');
    });

    it('carries the template NAME and data, not rendered HTML', async () => {
        // Rendering happens on the consumer side, so the payload must stay small and
        // JSON-serializable. A payload carrying HTML would work and quietly bloat the broker.
        await enqueueEmail(REQUEST, TEMPLATE, DATA);

        const { payload } = publishToQueueMock.mock.calls[0][0] as {
            payload: Record<string, unknown>;
        };
        expect(payload.templateName).toBe(TEMPLATE);
        // The caller's data, plus the chrome `enqueueEmail` resolves on its behalf — still copy
        // and a template name, still no markup.
        // Exactly what the caller passed — `enqueueEmail` adds nothing and resolves nothing.
        expect(payload.data).toEqual(DATA);
        expect(payload).not.toHaveProperty('html');
    });

    it('logs the enqueue at debug, not info', async () => {
        // Enqueueing is routine; the worker logs the actual delivery. At info this is one line
        // per email in production for an event that has not happened yet.
        await enqueueEmail(REQUEST, TEMPLATE, DATA);

        expect(loggerMock.debug).toHaveBeenCalledTimes(1);
        expect(loggerMock.info).not.toHaveBeenCalled();
    });
});

describe('enqueueEmail — path 2: publish resolves false (no broker, or one that refused)', () => {
    beforeEach(() => {
        publishToQueueMock.mockResolvedValue(false);
    });

    it('still attempts the publish — publishToQueue itself is the no-op when unconfigured', async () => {
        // No `isQueueEnabled()` pre-check any more: this call always reaches `publishToQueue`,
        // which resolves `false` with no I/O of its own when nothing is configured — see
        // `queue.test.ts` for that half of the contract.
        await enqueueEmail(REQUEST, TEMPLATE, DATA);

        expect(publishToQueueMock).toHaveBeenCalledTimes(1);
    });

    it('falls back to sending inline, so the email is not lost', async () => {
        await enqueueEmail(REQUEST, TEMPLATE, DATA);

        expect(sendMailMock).toHaveBeenCalledTimes(1);
    });

    it('does not log an enqueue it did not achieve', async () => {
        await enqueueEmail(REQUEST, TEMPLATE, DATA);

        expect(loggerMock.debug).not.toHaveBeenCalled();
    });

    it('resolves undefined, not the SMTP info object', async () => {
        // Both branches share a `Promise<void>` return type so callers cannot accidentally start
        // depending on a `SentMessageInfo` that only exists on one path.
        await expect(enqueueEmail(REQUEST, TEMPLATE, DATA)).resolves.toBeUndefined();
    });
});

/**
 * `publishToQueue` promises a boolean — `queue.test.ts` pins the adapter to `false`, never a
 * rejection, so this is the adapter breaking its own contract, not a path `enqueueEmail` designs
 * for. Every producer writes `void enqueueEmail(...)`, so without a catch here this would surface
 * as an `unhandledRejection` with no request id rather than as a logged, attributable failure.
 */
describe('enqueueEmail — a publish that rejects instead of answering false', () => {
    beforeEach(() => {
        publishToQueueMock.mockRejectedValue(new Error('Channel closed'));
    });

    it('logs the failure and resolves instead of rejecting, with no inline fallback attempt', async () => {
        await expect(enqueueEmail(REQUEST, TEMPLATE, DATA)).resolves.toBeUndefined();

        expect(sendMailMock).not.toHaveBeenCalled();
        expect(loggerMock.error).toHaveBeenCalledWith(
            expect.objectContaining({ template: TEMPLATE, to: REQUEST.to })
        );
    });
});

describe('enqueueEmail — the paths are mutually exclusive', () => {
    // Stated as a table over both outcomes: exactly one delivery attempt happens, whichever way
    // the broker behaves. This is what fails when the `published` branch is inverted.
    it.each([
        ['publish succeeds', true],
        ['publish resolves false', false]
    ])('%s → exactly one delivery path is taken', async (_label, published) => {
        publishToQueueMock.mockResolvedValue(published);

        await enqueueEmail(REQUEST, TEMPLATE, DATA);

        const enqueued = published ? 1 : 0;
        const sentInline = sendMailMock.mock.calls.length;

        expect(enqueued + sentInline).toBe(1);
    });
});

/*
 * `sendInline` — every path above that actually sends now discards through it, since neither has
 * a retry chain behind it: no broker, or a publish that already failed. `sendTemplatedEmail()`
 * itself never discards any more — see `mailer-attachments.test.ts` and `email.worker.test.ts` for
 * the queued path, which has one.
 */
describe('enqueueEmail — the inline paths discard their own attachment', () => {
    it('discards it once the publish-resolves-false fallback settles', async () => {
        publishToQueueMock.mockResolvedValue(false);
        const key = await spoolAttachment(Buffer.from('x'), 'pdf');

        await enqueueEmail(
            { ...REQUEST, attachments: [{ filename: 'x.pdf', key }] },
            TEMPLATE,
            DATA
        );

        await expect(fileExists(path.join(spoolRoot, key))).resolves.toBe(false);
    });

    it('discards it, logs, and still resolves when the inline send itself rejects', async () => {
        publishToQueueMock.mockResolvedValue(false);
        sendMailMock.mockRejectedValueOnce(new Error('smtp refused'));
        const key = await spoolAttachment(Buffer.from('x'), 'pdf');

        await expect(
            enqueueEmail({ ...REQUEST, attachments: [{ filename: 'x.pdf', key }] }, TEMPLATE, DATA)
        ).resolves.toBeUndefined();

        await expect(fileExists(path.join(spoolRoot, key))).resolves.toBe(false);
        expect(loggerMock.error).toHaveBeenCalledWith(
            expect.objectContaining({ template: TEMPLATE, to: REQUEST.to })
        );
    });

    it('never touches it on the queued path, which has a retry chain ahead of it', async () => {
        publishToQueueMock.mockResolvedValue(true);
        const key = await spoolAttachment(Buffer.from('x'), 'pdf');

        await enqueueEmail(
            { ...REQUEST, attachments: [{ filename: 'x.pdf', key }] },
            TEMPLATE,
            DATA
        );

        await expect(fileExists(path.join(spoolRoot, key))).resolves.toBe(true);
    });
});
