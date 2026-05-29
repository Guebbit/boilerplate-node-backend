import { feedbackRequestModel } from '@models/feedback-requests';
import type { IFeedbackRequestDocument } from '@models/feedback-requests';
import type { QueryFilter } from 'mongoose';
import { createBaseRepository, type IFindAllOptions } from './base';

/**
 * Feedback Request Repository
 * Standard CRUD via base factory.
 */
const base = createBaseRepository<IFeedbackRequestDocument>(feedbackRequestModel);

export const findById = (id: string) => base.findById(id);
export const findAll = (where: QueryFilter<IFeedbackRequestDocument> = {}, options: IFindAllOptions = {}) => base.findAll(where, options);
export const count = (where: QueryFilter<IFeedbackRequestDocument> = {}): Promise<number> => base.count(where);
export const create = (data: Partial<IFeedbackRequestDocument>): Promise<IFeedbackRequestDocument> => base.create(data);
export const save = (feedback: IFeedbackRequestDocument): Promise<IFeedbackRequestDocument> => base.save(feedback);
