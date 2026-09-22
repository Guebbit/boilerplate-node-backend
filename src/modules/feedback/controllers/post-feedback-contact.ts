/**
 * @module
 * Controller for `POST /feedback/contact` — the one public write this module has, mounted above
 * the admin gate in `../routes` rather than exempted from it.
 *
 * See: docs/modules/feedback.md
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import {
    CreateFeedbackRequestBody,
    createFeedbackRequestBodyNameMax,
    createFeedbackRequestBodySubjectMax,
    createFeedbackRequestBodyMessageMax
} from '@api/schemas.zod';
import { successResponse } from '@infrastructure/http/response';
import type { CreateFeedbackRequest, FeedbackRequest } from '@types';
import { feedbackRequestService } from '../service';
import { catchAs, parseBody } from '@infrastructure/http/controller';

/**
 * Built on the orval-generated CreateFeedbackRequestBody (kept in sync with openapi.yaml, which
 * already carries the length limits — re-applied here from its own generated constants, not
 * hand-copied numbers, so the two can't drift). Fields are overridden only for what the contract
 * itself can't express on top of that: trimming, and "not just whitespace" via `.min(1)`.
 * `.extend()` REPLACES a field's schema rather than adding to it, so the limit has to be
 * restated, not just the trim/min.
 */
const createFeedbackSchema = CreateFeedbackRequestBody.extend({
    name: z.string().trim().max(createFeedbackRequestBodyNameMax).optional(),
    email: z.string().trim().pipe(z.email()),
    subject: z.string().trim().min(1).max(createFeedbackRequestBodySubjectMax),
    message: z.string().trim().min(1).max(createFeedbackRequestBodyMessageMax)
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
            // `.toJSON()` applies the model's `_id` → `id` / date-to-ISO-string transform: the
            // document itself is typed as stored, not as the wire shape `FeedbackRequest` promises.
            successResponse<FeedbackRequest>(
                response,
                createdFeedbackRequest.toJSON() as FeedbackRequest,
                201
            );
        })
        .catch(catchAs(response, 'postFeedbackContact'));
};
