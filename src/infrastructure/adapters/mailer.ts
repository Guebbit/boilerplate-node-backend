/**
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
// OTel semantic-convention keys for messaging spans. Using the standard attribute names
// means tracing backends can render this as a messaging operation instead of an opaque span.
// The messaging conventions are still incubating, hence the `/incubating` subpath — that is
// where the current `ATTR_*` names live. The older `SEMATTRS_*` aliases are deprecated, and
// `SEMATTRS_MESSAGING_DESTINATION` is not merely renamed: the attribute key itself moved from
// `messaging.destination` to `messaging.destination.name`.
import {
    ATTR_MESSAGING_SYSTEM,
    ATTR_MESSAGING_DESTINATION_NAME
} from '@opentelemetry/semantic-conventions/incubating';
import type { EmailJobPayload } from '@types';
import { logger } from '@infrastructure/adapters/logger';
import { isDemoMode, recordDemoEmail } from '@infrastructure/adapters/demo-outbox';
import { withSpan } from '@infrastructure/observability/tracer';
// The queue name comes from the adapter, not from the worker that drains it: producer and
// consumer must agree on the spelling, and `infrastructure` may not import application code to get it.
import { isQueueEnabled, publishToQueue, EMAIL_QUEUE } from '@infrastructure/adapters/queue';

/**
 * Absolute path to the EJS email templates, overridable with `NODE_EMAIL_TEMPLATES_DIR`.
 *
 * Under `shared/` rather than in a module even though most templates belong to one: the template
 * NAME travels through RabbitMQ to a consumer that may be another process, so a bare filename
 * resolved against the consumer's own directory stays portable where a path into `src/modules`
 * would not. The owner lives in the filename prefix instead.
 *
 * See: docs/tools/email-and-rendering.md#templates-interpolate-they-do-not-translate
 */
export const EMAIL_TEMPLATES_DIR = process.env.NODE_EMAIL_TEMPLATES_DIR
    ? path.resolve(process.env.NODE_EMAIL_TEMPLATES_DIR)
    : path.resolve(process.cwd(), 'shared/views/templates-emails');

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

/**
 * The SMTP transport, built on first use and reused: nodemailer pools connections, so a per-email
 * transport would pay the TCP + TLS + AUTH handshake every time.
 *
 * LAZY rather than module-scope, so the environment is read when the transport is first needed
 * rather than frozen at import time — the same behaviour in production, and an ordinary function
 * call to test.
 *
 * Under `NODE_ENV=test` it is nodemailer's `jsonTransport`, which opens no socket. Without it the
 * suite picks up the real credentials from `.env` and delivers actual mail.
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
                  port: process.env.NODE_SMTP_PORT
                      ? Number.parseInt(process.env.NODE_SMTP_PORT)
                      : 587,
                  // `secure: true` means TLS from the first byte, which is only correct on 465.
                  // On 587 it must be false — the connection starts plaintext and is upgraded via
                  // STARTTLS.
                  secure: process.env.NODE_SMTP_PORT === '465', // True for 465, false otherwise
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
 * Send email to requested target
 * Retrieve the selected template and apply the requested options
 *
 * If file already exists: it will be overwritten
 *
 * Sends synchronously over SMTP — the caller's promise does not settle until the mail server
 * accepts the message. Prefer `enqueueEmail` below on request paths, so a slow SMTP server
 * cannot stretch out an HTTP response.
 *
 * @param request - nodemailer envelope (to, subject, attachments, ...). `from` and `html`
 *                  are filled in here, but anything passed in overrides them.
 * @param templateName - file name inside {@link EMAIL_TEMPLATES_DIR}
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
            // Render the EJS template
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
                .renderFile(path.resolve(EMAIL_TEMPLATES_DIR, templateName), { ...data })
                /**
                 * Send email (nodemailer returns a Promise when no callback is provided)
                 */
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
 * Every field here survives `JSON.stringify`, which is what makes the queued path and the inline
 * path the same call. Nodemailer's full `SendMailOptions` does not: `attachments: [{ content:
 * Buffer }]` arrives as `{"type":"Buffer","data":[…]}` and a `Readable` becomes `{}`, so a wider
 * type would let a caller write something that works in development — where the broker is off —
 * and corrupts the day it is switched on. A project that needs attachments should send a storage
 * key and let the worker fetch the bytes.
 */
export type EmailRequest = EmailJobPayload['request'];

/**
 * What one email job carries on the queue.
 *
 * It lives here, with the producer, for the reason `EMAIL_QUEUE` lives with the queue adapter: the
 * envelope is the second thing a producer and its consumer must agree on exactly, and a disagreement
 * is not an error anywhere — it is a job the worker quietly discards. The worker re-exports this
 * type rather than declaring its own, so there is one definition to change.
 *
 * It IS the generated contract type. `asyncapi.workers.yaml` declares `request` with
 * `additionalProperties: false`, so a local widening would be a field the type permits and the
 * contract forbids.
 */
export type EmailJob = EmailJobPayload;

/**
 * One email's finished content: which template, and every string it prints.
 *
 * This is what a module's `emails.ts` returns and what a controller hands to `enqueueEmail`. The
 * point of naming it is that the template and the copy it needs travel together — a template that
 * grows a paragraph grows a field here, in the one file that builds it, rather than in whichever
 * controllers happened to send that email.
 */
export interface EmailContent {
    /**
     * Template file name inside {@link EMAIL_TEMPLATES_DIR}, prefixed with the module that owns
     * it — `orders.order-confirm.ejs`. The templates sit in one flat directory so this stays a
     * bare name the queue can carry, and the prefix is what makes an orphan visible after its
     * module is deleted.
     */
    template: string;
    /** Subject line, already translated. */
    subject: string;
    /** Everything the template interpolates, already translated. */
    data: Record<string, unknown>;
}

/**
 * Queue-aware email dispatch.
 * When RabbitMQ is available the job is published for async processing;
 * otherwise it falls back to sending the email directly (same as before).
 *
 * This is the function controllers should call. Two fallbacks keep it safe: the queue being
 * unconfigured, and the queue being configured but momentarily unreachable. In both cases the
 * email is still sent — just inline, at the cost of request latency.
 *
 * Note the payload is only what the worker needs to reconstruct the call: rendering happens
 * on the consumer side, so the queue carries template *name* + data, not rendered HTML.
 *
 * This function adds nothing to `data` and resolves nothing in it. Everything the template prints
 * — down to the footer line and the `<html lang>` value — was produced by the `emails.ts` builder
 * that knows the template, so what goes on the queue is exactly what the caller assembled.
 */
export const enqueueEmail = (
    request: EmailRequest,
    templateName: string,
    data: Data
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
        payload: { request, templateName, data }
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
