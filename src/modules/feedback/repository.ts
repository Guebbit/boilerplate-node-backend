import { feedbackRequestModel, applyFeedbackRequestTransform } from './model';
import type { FeedbackRequestDocument } from './model';
import { createRepository } from '@infrastructure/persistence/create-repository';

/**
 * Feedback Request Repository
 * Standard CRUD via the repository factory.
 *
 * `status` is deliberately absent from the search spec: it is a closed enum, and mapping a raw
 * string onto it is a domain decision the service makes before handing the result down as a scope.
 */
export const feedbackRequestRepository = createRepository<FeedbackRequestDocument>(
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
