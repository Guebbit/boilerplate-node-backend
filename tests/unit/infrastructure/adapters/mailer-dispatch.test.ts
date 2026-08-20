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
import type { SendMailOptions } from 'nodemailer';
import type { Data } from 'ejs';

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

const REQUEST: SendMailOptions = { to: 'ada@example.com', subject: 'Reset your password' };
const TEMPLATE = 'account.reset-request.ejs';
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
    linkUrl: 'https://example.com/account/reset/reset-token-value',
    ignore: 'If you did not request this, you can safely ignore this email.',
    footer: 'Sent by the Ecommerce Demo team.'
};

beforeEach(() => {
    jest.clearAllMocks();
    sendMailMock.mockResolvedValue({ messageId: 'smtp-1' });
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
 * Path 3 exists only because `publishToQueue` promises a boolean. This is what the promise is
 * worth: `enqueueEmail` reads `published` and has no rejection handler, so an adapter that
 * rejected instead of answering `false` would skip the inline fallback entirely — and every
 * producer writes `void enqueueEmail(...)`, so the loss would surface as an `unhandledRejection`
 * with no request id rather than as a failed request.
 *
 * The guard against that lives in `queue.test.ts`, which pins the adapter to `false`. This case
 * pins the reason it has to.
 */
describe('enqueueEmail — path 3 depends on the adapter never rejecting', () => {
    beforeEach(() => {
        isQueueEnabledMock.mockReturnValue(true);
        publishToQueueMock.mockRejectedValue(new Error('Channel closed'));
    });

    it('has no fallback left when the publish rejects instead of answering false', async () => {
        await expect(enqueueEmail(REQUEST, TEMPLATE, DATA)).rejects.toThrow('Channel closed');

        expect(sendMailMock).not.toHaveBeenCalled();
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
