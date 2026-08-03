import type { QueryFilter } from 'mongoose';
import {
    FeedbackRequestStatus,
    type SearchFeedbackRequestsRequest,
    type UpdateFeedbackRequestStatusRequest,
    type CreateFeedbackRequest
} from '@types';
import { applyFeedbackRequestTransform } from '@models/feedback-requests';
import type { IFeedbackRequestDocument } from '@models/feedback-requests';
import { feedbackRequestRepository } from '@repositories/feedback-requests';
import {
    normalizePagination,
    addTextFilter,
    addRegexFilter,
    paginatedSearch
} from '@repositories/search';
import {
    generateReject,
    generateSuccess,
    type IResponseSuccess,
    type IResponseReject
} from '@core/http/response';

/**
 * OCP-compliant status mapping: adding a new status only requires adding one entry here.
 *
 * Lowercase only, matching `openapi.yaml`'s `enum: [new, in_progress, resolved, spam]`. The
 * uppercase aliases this used to carry "for older clients" accepted values the contract has
 * never allowed — dead on `PUT /feedback/:id` (the generated Zod schema 422s them first) and
 * actively wrong on the search path, which had no such guard.
 */
const STATUS_MAP: Record<string, FeedbackRequestStatus> = {
    new: FeedbackRequestStatus.new,
    in_progress: FeedbackRequestStatus.in_progress,
    resolved: FeedbackRequestStatus.resolved,
    spam: FeedbackRequestStatus.spam
};

const toFeedbackStatus = (status?: string): FeedbackRequestStatus | undefined =>
    status ? STATUS_MAP[status] : undefined;

export const create = (payload: CreateFeedbackRequest): Promise<IFeedbackRequestDocument> =>
    feedbackRequestRepository.create({
        name: payload.name?.trim() || undefined,
        email: payload.email.trim().toLowerCase(),
        subject: payload.subject.trim(),
        message: payload.message.trim(),
        status: FeedbackRequestStatus.new
    });

export const search = (
    filters: Omit<SearchFeedbackRequestsRequest, 'status'> & { status?: string } = {}
): Promise<{
    items: IFeedbackRequestDocument[];
    meta: { page: number; pageSize: number; totalItems: number; totalPages: number };
}> => {
    const pagination = normalizePagination(filters);
    const where: QueryFilter<IFeedbackRequestDocument> = {};

    if (filters.status) where.status = toFeedbackStatus(filters.status);
    addRegexFilter(where as Record<string, unknown>, 'email', filters.email);
    addTextFilter(where as Record<string, unknown>, filters.text, [
        'name',
        'email',
        'subject',
        'message'
    ]);

    // findAll is lean — applyFeedbackRequestTransform normalizes it since .lean() bypasses toJSON.
    return paginatedSearch(feedbackRequestRepository, where, pagination).then((result) => ({
        ...result,
        items: (result.items as unknown as Record<string, unknown>[]).map((item) =>
            applyFeedbackRequestTransform(item)
        ) as unknown as IFeedbackRequestDocument[]
    }));
};

export const updateStatus = (
    feedback: IFeedbackRequestDocument,
    payload: UpdateFeedbackRequestStatusRequest
): Promise<IResponseSuccess<IFeedbackRequestDocument> | IResponseReject> => {
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
): Promise<IResponseSuccess<IFeedbackRequestDocument> | IResponseReject> =>
    feedbackRequestRepository.findById(id).then((feedback) => {
        if (!feedback) return generateReject(404, 'Not Found', ['Feedback request not found']);
        return updateStatus(feedback, payload);
    });

export const feedbackRequestService = {
    create,
    search,
    updateStatus,
    updateStatusById
};
