import type { QueryOptions } from 'mongoose';
import { activityEventModel } from '@models/activity-events';
import type { IActivityEventDocument, IActivityEventQueryFilter } from '@models/activity-events';

export const findById = (id: string): Promise<IActivityEventDocument | null> =>
    activityEventModel.findById(id);

export const findAll = (
    filter: IActivityEventQueryFilter = {},
    options: QueryOptions<IActivityEventDocument> = {}
) =>
    activityEventModel
        .find({ ...filter })
        .lean()
        // eslint-disable-next-line unicorn/no-array-sort
        .sort((options.sort as Record<string, 1 | -1>) ?? { createdAt: -1 })
        .skip(options.skip ?? 0)
        .limit(options.limit ?? 10);

export const count = (where: IActivityEventQueryFilter = {}): Promise<number> =>
    activityEventModel.countDocuments(where);

export const create = (data: Partial<IActivityEventDocument>): Promise<IActivityEventDocument> =>
    activityEventModel.create(data);

export const save = (event: IActivityEventDocument): Promise<IActivityEventDocument> => event.save();

export const activityEventRepository = {
    findById,
    findAll,
    count,
    create,
    save
};
