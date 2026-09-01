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
// nodemailer: `createTransport` builds a reusable SMTP sender; `SendMailOptions` is the
// per-message envelope (to/subject/attachments/…); `SentMessageInfo` is the server's reply
// (messageId, accepted/rejected recipients).
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
import { environmentNumber } from '@infrastructure/runtime/environment';
import { isDemoMode, recordDemoEmail } from '@infrastructure/adapters/demo-outbox';
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
        : path.resolve(process.cwd(), 'shared/views/templates-emails');

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

/** The memoised SMTP transport. See {@link getTransporter}. */
let transport: Transporter | undefined;

/**
 * Reset the memoised transport. Test seam: a suite that varies SMTP configuration changes the
 * environment and asks for a fresh transport, instead of resetting the module registry and
 * re-importing this file to get one.
 */
export const resetTransporter = (): void => {
    transport = undefined;
};

/** The port the SMTP client dials, and the one fact `secure` is derived from. */
const smtpPort = (): number => environmentNumber('NODE_SMTP_PORT', 587, 1);

/**
 * The SMTP transport, built on first use and reused: nodemailer pools connections, so a
 * per-email transport would pay the TCP + TLS + AUTH handshake every time. LAZY rather than
 * module-scope, so the environment is read when first needed, not frozen at import. Under
 * `NODE_ENV=test` it's nodemailer's `jsonTransport`, which opens no socket — without it the
 * suite would deliver actual mail using real `.env` credentials.
 *
 * See: docs/tools/email-and-rendering.md#smtp-configuration
 */
const getTransporter = (): Transporter => {
    if (transport) return transport;

    transport =
        // Two calls rather than one with a ternary argument: `createTransport` is overloaded per
        // transport kind, and a union argument matches no single overload.
        process.env.NODE_ENV === 'test'
            ? createTransport({ jsonTransport: true })
            : createTransport({
                  // Hostname this client announces in the SMTP EHLO greeting. Some strict servers
                  // check it.
                  name: process.env.NODE_SMTP_NAME ?? '',
                  // SMTP server to connect to.
                  host: process.env.NODE_SMTP_HOST ?? '',
                  // 587 = submission with STARTTLS (the modern default); 465 = implicit TLS;
                  // 25 = relay.
                  port: smtpPort(),
                  // `secure: true` means TLS from the first byte, which is only correct on 465.
                  // On 587 it must be false — the connection starts plaintext and is upgraded via
                  // STARTTLS. Compared as a NUMBER, so a zero-padded `0465` cannot read as "not
                  // 465" and open a plaintext connection to a port expecting TLS immediately.
                  secure: smtpPort() === 465,
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

/**
 * Send an email via SMTP for the requested template and options.
 *
 * Sends synchronously — the caller's promise doesn't settle until the mail server accepts the
 * message. Prefer `enqueueEmail` below on request paths, so a slow SMTP server can't stretch
 * out an HTTP response.
 *
 * @param request - nodemailer envelope (to, subject, attachments, ...). `from` and `html`
 *                  are filled in here, but anything passed in overrides them.
 * @param templateName - the outbox name, without extension — see {@link EmailContent.template}
 * @param data - variables interpolated into the EJS template
 */
export const nodemailer = (
    request: SendMailOptions,
    templateName: string,
    data: Data
): Promise<SentMessageInfo> => {
    // Demo profile: no SMTP exists; record the send where the e2e suite can read it instead.
    if (isDemoMode()) {
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
            // `messaging.destination.name` — the recipient. `request.to` can be a string, an
            // address object, or an array, hence the String() coercion.
            [ATTR_MESSAGING_DESTINATION_NAME]:
                typeof request.to === 'string' ? request.to : JSON.stringify(request.to ?? ''),
            // Custom attribute: email template used to render the body.
            'email.template': templateName
        });

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
                    getTransporter().sendMail({
                        // Default sender; spread below lets a caller override it.
                        from: process.env.NODE_SMTP_SENDER,
                        // The rendered template becomes the HTML body.
                        html,
                        // Spread last, so caller-supplied fields (to/subject/attachments, and
                        // even `from`/`html`) take precedence over the defaults above.
                        ...request
                    })
                )
                .then((info: { messageId: string }) => {
                    // `messageId` is the SMTP server's identifier — the handle you need to trace
                    // a specific email through mail-server logs or a provider dashboard.
                    logger.info('Message sent: %s', info.messageId);
                    return info;
                })
            // No .catch(): a rejection propagates so `withSpan` can mark the span as errored
            // and the caller (or the queue worker's nack path) can react.
        );
    });
};

/**
 * The envelope an email job carries — the AsyncAPI contract's shape, not Nodemailer's.
 *
 * Every field here survives `JSON.stringify`, which is what makes the queued and inline paths the
 * same call. Nodemailer's full `SendMailOptions` does not: `attachments: [{ content: Buffer }]`
 * arrives as `{"type":"Buffer","data":[…]}`, so a wider type would work in dev (broker off) and
 * silently corrupt in production. A project needing attachments should send a storage key instead.
 */
export type EmailRequest = EmailJobPayload['request'];

/**
 * What one email job carries on the queue — the second thing a producer and its consumer must
 * agree on exactly. It lives here, with the producer, for the same reason `EMAIL_QUEUE` lives
 * with the queue adapter; the worker re-exports this type rather than declaring its own, so
 * there's one definition to change. It IS the generated contract type — `asyncapi.workers.yaml`
 * declares `request` with `additionalProperties: false`, so a local widening would permit a field
 * the contract forbids.
 */
export type EmailJob = EmailJobPayload;

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
 * Queue-aware email dispatch — the function controllers should call. When RabbitMQ is reachable
 * the job is published for async processing; when it's unconfigured, or momentarily unreachable,
 * this falls back to sending inline, at the cost of request latency.
 *
 * The queue carries template *name* + data, not rendered HTML — rendering happens on the consumer
 * side. Adds nothing to `data`: every string the template prints was already produced by the
 * `emails.ts` builder that knows the template.
 *
 * @param priority - `'high'` for a mail someone is actively blocked on (a token-bearing link with
 *   a TTL); left at the `'normal'` default for everything informational. See `queue.ts`'s
 *   `JobPriority` for why there are only two levels. Meaningless on the inline fallback — priority
 *   only affects ordering among messages waiting on the broker.
 */
export const enqueueEmail = (
    request: EmailRequest,
    templateName: string,
    data: Data,
    priority: JobPriority = 'normal'
): Promise<void> => {
    // No broker configured → send inline. `.then(() => undefined)` discards SentMessageInfo so both
    // branches share the same `Promise<void>` return type.
    if (!isQueueEnabled()) return nodemailer(request, templateName, data).then(() => undefined);

    // The type argument is the point: this literal is checked against the very type the worker
    // declares, so producer and consumer cannot drift apart silently.
    return publishToQueue<EmailJob>({
        queue: EMAIL_QUEUE,
        // Must be JSON-serializable — `publishToQueue` stringifies it. Anything non-plain
        // (streams, Buffers, functions) in `request` would not survive the round trip.
        payload: { request, templateName, data },
        priority
    }).then((published) => {
        if (!published) {
            // Fallback: queue publish failed, send directly.
            return nodemailer(request, templateName, data).then(() => undefined);
        }
        // `debug` level: enqueueing is routine, and the worker logs the actual delivery.
        logger.debug({
            message: 'Email job enqueued.',
            to: request.to,
            template: templateName
        });
    });
};
