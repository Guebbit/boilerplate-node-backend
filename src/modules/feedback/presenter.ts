/**
 * @module
 * The one place a feedback ticket document becomes the wire shape `openapi.yaml` declares —
 * so `post-feedback-contact.ts` and `update-feedback-status.ts` share one transform instead of
 * each casting `.toJSON() as FeedbackRequest`.
 */

import type { FeedbackRequest } from '@types';
import type { FeedbackRequestDocument } from './model';

/**
 * `.toJSON()` applies the model's `_id` → `id` / date-to-ISO-string transform; Mongoose types its
 * result `any`, and this cast is what makes it a `FeedbackRequest`.
 */
export const presentFeedbackRequest = (document: FeedbackRequestDocument): FeedbackRequest =>
    document.toJSON() as FeedbackRequest;
