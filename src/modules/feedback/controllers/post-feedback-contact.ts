import type { Request, Response } from 'express';
import { z } from 'zod';
import { CreateFeedbackRequestBody } from '@api/schemas.zod';
import { successResponse } from '@infrastructure/http/response';
import type { CreateFeedbackRequest } from '@types';
import { feedbackRequestService } from '../service';
import { catchAs, parseBody } from '@infrastructure/http/controller';

/**
 * Built on the orval-generated CreateFeedbackRequestBody (kept in sync with
 * openapi.yaml); fields are overridden to add trimming and length limits not
 * expressed in the OpenAPI schema.
 */
const createFeedbackSchema = CreateFeedbackRequestBody.extend({
    name: z.string().trim().max(120).optional(),
    email: z.string().trim().pipe(z.email()),
    subject: z.string().trim().min(1).max(200),
    message: z.string().trim().min(1).max(5000)
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
            successResponse(response, createdFeedbackRequest, 201);
        })
        .catch(catchAs(response, 'postFeedbackContact'));
};
