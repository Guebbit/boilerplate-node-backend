/**
 * @module
 * Feedback request service — creation (with the operator notification), search, and status
 * triage. `toFeedbackStatus` is the one piece of domain logic worth naming: a filter value outside
 * the closed status enum narrows a READ to nothing, but is unreachable on a WRITE, which the
 * generated Zod enum already rejects with a 422.
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
import { contactRequestEmail } from './emails';
import type { PaginatedMeta } from '@infrastructure/persistence/search';
import type { CallerContext } from '@infrastructure/http/request';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { feedbackAuditActions } from './audit';

/** Every value the generated `FeedbackRequestStatus` enum declares, for the membership check below. */
const FEEDBACK_STATUS_VALUES = Object.values(FeedbackRequestStatus) as string[];

/**
 * DISPOSITION — a value outside the closed set.
 *
 *   absent           → the filter is not applied at all
 *   present, invalid → READ:  narrows to nothing. `search` still sets the scope key, and
 *                             `{ status: undefined }` matches no document.
 *                      WRITE: unreachable — the generated Zod enum answers 422 before this runs
 *                             (`put-feedback-status.ts`).
 *
 * The direction is the point: a filter the server could not parse must narrow to nothing, never
 * fall through to "return everything". A write does not get that treatment, because there is no
 * safe narrowing of an invalid value to write — only a rejection.
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
 * Both halves are here because "a customer asked us something" is one event, not a write plus a
 * thing the HTTP layer remembers to do afterwards: the notification used to live in
 * `post-feedback-contact.ts`, which meant a second caller of `create` filed a ticket nobody was
 * told about, and made this module the one that published its queue job from a controller while
 * its sibling `delivery` published from the service.
 *
 * `payload.website` is the honeypot: a field a real browser always submits empty and a bot
 * reliably fills, declared in the contract but never persisted (see `FeedbackRequestDocument`) or
 * read back. A non-empty value writes the row as `spam` and skips the notification — the bot still
 * gets its `201`, so it learns nothing, but nobody's inbox hears about it.
 */
export const create = (payload: CreateFeedbackRequest): Promise<FeedbackRequestDocument> => {
    const suspectedSpam = Boolean(payload.website?.trim());

    return feedbackRequestRepository
        .create({
            name: payload.name?.trim() || undefined,
            email: payload.email.trim().toLowerCase(),
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
             * It goes to the support mailbox, not to the person who filled in the form, so it is
             * built in `NODE_DEFAULT_LOCALE` — the operator's language, passed explicitly rather
             * than inherited from whoever happened to submit the form. This is why it takes no
             * `CallerContext`: there is deliberately nothing about the caller in it. The
             * customer's own words (`subject`, `message`) pass through untouched, as they must.
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
            ).catch((error: Error) =>
                logger.error({
                    message: 'feedback contact notification email failed',
                    error: error.message
                })
            );

            return created;
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
    // `normalizePagination` is what coerces and bounds them. `status` stays a raw string until
    // `toFeedbackStatus` maps it onto the closed enum.
    filters: Omit<SearchFeedbackRequestsRequest, 'status' | 'page' | 'pageSize'> & {
        status?: string;
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
    // `status` is mapped here rather than declared on the repository: turning a raw string into
    // a member of the closed `FeedbackRequestStatus` enum is a domain rule, so it is passed down
    // as a scope once resolved.
    feedbackRequestRepository
        .search(filters, filters.status ? { status: toFeedbackStatus(filters.status) } : {})
        .then((result) => {
            if (context)
                emitAuditEvent(
                    buildAuditEvent(context, {
                        action: feedbackAuditActions.ADMIN_FEEDBACK_VIEWED,
                        outcome: 'success'
                    })
                );
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
            if (context && result.success)
                emitAuditEvent(
                    buildAuditEvent(context, {
                        action: feedbackAuditActions.ADMIN_FEEDBACK_STATUS_UPDATED,
                        outcome: 'success',
                        target_type: 'feedback',
                        target_id: id,
                        metadata: { status: payload.status }
                    })
                );
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
            if (context)
                emitAuditEvent(
                    buildAuditEvent(context, {
                        action: feedbackAuditActions.ADMIN_FEEDBACK_DELETED,
                        outcome: 'success',
                        target_type: 'feedback',
                        target_id: id
                    })
                );
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
export const findOwnTickets = (email: string): Promise<FeedbackRequestDocument[]> =>
    feedbackRequestRepository.findAll({ email }, { limit: 100_000 });

/** The module's barrel export — used by the controllers in `./controllers`. */
export const feedbackRequestService = {
    create,
    search,
    updateStatus,
    updateStatusById,
    remove,
    findOwnTickets
};
