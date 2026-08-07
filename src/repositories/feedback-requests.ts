import { feedbackRequestModel, applyFeedbackRequestTransform } from '@models/feedback-requests';
import type { IFeedbackRequestDocument } from '@models/feedback-requests';
import { createBaseRepository } from './base';

/**
 * Feedback Request Repository
 * Standard CRUD via the base factory.
 *
 * `status` is deliberately absent from the search spec: it is a closed enum, and mapping a raw
 * string onto it is a domain decision the service makes before handing the result down as a scope.
 */
export const feedbackRequestRepository = createBaseRepository<IFeedbackRequestDocument>(
    feedbackRequestModel,
    {
        transform: applyFeedbackRequestTransform,
        searchable: {
            objectIds: { id: '_id' },
            regex: { email: 'email' },
            text: ['name', 'email', 'subject', 'message']
        }
    }
);
