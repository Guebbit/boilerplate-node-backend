import type { Request, Response } from 'express';
import { z } from 'zod';
import { CreateFeedbackRequestBody } from '@api/schemas.zod';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { getDefaultLocale } from '@infrastructure/i18n';
import { logger } from '@infrastructure/adapters/logger';
import type { CreateFeedbackRequest } from '@types';
import { contactRequestEmail } from '../emails';
import { feedbackRequestService } from '../service';

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
    const parseResult = createFeedbackSchema.safeParse(request.body);
    if (!parseResult.success)
        return rejectResponse(
            response,
            422,
            parseResult.error.issues.map(({ message }) => message)
        );

    return feedbackRequestService
        .create(parseResult.data)
        .then((createdFeedbackRequest) => {
            // Notification target precedence: dedicated contact mailbox, then generic SMTP sender; skip email if neither is configured.
            const notifyEmail =
                process.env.NODE_CONTACT_NOTIFY_EMAIL ?? process.env.NODE_SMTP_SENDER ?? '';

            if (notifyEmail) {
                /*
                 * The one email that must NOT follow the request's language.
                 *
                 * It goes to the support mailbox, not to the person who filled in the form, so it
                 * is built in `NODE_DEFAULT_LOCALE` — the operator's language, passed explicitly
                 * rather than inherited from whoever happened to submit the form. The customer's
                 * own words (`subject`, `message`) pass through untouched, as they must.
                 */
                const operatorMail = contactRequestEmail(getDefaultLocale(), {
                    name: createdFeedbackRequest.name,
                    email: createdFeedbackRequest.email,
                    subject: createdFeedbackRequest.subject,
                    message: createdFeedbackRequest.message,
                    createdAt: createdFeedbackRequest.createdAt?.toISOString()
                });

                void enqueueEmail(
                    { to: notifyEmail, subject: operatorMail.subject },
                    operatorMail.template,
                    operatorMail.data
                ).catch((error: Error) =>
                    logger.error({
                        message: 'feedback contact notification email failed',
                        error: error.message
                    })
                );
            }

            successResponse(response, createdFeedbackRequest, 201);
        })
        .catch((error: Error) => rejectDatabaseError(response, 'postFeedbackContact', error));
};
