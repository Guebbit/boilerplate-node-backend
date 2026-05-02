import type { QueryOptions } from 'mongoose';
import { feedbackRequestModel } from '@models/feedback-requests';
import type {
    IFeedbackRequestDocument,
    IFeedbackRequestQueryFilter
} from '@models/feedback-requests';

export const findById = (id: string): Promise<IFeedbackRequestDocument | null> =>
    feedbackRequestModel.findById(id);

export const findAll = (
    filter: IFeedbackRequestQueryFilter = {},
    options: QueryOptions<IFeedbackRequestDocument> = {}
) =>
    feedbackRequestModel
        .find({ ...filter })
        .lean()
        // eslint-disable-next-line unicorn/no-array-sort
        .sort((options.sort as Record<string, 1 | -1>) ?? { createdAt: -1 })
        .skip(options.skip ?? 0)
        .limit(options.limit ?? 10);

export const count = (where: IFeedbackRequestQueryFilter = {}): Promise<number> =>
    feedbackRequestModel.countDocuments(where);

export const create = (
    data: Partial<IFeedbackRequestDocument>
): Promise<IFeedbackRequestDocument> => feedbackRequestModel.create(data);

export const save = (feedback: IFeedbackRequestDocument): Promise<IFeedbackRequestDocument> =>
    feedback.save();

export const feedbackRequestRepository = {
    findById,
    findAll,
    count,
    create,
    save
};
