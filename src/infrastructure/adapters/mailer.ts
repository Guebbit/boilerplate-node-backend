/**
 * @module
 * Email adapter: EJS template rendering + SMTP delivery, optionally via the queue.
 *
 * See: docs/tools/email-and-rendering.md
 */

import path from 'node:path';
// EJS = the HTML templating engine used for email bodies. `Data` is its type for the
// variables interpolated into a template (`<%= user.name %>`).
import ejs, { type Data } from 'ejs';
// nodemailer: `createTransport` builds a reusable SMTP sender; `SentMessageInfo` is the server's
// reply (messageId, accepted/rejected recipients); `SendMailOptions` is `sendMail`'s own envelope
// shape — https://nodemailer.com/message/
import {
    createTransport,
    type SendMailOptions,
    type SentMessageInfo,
    type Transporter
} from 'nodemailer';
// OTel semantic-convention keys for messaging spans — using the standard names lets tracing
// backends render this as a messaging operation instead of an opaque span. Still incubating,
// hence the `/incubating` subpath: the older `SEMATTRS_*` aliases are deprecated, and
// `SEMATTRS_MESSAGING_DESTINATION` moved from `messaging.destination` to `.destination.name`.
import {
    ATTR_MESSAGING_SYSTEM,
    ATTR_MESSAGING_DESTINATION_NAME
} from '@opentelemetry/semantic-conventions/incubating';
import type { EmailJobPayload } from '@types';
import { logger } from '@infrastructure/adapters/logger';
import { environmentNumber, environmentChoice } from '@infrastructure/runtime/environment';
import { isDemoMode } from '@infrastructure/runtime/demo-profile';
import { recordDemoEmail } from '@infrastructure/adapters/demo-outbox';
import { resolveSpooled, discardSpooled } from '@infrastructure/adapters/mail-spool';
import { withSpan } from '@infrastructure/observability/tracer';
// The queue name comes from the adapter, not from the worker that drains it: producer and
// consumer must agree on the spelling, and `infrastructure` may not import application code to get it.
import {
    isQueueEnabled,
    publishToQueue,
    EMAIL_QUEUE,
    type JobPriority
} from '@infrastructure/adapters/queue';

/**
 * Absolute path to the EJS email templates, overridable with `NODE_EMAIL_TEMPLATES_DIR`.
 *
 * Under `shared/` rather than in a module: the template NAME travels through RabbitMQ to a
 * consumer that may be another process, so a bare filename stays portable where a path into
 * `src/modules` would not — the owner lives in the filename prefix instead. A function, not a
 * constant, for the same lazy-env reason as {@link getTransporter}.
 *
 * See: docs/tools/email-and-rendering.md#templates-interpolate-they-do-not-translate
 */
export const emailTemplatesDirectory = (): string =>
    process.env.NODE_EMAIL_TEMPLATES_DIR
        ? path.resolve(process.env.NODE_EMAIL_TEMPLATES_DIR)
        : path.resolve(process.cwd(), 'shared/templates/emails');

/**
 * The file an outbox name renders from.
 *
 * The single point where the identifier becomes a path, and so the single place `.ejs` is written.
 * Which engine renders a mail is this backend's business; the name is not, because the demo outbox
 * publishes it and the paired frontend asserts on it against both backends.
 *
 * @param templateName - an {@link EmailContent.template} name, without extension
 */
export const templateFile = (templateName: string): string =>
    path.resolve(emailTemplatesDirectory(), `${templateName}.ejs`);

/**
 * How this deployment treats an email.
 *
 * `smtp`    hand it to the configured mail server.
 * `log`     render it and log the send, opening no socket — nodemailer's own `jsonTransport`.
 * `outbox`  keep it in memory, where `GET /__test/emails` can read it back.
 *
 * The pattern is Laravel's `MAIL_MAILER` and Symfony's `MAILER_DSN`: one named setting rather
 * than a condition per caller. No `none`, deliberately — it would differ from `log` only by
 * skipping the render, and the render is where a template bug surfaces.
 */
export type MailTransport = 'smtp' | 'log' | 'outbox';

/** {@link MailTransport}, as a list — `environmentChoice`'s own `allowed` set. */
const MAIL_TRANSPORTS: readonly MailTransport[] = ['smtp', 'log', 'outbox'];

/**
 * Which transport this process uses, resolved per send.
 *
 * Two safety rails sit ABOVE the setting, because neither is a preference a deployment gets to
 * express. The demo profile's outbox IS its control surface — `GET /__test/emails` is how the
 * paired e2e suite reads a reset token — so a `.env` naming `smtp` must not quietly empty it. And
 * a test run must never open a socket whatever the environment says, or the suite delivers real
 * mail using the real credentials `dotenv` just loaded.
 *
 * Below those, `NODE_MAIL_TRANSPORT` decides, and SMTP is what a deployment that says nothing
 * gets — the behaviour every existing caller already had.
 *
 * @throws {Error} when it is set to something none of the three transports recognise
 */
export const resolveMailTransport = (): MailTransport => {
    if (isDemoMode()) return 'outbox';
    if (process.env.NODE_ENV === 'test') return 'log';

    return environmentChoice('NODE_MAIL_TRANSPORT', MAIL_TRANSPORTS, 'smtp');
};

/**
 * The mailer's companions to `NODE_SMTP_HOST` — the ones a transport cannot authenticate or
 * address without.
 */
const SMTP_COMPANIONS = ['NODE_SMTP_USER', 'NODE_SMTP_PASS', 'NODE_SMTP_SENDER'] as const;

/**
 * SMTP is all-or-nothing rather than required: `account/two-factor/methods/email.ts` gates the
 * email second factor on `NODE_SMTP_HOST` being set at all, so leaving mail unconfigured is a
 * choice. A host set *without* its credentials is not — it builds a transport that only fails
 * when something first tries to send, which is a real user asking to reset a password. Called
 * from the boot gate (`src/app/required-config.ts`), not the kernel — the kernel does not know
 * this module owns SMTP.
 *
 * @returns the companion variables left unset alongside a configured host
 */
export const missingSmtpCompanions = (): string[] =>
    process.env.NODE_SMTP_HOST ? SMTP_COMPANIONS.filter((key) => !process.env[key]) : [];

/** The memoised transport. See {@link getTransporter}. */
let transport: Transporter | undefined;

/**
 * Reset the memoised transport. Test seam: a suite that varies SMTP configuration changes the
 * environment and asks for a fresh transport, instead of resetting the module registry and
 * re-importing this file to get one.
 */
export const resetTransporter = (): void => {
    transport = undefined;
};

/**
 * The transport, built on first use and reused: nodemailer pools connections, so a per-email
 * transport would pay the TCP + TLS + AUTH handshake every time. LAZY rather than module-scope,
 * so the environment is read when first needed, not frozen at import — which is also what lets
 * {@link resetTransporter} hand a suite a fresh one after it varies the configuration.
 *
 * `log` is nodemailer's own `jsonTransport`: it renders and returns the message, and opens no
 * socket.
 *
 * See: docs/tools/email-and-rendering.md#smtp-configuration
 */
const getTransporter = (): Transporter => {
    if (transport) return transport;

    /** The port the SMTP client dials, and the one fact `secure` is derived from. */
    const port = environmentNumber('NODE_SMTP_PORT', 587, 1);

    transport =
        // Two calls rather than one with a ternary argument: `createTransport` is overloaded per
        // transport kind, and a union argument matches no single overload.
        resolveMailTransport() === 'log'
            ? createTransport({ jsonTransport: true })
            : createTransport({
                  // Hostname this client announces in the SMTP EHLO greeting. Some strict servers
                  // check it.
                  name: process.env.NODE_SMTP_NAME ?? '',
                  // SMTP server to connect to.
                  host: process.env.NODE_SMTP_HOST ?? '',
                  // 587 = submission with STARTTLS (the modern default); 465 = implicit TLS;
                  // 25 = relay.
                  port,
                  // `secure: true` means TLS from the first byte, which is only correct on 465.
                  // On 587 it must be false — the connection starts plaintext and is upgraded via
                  // STARTTLS. Compared as a NUMBER, so a zero-padded `0465` cannot read as "not
                  // 465" and open a plaintext connection to a port expecting TLS immediately.
                  secure: port === 465,
                  // SMTP AUTH credentials. Empty strings when unset, in which case nodemailer
                  // attempts an unauthenticated send and the server rejects it — the failure
                  // surfaces at send time, not at boot, because email is not a hard startup
                  // dependency.
                  auth: {
                      user: process.env.NODE_SMTP_USER ?? '',
                      pass: process.env.NODE_SMTP_PASS ?? ''
                  }
              });

    return transport;
};

/** What `resolveSpooled` turns one spooled attachment into — nodemailer's own `{filename, path}` shape. */
interface ResolvedAttachment {
    filename: string;
    path: string;
}

/**
 * Resolves a request's `{ filename, key }` attachments off the mail spool into nodemailer's own
 * `{ filename, path }` shape.
 *
 * Each key is resolved inside the spool root — one that fails to resolve (malformed; should not
 * happen, since only `spoolAttachment` ever mints one) is logged and dropped rather than handed to
 * nodemailer as a broken path.
 *
 * @param attachments - a request's own `attachments`, absent for one that names none
 */
const resolveAttachments = (
    attachments: EmailJobPayload['request']['attachments'] = []
): ResolvedAttachment[] =>
    attachments.flatMap(({ filename, key }) => {
        const target = resolveSpooled(key);
        if (target) return [{ filename, path: target }];
        // Stryker disable all
        logger.warn({
            message: 'Email attachment named an unresolvable spool key, skipping it.',
            key
        });
        // Stryker restore all
        return [];
    });

/**
 * nodemailer: hands the transporter one fully-built message and returns its `sendMail` promise —
 * the ONE call site this module routes every outbound message through.
 * https://nodemailer.com/message/
 *
 * @param message - the complete envelope to send as-is; {@link sendTemplatedEmail} is what fills
 *   in the defaults (`from`, `html`, resolved `attachments`) before reaching here.
 */
const send = (message: SendMailOptions): Promise<SentMessageInfo> =>
    getTransporter().sendMail(message);

/**
 * Send an email via SMTP for the requested template and options.
 *
 * Sends synchronously — the caller's promise doesn't settle until the mail server accepts the
 * message. Prefer `enqueueEmail` below on request paths, so a slow SMTP server can't stretch
 * out an HTTP response.
 *
 * Never discards a spooled attachment itself: this may be one attempt of several behind a queued
 * job's retry chain, and deleting the file here would leave every later attempt resolving a key
 * that no longer exists — see `email.worker.ts#discardJobAttachments` and `enqueueEmail`'s inline
 * path for the two callers who actually know a job is finished with its attachment.
 *
 * @param request - nodemailer envelope (to, subject, attachments, ...). `from` and `html`
 *                  are filled in here, but anything passed in overrides them.
 * @param templateName - the outbox name, without extension — see {@link EmailContent.template}
 * @param data - variables interpolated into the EJS template
 */
export const sendTemplatedEmail = (
    request: EmailJobPayload['request'],
    templateName: string,
    data: Data
): Promise<SentMessageInfo> => {
    const { attachments = [], ...envelope } = request;

    // The outbox keeps the message where `GET /__test/emails` can read it, and renders nothing:
    // the paired suite asserts on the template NAME and the data, never on the HTML.
    if (resolveMailTransport() === 'outbox') {
        recordDemoEmail(request, templateName, data);
        return Promise.resolve({ messageId: 'demo-outbox' });
    }

    // Wrap the entire email operation in an OTel span to track latency and failures.
    return withSpan('email.send', (span) => {
        // Span attributes = searchable/filterable dimensions on the trace. These let you ask
        // "which template is slowest?" or "which recipients failed?" in the tracing backend.
        span.setAttributes({
            // `messaging.system` — the transport being used. Standard key, so backends group
            // this alongside other messaging spans.
            [ATTR_MESSAGING_SYSTEM]: 'smtp',
            // `messaging.destination.name` — the recipient. `to` is a plain required string
            // on the contract's own `request` shape, unlike nodemailer's own wider type.
            [ATTR_MESSAGING_DESTINATION_NAME]: envelope.to,
            // Custom attribute: email template used to render the body.
            'email.template': templateName
        });

        const resolvedAttachments = resolveAttachments(attachments);

        return (
            ejs
                // `renderFile` reads the template from disk and returns the interpolated HTML.
                // EJS caches compiled templates internally, so repeat sends skip recompilation.
                /*
                 * `data` is the WHOLE render context — no `t`, no locale lookup, nothing
                 * ambient. Every string a template prints was translated by the producer while
                 * the request that asked for the email was still alive, so this function (and
                 * the worker that calls it, possibly in another process, hours later) does not
                 * need to know what a locale is.
                 */
                .renderFile(templateFile(templateName), { ...data })
                .then((html) =>
                    send({
                        // Default sender; spread below lets a caller override it.
                        from: process.env.NODE_SMTP_SENDER,
                        // The rendered template becomes the HTML body.
                        html,
                        // Spread last, so caller-supplied fields (to/subject, and even
                        // `from`/`html`) take precedence over the defaults above.
                        ...envelope,
                        // Resolved separately, after the spread: nothing in `envelope` ever
                        // carries a raw `attachments` field (destructured out above), and a
                        // caller must never be able to hand nodemailer anything but a path this
                        // adapter resolved itself.
                        ...(resolvedAttachments.length > 0
                            ? { attachments: resolvedAttachments }
                            : {})
                    })
                )
                .then((info: { messageId: string }) => {
                    // `messageId` is the SMTP server's identifier — the handle you need to trace
                    // a specific email through mail-server logs or a provider dashboard.
                    // Stryker disable next-line all
                    logger.info('Message sent: %s', info.messageId);
                    return info;
                })
            // No .catch(): a rejection propagates so `withSpan` can mark the span as errored
            // and the caller (or the queue worker's nack path) can react.
        );
    });
};

/**
 * One email's finished content: which template, and every string it prints.
 *
 * What a module's `emails.ts` returns and a controller hands to `enqueueEmail` — naming it keeps
 * the template and the copy it needs travelling together, in the one file that builds it.
 */
export interface EmailContent {
    /**
     * The name of this mail, prefixed with the module that owns it — `orders.order-confirm`. No
     * extension: the demo outbox publishes this field and the paired frontend's e2e specs read it
     * to identify which mail they're looking at, so it's shared with a backend that's never heard
     * of EJS. {@link templateFile} adds the suffix at the one point the name becomes a path.
     */
    template: string;
    /** Subject line, already translated. */
    subject: string;
    /** Everything the template interpolates, already translated. */
    data: Record<string, unknown>;
}

/**
 * Sends via `sendTemplatedEmail()`, then discards every spooled attachment once the send settles —
 * success or failure. Safe here, unlike inside `sendTemplatedEmail()` itself: this is
 * `enqueueEmail`'s inline path, with no retry chain behind it either way, so there is no later
 * attempt that would find the attachment already gone.
 */
const sendInline = (
    request: EmailJobPayload['request'],
    templateName: string,
    data: Data
): Promise<void> =>
    sendTemplatedEmail(request, templateName, data)
        .then(() => undefined)
        .finally(() =>
            Promise.all((request.attachments ?? []).map(({ key }) => discardSpooled(key))).then(
                () => undefined
            )
        );

/**
 * Queue-aware email dispatch — the function controllers should call. When RabbitMQ is reachable
 * the job is published for async processing; when it's unconfigured, or momentarily unreachable,
 * this falls back to sending inline, at the cost of request latency.
 *
 * The queue carries template *name* + data, not rendered HTML — rendering happens on the consumer
 * side. Adds nothing to `data`: every string the template prints was already produced by the
 * `emails.ts` builder that knows the template.
 *
 * @param request - the envelope, typed as the AsyncAPI contract's shape rather than Nodemailer's.
 *   Every field in it survives `JSON.stringify`, which is what makes the queued and inline paths
 *   the same call. Nodemailer's full `SendMailOptions` does not: `attachments: [{ content: Buffer }]`
 *   arrives as `{"type":"Buffer","data":[…]}`, so a wider type would work in dev (broker off) and
 *   silently corrupt in production. `request.attachments` carries a storage key instead —
 *   `{ filename, key }`, resolved against the mail spool by `resolveAttachments()`, never bytes.
 * @param priority - `'high'` for a mail someone is actively blocked on (a token-bearing link with
 *   a TTL); left at the `'normal'` default for everything informational. See `queue.ts`'s
 *   `JobPriority` for why there are only two levels. Meaningless on the inline fallback — priority
 *   only affects ordering among messages waiting on the broker.
 */
export const enqueueEmail = (
    request: EmailJobPayload['request'],
    templateName: string,
    data: Data,
    priority: JobPriority = 'normal'
): Promise<void> => {
    const dispatch = isQueueEnabled()
        ? // The type argument is the point: this literal is checked against the very type the
          // worker declares, so producer and consumer cannot drift apart silently. It is the
          // GENERATED contract type — `asyncapi.workers.yaml` declares `request` with
          // `additionalProperties: false`, so a local widening would permit a field the contract
          // forbids.
          publishToQueue<EmailJobPayload>({
              queue: EMAIL_QUEUE,
              // Must be JSON-serializable — `publishToQueue` stringifies it. Anything non-plain
              // (streams, Buffers, functions) in `request` would not survive the round trip.
              payload: { request, templateName, data },
              priority
          }).then((published) => {
              if (!published) {
                  // Fallback: queue publish failed, send directly.
                  return sendInline(request, templateName, data);
              }
              // `debug` level: enqueueing is routine, and the worker logs the actual delivery.
              // Stryker disable all
              logger.debug({
                  message: 'Email job enqueued.',
                  to: request.to,
                  template: templateName
              });
              // Stryker restore all
          })
        : // No broker configured → send inline.
          sendInline(request, templateName, data);

    // Every one of this function's 13+ call sites writes `void enqueueEmail(...)` — a rejection
    // here has nobody left to catch it, and would otherwise surface as an unhandled rejection with
    // no request id and no idea which email was lost. Logged with the two facts needed to find it
    // (which template, which recipient), then resolved: a lost email is never worth failing the
    // request that triggered it.
    return dispatch.catch((error: unknown) => {
        logger.error({
            message: 'Email dispatch failed; the message was not delivered.',
            template: templateName,
            to: request.to,
            error
        });
    });
};
