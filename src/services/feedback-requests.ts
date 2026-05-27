import type { QueryFilter } from 'mongoose';
import {
    type SearchFeedbackRequestsRequest,
    type UpdateFeedbackRequestStatusRequest,
    type CreateFeedbackRequest
} from '@types';
import { EFeedbackStatus, type IFeedbackRequestDocument } from '@models/feedback-requests';
import { feedbackRequestRepository } from '@repositories/feedback-requests';
import {
    normalizePagination,
    buildPaginatedMeta,
    addTextFilter,
    addRegexFilter
} from '@utils/search-helpers';
import {
    generateReject,
    generateSuccess,
    type IResponseSuccess,
    type IResponseReject
} from '@utils/response';

/**
 * OCP-compliant status mapping: adding a new status only requires adding one entry here.
 */
const STATUS_MAP: Record<string, EFeedbackStatus> = {
    NEW: EFeedbackStatus.NEW,
    new: EFeedbackStatus.NEW,
    IN_PROGRESS: EFeedbackStatus.IN_PROGRESS,
    in_progress: EFeedbackStatus.IN_PROGRESS,
    RESOLVED: EFeedbackStatus.RESOLVED,
    resolved: EFeedbackStatus.RESOLVED,
    SPAM: EFeedbackStatus.SPAM,
    spam: EFeedbackStatus.SPAM
};

const toFeedbackStatus = (status?: string): EFeedbackStatus | undefined =>
    status ? STATUS_MAP[status] : undefined;

export const create = (payload: CreateFeedbackRequest): Promise<IFeedbackRequestDocument> =>
    feedbackRequestRepository.create({
        name: payload.name?.trim() || undefined,
        email: payload.email.trim().toLowerCase(),
        subject: payload.subject.trim(),
        message: payload.message.trim(),
        status: EFeedbackStatus.NEW
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
    addTextFilter(where as Record<string, unknown>, filters.text, ['name', 'email', 'subject', 'message']);

    return feedbackRequestRepository.count(where).then((totalItems) =>
        feedbackRequestRepository
            .findAll(where, {
                sort: { createdAt: -1 },
                skip: pagination.skip,
                limit: pagination.pageSize
            })
            .then((items) => ({
                items,
                meta: buildPaginatedMeta(pagination, totalItems)
            }))
    );
};

export const updateStatus = (
    id: string,
    payload: UpdateFeedbackRequestStatusRequest
): Promise<IResponseSuccess<IFeedbackRequestDocument> | IResponseReject> =>
    feedbackRequestRepository.findById(id).then((feedback) => {
        if (!feedback) return generateReject(404, '404', ['Feedback request not found']);
        const nextStatus = toFeedbackStatus(payload.status);
        if (nextStatus !== undefined) feedback.status = nextStatus;
        if (payload.adminNotes !== undefined) feedback.adminNotes = payload.adminNotes;
        if (nextStatus === EFeedbackStatus.RESOLVED && !feedback.respondedAt)
            feedback.respondedAt = new Date();
        return feedbackRequestRepository.save(feedback).then((saved) =>
            generateSuccess(saved)
        );
    });

export const feedbackRequestService = {
    create,
    search,
    updateStatus
};
