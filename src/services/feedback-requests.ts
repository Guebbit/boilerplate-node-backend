import type { QueryFilter } from 'mongoose';
import type {
    CreateFeedbackRequest,
    SearchFeedbackRequestsRequest,
    FeedbackRequestsResponse,
    UpdateFeedbackRequestStatusRequest
} from '@types';
import { EFeedbackStatus, type IFeedbackRequestDocument } from '@models/feedback-requests';
import { feedbackRequestRepository } from '@repositories/feedback-requests';

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

    if (filters.status) where.status = filters.status as unknown as EFeedbackStatus;
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
        if (payload.status !== undefined) feedback.status = payload.status as unknown as EFeedbackStatus;
        if (payload.adminNotes !== undefined) feedback.adminNotes = payload.adminNotes;
        if ((payload.status as string | undefined) === EFeedbackStatus.RESOLVED)
            feedback.respondedAt = new Date();
        return feedbackRequestRepository.save(feedback);
    });

export const feedbackRequestService = {
    create,
    search,
    updateStatus
};
