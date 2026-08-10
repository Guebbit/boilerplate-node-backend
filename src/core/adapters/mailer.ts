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
import { createTransport, type SendMailOptions, type SentMessageInfo } from 'nodemailer';
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
import { logger } from '@core/adapters/logger';
import { getCurrentLocale, t } from '@core/i18n';
import { withSpan } from '@core/observability/tracer';
import { isQueueEnabled, publishToQueue } from '@core/adapters/queue';
// Queue name shared with the worker that drains it — imported rather than duplicated so
// producer and consumer cannot drift apart.
import { EMAIL_QUEUE } from '../../workers/email.worker';

/**
 * Absolute path to the EJS email templates.
 *
 * Defaults to `views/templates-emails` under the process working directory, which is the project
 * root for every entry point (npm scripts, the compose command, tsx). There is no compile step —
 * `build` runs `ts-check` and lint, so the app always executes from source and `views/` never
 * moves. `NODE_EMAIL_TEMPLATES_DIR` overrides the whole path when it does.
 *
 * `tests/unit/core/adapters/mailer-templates.test.ts` asserts every template resolves under this
 * directory, so the path cannot silently rot.
 */
export const EMAIL_TEMPLATES_DIR = process.env.NODE_EMAIL_TEMPLATES_DIR
    ? path.resolve(process.env.NODE_EMAIL_TEMPLATES_DIR)
    : path.resolve(process.cwd(), 'views/templates-emails');

/**
 * Create a transporter object using the default SMTP transport.
 *
 * Built once at module load and reused: nodemailer pools SMTP connections internally, so a
 * per-email transport would pay the TCP + TLS + AUTH handshake every time.
 * Exported so tests can stub `transporter.sendMail`.
 *
 * Under `NODE_ENV=test` it is nodemailer's `jsonTransport` instead: it renders the envelope to
 * JSON and resolves, opening no socket. Without it the suite picks up the real credentials from
 * `.env` and delivers actual mail — the contract suite creates orders with generated addresses,
 * which got the sender a `550 ... blacklisted` from the relay, and because controllers dispatch
 * with `void enqueueEmail(...)` the rejection surfaced as an unhandled rejection attributed to
 * whichever unrelated test happened to be running.
 */
export const transporter =
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
              port: process.env.NODE_SMTP_PORT ? Number.parseInt(process.env.NODE_SMTP_PORT) : 587,
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
 * @param templateName - file name inside `src/views/templates-emails`
 * @param data - variables interpolated into the EJS template
 */
export const nodemailer = (
    request: SendMailOptions,
    templateName: string,
    data: Data
): Promise<SentMessageInfo> => {
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
            [ATTR_MESSAGING_DESTINATION_NAME]: String(request.to ?? ''),
            // Custom attribute: email template used to render the body.
            'email.template': templateName
        });

        return (
            // Render the EJS template
            ejs
                // `renderFile` reads the template from disk and returns the interpolated HTML.
                // EJS caches compiled templates internally, so repeat sends skip recompilation.
                .renderFile(path.resolve(EMAIL_TEMPLATES_DIR, templateName), {
                    // Every template resolves its copy through `t`, in the ambient locale — the
                    // request's when sent inline, the payload's when the worker replayed it
                    // inside `runWithLocale`. `locale` is exposed too, for `<html lang>`.
                    // Spread last so a caller can still override either for a one-off.
                    t,
                    locale: getCurrentLocale(),
                    ...data
                })
                /**
                 * Send email (nodemailer returns a Promise when no callback is provided)
                 */
                .then((html) =>
                    transporter.sendMail({
                        // Default sender; spread below lets a caller override it.
                        from: process.env.NODE_SMTP_SENDER,
                        // The rendered template becomes the HTML body.
                        html,
                        // Spread last, so caller-supplied fields (to/subject/attachments, and
                        // even `from`/`html`) take precedence over the defaults above.
                        ...request
                    })
                )
                .then((info: SentMessageInfo) => {
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
 */
export const enqueueEmail = (
    request: SendMailOptions,
    templateName: string,
    data: Data,
    locale: string = getCurrentLocale()
): Promise<void> => {
    // No broker configured → send inline. `.then(() => {})` discards SentMessageInfo so both
    // branches share the same `Promise<void>` return type.
    if (!isQueueEnabled()) return nodemailer(request, templateName, data).then(() => {});

    return publishToQueue({
        queue: EMAIL_QUEUE,
        // Must be JSON-serializable — `publishToQueue` stringifies it. Anything non-plain
        // (streams, Buffers, functions) in `request` would not survive the round trip.
        //
        // `locale` travels IN the payload because AsyncLocalStorage does not: the worker drains
        // this queue later, possibly in another process, with no request on its async chain.
        // Defaulting it to the ambient locale means every existing call site gets the caller's
        // language for free; a caller acting on someone else's behalf (a job sending to a user
        // at 3am) passes that user's persisted `locale` explicitly.
        payload: { request, templateName, data, locale }
    }).then((published) => {
        if (!published) {
            // Fallback: queue publish failed, send directly.
            return nodemailer(request, templateName, data).then(() => {});
        }
        // `debug` level: enqueueing is routine, and the worker logs the actual delivery.
        logger.debug({
            message: 'Email job enqueued.',
            to: request.to,
            template: templateName,
            locale
        });
    });
};
