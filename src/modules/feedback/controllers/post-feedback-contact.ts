/**
 * @module
 * Controller for `POST /feedback/contact` — the one public write this module has, mounted above
 * the admin gate in `../routes` rather than exempted from it.
 *
 * See: docs/modules/feedback.md
 */

import type { Request, Response } from 'express';
import { CreateFeedbackRequestBody } from '@api/schemas.zod';
import { trimmedInto } from '@infrastructure/http/schemas';
import { createdResponse } from '@infrastructure/http/response';
import type { CreateFeedbackRequest, FeedbackRequest } from '@types';
import { feedbackRequestService } from '../service';
import { presentFeedbackRequest } from '../presenter';
import { catchAs, parseBody } from '@infrastructure/http/controller';

/**
 * The generated `CreateFeedbackRequestBody` with each text field trimmed first, so whitespace
 * alone reads as empty. Every bound — the email's 254 cap included — is the contract's own, never
 * restated here.
 */
const createFeedbackSchema = CreateFeedbackRequestBody.extend({
    name: trimmedInto(CreateFeedbackRequestBody.shape.name.unwrap()).optional(),
    email: trimmedInto(CreateFeedbackRequestBody.shape.email),
    subject: trimmedInto(CreateFeedbackRequestBody.shape.subject),
    message: trimmedInto(CreateFeedbackRequestBody.shape.message)
});

/**
 * POST /feedback/contact (public)
 * Create a feedback ticket and send an email notification to the configured contact mailbox.
 */
export const postFeedbackContact = (
    request: Request<unknown, unknown, CreateFeedbackRequest>,
    response: Response
) => {
    const body = parseBody(createFeedbackSchema, request.body, response);
    if (!body) return;

    /*
     * The support notification is `feedbackRequestService.create`'s: who gets told, and in which
     * language, are facts about the ticket rather than about the request that filed it.
     */
    return feedbackRequestService
        .create(body)
        .then((createdFeedbackRequest) => {
            const feedbackRequest = presentFeedbackRequest(createdFeedbackRequest);
            createdResponse<FeedbackRequest>(
                response,
                feedbackRequest,
                `/feedback/${feedbackRequest.id}`
            );
        })
        .catch(catchAs(response, 'postFeedbackContact'));
};
