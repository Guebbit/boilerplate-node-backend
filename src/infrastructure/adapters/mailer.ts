/**
 * @module
 * Email adapter: EJS template rendering + delivery through the named transport, optionally via the
 * queue.
 *
 * See: docs/tools/email-and-rendering.md
 */

// EJS = the HTML templating engine used for email bodies. `Data` is its type for the
// variables interpolated into a template (`<%= user.name %>`).
import ejs, { type Data } from 'ejs';
// nodemailer: `SendMailOptions` is `sendMail`'s own envelope shape — https://nodemailer.com/message/
// The sending itself is a transport's job (`./mail-transports`); `smtp` is `./smtp-transport`.
import type { SendMailOptions } from 'nodemailer';
// OTel semantic-convention keys for messaging spans — using the standard names lets tracing
// backends render this as a messaging operation instead of an opaque span. Still incubating,
// hence the `/incubating` subpath: the older `SEMATTRS_*` aliases are deprecated.
import { ATTR_MESSAGING_SYSTEM } from '@opentelemetry/semantic-conventions/incubating';
import type { EmailJobPayload } from '@types';
import { logger } from '@infrastructure/adapters/logger';
import { mailConfig } from '@infrastructure/adapters/config';
import { resolveMailTransport } from '@infrastructure/adapters/mail-transports';
import { resolveSpooled, discardSpooled } from '@infrastructure/adapters/mail-spool';
import { withSpan } from '@infrastructure/observability/tracer';
// The queue name comes from the adapter, not from the worker that drains it: producer and
// consumer must agree on the spelling, and `infrastructure` may not import application code to get it.
import { publishToQueue, EMAIL_QUEUE, type JobPriority } from '@infrastructure/adapters/queue';
// Split into its own leaf module, with no `ejs`/`nodemailer` import of its own — see that
// file's own header for why `tests/support/setup.ts` needs it kept that way. Re-exported below so
// every OTHER caller keeps importing from this one file, the mail adapter's own public surface.
import { templateFile } from '@infrastructure/adapters/template-registry';

export {
    registerTemplateDirectories,
    templateFile,
    registeredTemplateNames
} from '@infrastructure/adapters/template-registry';

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
 * Renders one email into the complete envelope nodemailer takes: the EJS template becomes the HTML
 * body, the sender defaults in, and the spooled attachments resolve to paths.
 *
 * @param envelope - the request without its attachments; its fields override the defaults
 * @param attachments - the request's `{ filename, key }` spool references
 * @param templateName - the outbox name, without extension
 * @param data - variables interpolated into the EJS template
 */
const renderMessage = (
    envelope: Omit<EmailJobPayload['request'], 'attachments'>,
    attachments: EmailJobPayload['request']['attachments'],
    templateName: string,
    data: Data
): Promise<SendMailOptions> => {
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
            // `root: process.cwd()` — a template's own `/shared/templates/layouts/...`
            // include is root-relative (EJS: a leading `/` resolves against `root`, not
            // against the including file's own directory), so this stays correct however
            // deep under `src/modules/<name>/templates` the file itself now lives.
            // https://ejs.co/#docs (Includes)
            .renderFile(templateFile(templateName), { ...data }, { root: process.cwd() })
            .then((html) => ({
                // Default sender; spread below lets a caller override it.
                from: mailConfig().NODE_SMTP_SENDER,
                // The rendered template becomes the HTML body.
                html,
                // Spread last, so caller-supplied fields (to/subject, and even
                // `from`/`html`) take precedence over the defaults above.
                ...envelope,
                // Resolved separately, after the spread: nothing in `envelope` ever
                // carries a raw `attachments` field (destructured out by the caller), and a
                // caller must never be able to hand nodemailer anything but a path this
                // adapter resolved itself.
                ...(resolvedAttachments.length > 0 ? { attachments: resolvedAttachments } : {})
            }))
    );
};

/**
 * Send an email through the configured transport for the requested template and options.
 *
 * Sends synchronously — the caller's promise doesn't settle until the transport accepts the
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
 * @throws {Error} (as a rejection) when `NODE_MAIL_TRANSPORT` names a transport this process
 *   does not register
 */
export const sendTemplatedEmail = (
    request: EmailJobPayload['request'],
    templateName: string,
    data: Data
): Promise<void> => {
    const { attachments, ...envelope } = request;

    // Wrap the entire email operation in an OTel span to track latency and failures.
    return withSpan('email.send', (span) => {
        // Span attributes = searchable/filterable dimensions on the trace. These let you ask
        // "which template is slowest?" in the tracing backend. Never the recipient: a trace
        // backend applies none of the logger's personal-field redaction.
        span.setAttributes({
            // `messaging.system` — the transport being used. Standard key, so backends group
            // this alongside other messaging spans.
            [ATTR_MESSAGING_SYSTEM]: mailConfig().NODE_MAIL_TRANSPORT,
            // Custom attribute: email template used to render the body.
            'email.template': templateName
        });

        return (
            // Inside the chain: an unknown transport name throws, and a throw from a function
            // typed as returning a promise would need every caller to try/catch as well.
            Promise.resolve()
                .then(resolveMailTransport)
                .then((transport) =>
                    transport.send({
                        request,
                        templateName,
                        data,
                        render: () => renderMessage(envelope, attachments, templateName, data)
                    })
                )
                .then((info) => {
                    // `messageId` is the transport's identifier — the handle you need to trace a
                    // specific email through mail-server logs or a provider dashboard. A
                    // transport that keeps the mail for a test to read has no receipt to log.
                    // Stryker disable next-line all
                    if (info) logger.info({ message: 'Message sent.', messageId: info.messageId });
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
    // No `isQueueEnabled()` pre-check: `publishToQueue` already resolves `false` with no I/O when
    // the broker is unconfigured, which the `!published` branch below sends inline exactly as a
    // configured-but-unreachable broker would — one fallback covers both, not two copies of it.
    //
    // The type argument is the point: this literal is checked against the very type the worker
    // declares, so producer and consumer cannot drift apart silently. It is the GENERATED contract
    // type — `asyncapi.workers.yaml` declares `request` with `additionalProperties: false`, so a
    // local widening would permit a field the contract forbids.
    const dispatch = publishToQueue<EmailJobPayload>({
        queue: EMAIL_QUEUE,
        // Must be JSON-serializable — `publishToQueue` stringifies it. Anything non-plain
        // (streams, Buffers, functions) in `request` would not survive the round trip.
        payload: { request, templateName, data },
        priority
    }).then((published) => {
        if (!published) {
            // Fallback: no broker configured, or the queue publish failed — send directly.
            return sendInline(request, templateName, data);
        }
        // `debug` level: enqueueing is routine, and the worker logs the actual delivery.
        // Stryker disable all
        logger.debug({
            message: 'Email job enqueued.',
            // Under `email`, the key the logger's personal-field mode hashes or redacts.
            email: request.to,
            template: templateName
        });
        // Stryker restore all
    });

    // Every one of this function's 13+ call sites writes `void enqueueEmail(...)` — a rejection
    // here has nobody left to catch it, and would otherwise surface as an unhandled rejection with
    // no request id and no idea which email was lost. Logged with the two facts needed to find it
    // (which template, which recipient), then resolved: a lost email is never worth failing the
    // request that triggered it.
    return dispatch.catch((error: unknown) => {
        logger.error({
            message: 'Email dispatch failed; the message was not delivered.',
            template: templateName,
            // Under `email`, the key the logger's personal-field mode hashes or redacts.
            email: request.to,
            error
        });
    });
};
