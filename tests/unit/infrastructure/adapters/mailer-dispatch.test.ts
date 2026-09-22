/**
 * `enqueueEmail` — the queue-or-send-inline dispatch in `src/infrastructure/adapters/mailer.ts`.
 *
 * The docblock promises that "two fallbacks keep it safe: the queue being unconfigured, and the
 * queue being configured but momentarily unreachable. In both cases the email is still sent."
 * That is a three-branch claim, and it was asserted by nothing — `tests/unit/i18n/
 * email-locale.test.ts` drives this function, but only to check the locale that rides on the
 * payload, and it pins the queue as enabled and publishing successfully throughout.
 *
 * Which branch runs decides whether a password-reset email is delivered or silently dropped, and
 * the failure is invisible: `enqueueEmail` resolves `void` either way, so a caller cannot tell a
 * queued job from a lost one. It is also agnostic boilerplate — "publish to a broker, fall back to
 * doing it inline" is the pattern every project built on this repo inherits, whatever it sends.
 *
 * The three paths:
 *
 *   1. no broker configured           → send inline, now
 *   2. broker configured, publish OK  → enqueue, log at debug, do NOT send inline
 *   3. broker configured, publish NOT OK → send inline after all
 *
 * Path 3 is the one worth the most: it is the only one that only happens when something else is
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
const isQueueEnabledMock = jest.fn();
jest.mock('@infrastructure/adapters/queue', () => ({
    isQueueEnabled: () => isQueueEnabledMock(),
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

describe('enqueueEmail — path 1: no broker configured', () => {
    beforeEach(() => {
        isQueueEnabledMock.mockReturnValue(false);
    });

    it('sends the email inline rather than dropping it', async () => {
        await enqueueEmail(REQUEST, TEMPLATE, DATA);

        expect(sendMailMock).toHaveBeenCalledTimes(1);
    });

    it('does not attempt to publish anything', async () => {
        await enqueueEmail(REQUEST, TEMPLATE, DATA);

        expect(publishToQueueMock).not.toHaveBeenCalled();
    });

    it('resolves undefined, not the SMTP info object', async () => {
        // Both branches share a `Promise<void>` return type so callers cannot accidentally start
        // depending on a `SentMessageInfo` that only exists on one path.
        await expect(enqueueEmail(REQUEST, TEMPLATE, DATA)).resolves.toBeUndefined();
    });
});

describe('enqueueEmail — path 2: broker configured, publish succeeds', () => {
    beforeEach(() => {
        isQueueEnabledMock.mockReturnValue(true);
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

describe('enqueueEmail — path 3: broker configured, publish fails', () => {
    beforeEach(() => {
        isQueueEnabledMock.mockReturnValue(true);
        publishToQueueMock.mockResolvedValue(false);
    });

    it('falls back to sending inline, so the email is not lost', async () => {
        // The branch that only runs when the broker is already having a bad day — and the one
        // nothing was checking. Without it, a RabbitMQ blip silently swallows every password
        // reset, and `enqueueEmail` still resolves as if it had worked.
        await enqueueEmail(REQUEST, TEMPLATE, DATA);

        expect(sendMailMock).toHaveBeenCalledTimes(1);
    });

    it('does not log an enqueue it did not achieve', async () => {
        await enqueueEmail(REQUEST, TEMPLATE, DATA);

        expect(loggerMock.debug).not.toHaveBeenCalled();
    });

    it('still resolves undefined', async () => {
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
        isQueueEnabledMock.mockReturnValue(true);
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
    // Stated as a table over all three configurations: exactly one delivery attempt happens,
    // whichever way the broker behaves. This is what fails when a branch condition is inverted.
    it.each([
        ['no broker', false, false],
        ['publish succeeds', true, true],
        ['publish fails', true, false]
    ])('%s → exactly one delivery path is taken', async (_label, queueEnabled, published) => {
        isQueueEnabledMock.mockReturnValue(queueEnabled);
        publishToQueueMock.mockResolvedValue(published);

        await enqueueEmail(REQUEST, TEMPLATE, DATA);

        const enqueued = publishToQueueMock.mock.calls.length > 0 && published ? 1 : 0;
        const sentInline = sendMailMock.mock.calls.length;

        expect(enqueued + sentInline).toBe(1);
    });
});

/*
 * `sendInline` — every path above that actually sends now discards through it, since neither has
 * a retry chain behind it: no broker, or a publish that already failed. `nodemailer()` itself
 * never discards any more — see `mailer-attachments.test.ts` and `email.worker.test.ts` for the
 * queued path, which has one.
 */
describe('enqueueEmail — the inline paths discard their own attachment', () => {
    it('discards it once a no-broker send settles', async () => {
        isQueueEnabledMock.mockReturnValue(false);
        const key = await spoolAttachment(Buffer.from('x'), 'pdf');

        await enqueueEmail(
            { ...REQUEST, attachments: [{ filename: 'x.pdf', key }] },
            TEMPLATE,
            DATA
        );

        await expect(fileExists(path.join(spoolRoot, key))).resolves.toBe(false);
    });

    it('discards it once the publish-failed fallback settles', async () => {
        isQueueEnabledMock.mockReturnValue(true);
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
        isQueueEnabledMock.mockReturnValue(false);
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
        isQueueEnabledMock.mockReturnValue(true);
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
