import type { QueryFilter } from 'mongoose';
import {
    SearchFeedbackRequestsRequest,
    UpdateFeedbackRequestStatusRequest,
    type CreateFeedbackRequest,
    type FeedbackRequestsResponse
} from '@types';
import { EFeedbackStatus, type IFeedbackRequestDocument } from '@models/feedback-requests';
import { feedbackRequestRepository } from '@repositories/feedback-requests';

const toFeedbackStatus = (
    status?:
        | SearchFeedbackRequestsRequest.StatusEnum
        | UpdateFeedbackRequestStatusRequest.StatusEnum
        | EFeedbackStatus
): EFeedbackStatus | undefined => {
    switch (status) {
        case SearchFeedbackRequestsRequest.StatusEnum.New:
        case UpdateFeedbackRequestStatusRequest.StatusEnum.New:
        case EFeedbackStatus.NEW: {
            return EFeedbackStatus.NEW;
        }
        case SearchFeedbackRequestsRequest.StatusEnum.InProgress:
        case UpdateFeedbackRequestStatusRequest.StatusEnum.InProgress:
        case EFeedbackStatus.IN_PROGRESS: {
            return EFeedbackStatus.IN_PROGRESS;
        }
        case SearchFeedbackRequestsRequest.StatusEnum.Resolved:
        case UpdateFeedbackRequestStatusRequest.StatusEnum.Resolved:
        case EFeedbackStatus.RESOLVED: {
            return EFeedbackStatus.RESOLVED;
        }
        case SearchFeedbackRequestsRequest.StatusEnum.Spam:
        case UpdateFeedbackRequestStatusRequest.StatusEnum.Spam:
        case EFeedbackStatus.SPAM: {
            return EFeedbackStatus.SPAM;
        }
        default: {
            return;
        }
    }
};

export const create = (payload: CreateFeedbackRequest): Promise<IFeedbackRequestDocument> =>
    feedbackRequestRepository.create({
        name: payload.name?.trim() || undefined,
        email: payload.email.trim().toLowerCase(),
        subject: payload.subject.trim(),
        message: payload.message.trim(),
        status: EFeedbackStatus.NEW
    });

export const search = (
    filters: SearchFeedbackRequestsRequest = {}
): Promise<FeedbackRequestsResponse> => {
    const page = Math.max(1, Number(filters.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize ?? 10) || 10));
    const skip = (page - 1) * pageSize;

    const where: QueryFilter<IFeedbackRequestDocument> = {};

    if (filters.status) where.status = toFeedbackStatus(filters.status);
    if (filters.email && String(filters.email).trim() !== '')
        where.email = { $regex: String(filters.email).trim(), $options: 'i' };
    if (filters.text && String(filters.text).trim() !== '') {
        const text = String(filters.text).trim();
        where.$or = [
            { name: { $regex: text, $options: 'i' } },
            { email: { $regex: text, $options: 'i' } },
            { subject: { $regex: text, $options: 'i' } },
            { message: { $regex: text, $options: 'i' } }
        ];
    }

    return feedbackRequestRepository.count(where).then((totalItems) =>
        feedbackRequestRepository
            .findAll(where, {
                sort: { createdAt: -1 },
                skip,
                limit: pageSize
            })
            .then((items) => ({
                items: items as unknown as FeedbackRequestsResponse['items'],
                meta: {
                    page,
                    pageSize,
                    totalItems,
                    totalPages: Math.ceil(totalItems / pageSize)
                }
            }))
    );
};

export const updateStatus = (
    id: string,
    payload: UpdateFeedbackRequestStatusRequest
): Promise<IFeedbackRequestDocument> =>
    feedbackRequestRepository.findById(id).then((feedback) => {
        if (!feedback) throw new Error('404');
        const nextStatus = toFeedbackStatus(payload.status);
        if (nextStatus !== undefined) feedback.status = nextStatus;
        if (payload.adminNotes !== undefined) feedback.adminNotes = payload.adminNotes;
        if (nextStatus === EFeedbackStatus.RESOLVED) feedback.respondedAt = new Date();
        return feedbackRequestRepository.save(feedback);
    });

export const feedbackRequestService = {
    create,
    search,
    updateStatus
};
