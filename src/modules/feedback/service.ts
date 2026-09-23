/**
 * @module
 * Feedback request service — creation (with the operator notification), search, and status
 * triage. `toFeedbackStatus` is the one piece of domain logic worth naming: a write's `status`
 * is unreachable outside the closed enum, since the generated Zod enum already rejects it with a
 * 422 before this runs — the mapping only ever narrows a value the type already guarantees.
 *
 * See: docs/modules/feedback.md
 */

import {
    FeedbackRequestStatus,
    type SearchFeedbackRequestsRequest,
    type UpdateFeedbackRequestStatusRequest,
    type CreateFeedbackRequest
} from '@types';
import type { FeedbackRequestDocument } from './model';
import { feedbackRequestRepository } from './repository';
import {
    generateReject,
    generateSuccess,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { getDefaultLocale, t } from '@infrastructure/i18n';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { logger } from '@infrastructure/adapters/logger';
import { checkEmailPolicy } from '@infrastructure/adapters/antibot';
import { contactRequestEmail } from './emails';
import {
    readAll,
    MAX_CONFIGURED_PAGE_SIZE,
    type PaginatedMeta
} from '@infrastructure/persistence/search';
import type { Lean } from '@infrastructure/persistence/create-repository';
import type { CallerContext } from '@types';
import { recordAudit } from '@infrastructure/observability/audit';
import { feedbackAuditActions } from './audit';

/** Every value the generated `FeedbackRequestStatus` enum declares, for the membership check below. */
const FEEDBACK_STATUS_VALUES = Object.values(FeedbackRequestStatus) as string[];

/**
 * A write's `status` narrowed onto the closed set — unreachable with an invalid value, since the
 * generated Zod enum already answers 422 before this runs (`put-feedback-status.ts`). Exists so
 * `updateStatus` holds a real `FeedbackRequestStatus` rather than trusting the generated type
 * alone against a caller that bypasses the HTTP layer.
 */
const toFeedbackStatus = (status?: string): FeedbackRequestStatus | undefined =>
    status && FEEDBACK_STATUS_VALUES.includes(status)
        ? (status as FeedbackRequestStatus)
        : undefined;

/**
 * Where the operator's notification goes: the dedicated contact mailbox, then the generic SMTP
 * sender, then nowhere.
 *
 * Read per call rather than captured at import, so a deployment can change it without a restart —
 * the pattern `inventory/config.ts` sets for this repo.
 */
const notifyMailbox = (): string =>
    process.env.NODE_CONTACT_NOTIFY_EMAIL ?? process.env.NODE_SMTP_SENDER ?? '';

/**
 * Record a contact request and tell the support mailbox about it — unless the honeypot caught it.
 *
 * Both halves live here because "a customer asked us something" is one event, not a write plus a
 * thing the HTTP layer remembers to do afterwards.
 *
 * Why here:   in a controller instead, a second caller of `create` would file a ticket nobody was
 *             told about — and this module would publish its queue job from a controller while
 *             its sibling `delivery` publishes from the service.
 * Honeypot:   `payload.website` is a field a real browser always submits empty and a bot reliably
 *             fills, declared in the contract but never persisted (see `FeedbackRequestDocument`)
 *             or read back. A non-empty value writes the row as `spam` and skips the notification
 *             — the bot still gets its `201`, so it learns nothing, but nobody's inbox hears
 *             about it.
 * Disposable: a disposable-inbox domain (`checkEmailPolicy`, off by default) is treated the same
 *             way — filed as `spam`, notification skipped, still a `201`. A visible refusal would
 *             tell a spam script exactly which signal caught it.
 */
export const create = (payload: CreateFeedbackRequest): Promise<FeedbackRequestDocument> => {
    const email = payload.email.trim().toLowerCase();
    const honeypotFilled = Boolean(payload.website?.trim());

    return checkEmailPolicy(email).then((verdict) => {
        const suspectedSpam = honeypotFilled || verdict === 'refused';

        return feedbackRequestRepository
            .create({
                name: payload.name?.trim() || undefined,
                email,
                subject: payload.subject.trim(),
                message: payload.message.trim(),
                status: suspectedSpam ? FeedbackRequestStatus.spam : FeedbackRequestStatus.new
            })
            .then((created) => {
                if (suspectedSpam) return created;

                const notifyEmail = notifyMailbox();
                if (!notifyEmail) return created;

                /*
                 * The one email that must NOT follow the request's language.
                 *
                 * It goes to the support mailbox, not to the person who filled in the form, so it
                 * is built in `NODE_DEFAULT_LOCALE` — the operator's language, passed explicitly
                 * rather than inherited from whoever happened to submit the form. This is why it
                 * takes no `CallerContext`: there is deliberately nothing about the caller in it.
                 * The customer's own words (`subject`, `message`) pass through untouched, as they
                 * must.
                 */
                const operatorMail = contactRequestEmail(getDefaultLocale(), {
                    name: created.name,
                    email: created.email,
                    subject: created.subject,
                    message: created.message,
                    createdAt: created.createdAt?.toISOString()
                });

                void enqueueEmail(
                    { to: notifyEmail, subject: operatorMail.subject },
                    operatorMail.template,
                    operatorMail.data
                ).catch(
                    (error: unknown) =>
                        // Stryker disable all
                        logger.error({
                            message: 'feedback contact notification email failed',
                            error
                        })
                    // Stryker restore all
                );

                return created;
            });
    });
};

/**
 * Search feedback tickets by status, email fragment or free text, paginated.
 *
 * Emits `feedbackAuditActions.ADMIN_FEEDBACK_VIEWED` when a `context` is given — an omitted
 * context means "not an HTTP request" (a test, or future internal reuse as a plain query helper),
 * so no event is emitted for those.
 */
export const search = (
    // `page`/`pageSize` are widened to accept strings: they arrive from a query string, and
    // `normalizePagination` is what coerces and bounds them. `status` is already the closed enum
    // by the time it reaches here — the generated Zod schema validates it at the controller.
    filters: Omit<SearchFeedbackRequestsRequest, 'page' | 'pageSize'> & {
        page?: string | number;
        pageSize?: string | number;
    } = {},
    // Omitted by callers that are not a request answering `GET /feedback` (tests, and any future
    // internal reuse of this as a plain query helper) — no context means no emit.
    context?: CallerContext
): Promise<{
    items: FeedbackRequestDocument[];
    meta: PaginatedMeta;
}> =>
    // `status` is declared as a scope rather than on the repository's own search spec: it is a
    // closed enum with its own collection-wide meaning, not a per-field text/exact match.
    feedbackRequestRepository
        .search(filters, filters.status ? { status: filters.status } : {})
        .then((result) => {
            recordAudit(context, {
                action: feedbackAuditActions.ADMIN_FEEDBACK_VIEWED,
                outcome: 'success'
            });
            return result;
        });

/**
 * Applies a status/notes patch to an already-loaded feedback ticket and persists it.
 *
 * `respondedAt` is stamped once, the first time a ticket reaches `resolved` — re-resolving an
 * already-resolved ticket must not move the timestamp.
 */
export const updateStatus = (
    feedback: FeedbackRequestDocument,
    payload: UpdateFeedbackRequestStatusRequest
): Promise<ResponseSuccess<FeedbackRequestDocument> | ResponseReject> => {
    const nextStatus = toFeedbackStatus(payload.status);
    if (nextStatus !== undefined) feedback.status = nextStatus;
    if (payload.adminNotes !== undefined) feedback.adminNotes = payload.adminNotes;
    if (nextStatus === FeedbackRequestStatus.resolved && !feedback.respondedAt)
        feedback.respondedAt = new Date();
    return feedbackRequestRepository.save(feedback).then((saved) => generateSuccess(saved));
};

/**
 * Loads a ticket by id, applies {@link updateStatus}, and — on success — emits
 * `feedbackAuditActions.ADMIN_FEEDBACK_STATUS_UPDATED`.
 *
 * @returns A 404 `ResponseReject` when the id names no ticket, otherwise the save result.
 */
export const updateStatusById = (
    id: string,
    payload: UpdateFeedbackRequestStatusRequest,
    context?: CallerContext
): Promise<ResponseSuccess<FeedbackRequestDocument> | ResponseReject> =>
    feedbackRequestRepository.findById(id).then((feedback) => {
        if (!feedback) return generateReject(404, [t('generic.error-not-found')]);
        return updateStatus(feedback, payload).then((result) => {
            if (result.success)
                recordAudit(context, {
                    action: feedbackAuditActions.ADMIN_FEEDBACK_STATUS_UPDATED,
                    outcome: 'success',
                    target_type: 'feedback',
                    target_id: id,
                    metadata: { status: payload.status }
                });
            return result;
        });
    });

/**
 * Loads a ticket by id and permanently removes it, then — on success — emits
 * `feedbackAuditActions.ADMIN_FEEDBACK_DELETED`.
 *
 * No soft-delete tier: this module has none, so unlike `orders`' `removeById` there is no
 * `hardDelete` flag to thread through.
 *
 * @returns A 404 `ResponseReject` when the id names no ticket, otherwise the removal result.
 */
export const remove = (
    id: string,
    context?: CallerContext
): Promise<ResponseSuccess<undefined> | ResponseReject> =>
    feedbackRequestRepository.findById(id).then((feedback) => {
        if (!feedback) return generateReject(404, [t('generic.error-not-found')]);
        return feedbackRequestRepository.deleteOne(feedback).then(() => {
            recordAudit(context, {
                action: feedbackAuditActions.ADMIN_FEEDBACK_DELETED,
                outcome: 'success',
                target_type: 'feedback',
                target_id: id
            });
            return generateSuccess(undefined);
        });
    });

/**
 * A caller's own tickets, matched EXACTLY on `email` — for the account's own data export, behind
 * `NODE_EXPORT_INCLUDE_FEEDBACK` (the caller decides whether to include this; this function just
 * answers the question correctly once asked). Deliberately `findAll` with a raw filter, not
 * `search`'s `email` spec: that spec is a REGEX for staff free-text search, and a substring match
 * here would hand one person another's ticket whose address happens to contain theirs as a
 * substring. An account and a ticket sharing an address are still only a guess at being the same
 * person — the caller of this function is what decides whether that guess is worth taking.
 */
export const findOwnTickets = (email: string): Promise<Lean<FeedbackRequestDocument>[]> =>
    readAll(
        (page) =>
            feedbackRequestRepository.findAll(
                { email },
                { skip: (page - 1) * MAX_CONFIGURED_PAGE_SIZE, limit: MAX_CONFIGURED_PAGE_SIZE }
            ),
        MAX_CONFIGURED_PAGE_SIZE
    );

/** The module's barrel export — used by the controllers in `./controllers`. */
export const feedbackRequestService = {
    create,
    search,
    updateStatus,
    updateStatusById,
    remove,
    findOwnTickets
};
