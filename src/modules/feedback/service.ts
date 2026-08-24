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
import { t } from '@infrastructure/i18n';
import type { PaginatedMeta } from '@infrastructure/persistence/search';

/**
 * OCP-compliant status mapping: adding a new status only requires adding one entry here.
 *
 * Lowercase only, matching `openapi.yaml`'s `enum: [new, in_progress, resolved, spam]`. Uppercase
 * aliases would accept values the contract does not allow — dead on `PUT /feedback/:id`, where
 * the generated Zod schema 422s them first, and actively wrong on the unguarded search path.
 */
const STATUS_MAP: Record<string, FeedbackRequestStatus> = {
    new: FeedbackRequestStatus.new,
    in_progress: FeedbackRequestStatus.in_progress,
    resolved: FeedbackRequestStatus.resolved,
    spam: FeedbackRequestStatus.spam
};

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
    status ? STATUS_MAP[status] : undefined;

export const create = (payload: CreateFeedbackRequest): Promise<FeedbackRequestDocument> =>
    feedbackRequestRepository.create({
        name: payload.name?.trim() || undefined,
        email: payload.email.trim().toLowerCase(),
        subject: payload.subject.trim(),
        message: payload.message.trim(),
        status: FeedbackRequestStatus.new
    });

export const search = (
    // `page`/`pageSize` are widened to accept strings: they arrive from a query string, and
    // `normalizePagination` is what coerces and bounds them. `status` stays a raw string until
    // `toFeedbackStatus` maps it onto the closed enum.
    filters: Omit<SearchFeedbackRequestsRequest, 'status' | 'page' | 'pageSize'> & {
        status?: string;
        page?: string | number;
        pageSize?: string | number;
    } = {}
): Promise<{
    items: FeedbackRequestDocument[];
    meta: PaginatedMeta;
}> =>
    // `status` is mapped here rather than declared on the repository: turning a raw string into
    // a member of the closed `FeedbackRequestStatus` enum is a domain rule, so it is passed down
    // as a scope once resolved.
    feedbackRequestRepository.search(
        filters,
        filters.status ? { status: toFeedbackStatus(filters.status) } : {}
    );

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

export const updateStatusById = (
    id: string,
    payload: UpdateFeedbackRequestStatusRequest
): Promise<ResponseSuccess<FeedbackRequestDocument> | ResponseReject> =>
    feedbackRequestRepository.findById(id).then((feedback) => {
        if (!feedback) return generateReject(404, [t('generic.error-not-found')]);
        return updateStatus(feedback, payload);
    });

export const feedbackRequestService = {
    create,
    search,
    updateStatus,
    updateStatusById
};
