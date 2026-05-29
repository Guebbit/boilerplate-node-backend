import type { Request, Response } from 'express';
import { z } from 'zod';
import { successResponse, rejectResponse } from '@utils/response';
import { enqueueEmail } from '@utils/nodemailer';
import { logger } from '@utils/winston';
import type { CreateFeedbackRequest } from '@types';
import { feedbackRequestService } from '@services/feedback-requests';

const createFeedbackSchema = z.object({
    name: z.string().trim().max(120).optional(),
    email: z.string().email(),
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
            'Validation Error',
            parseResult.error.issues.map(({ message }) => message)
        );

    return feedbackRequestService
        .create(parseResult.data)
        .then((createdFeedbackRequest) => {
            // Notification target precedence: dedicated contact mailbox, then generic SMTP sender; skip email if neither is configured.
            const notifyEmail =
                process.env.NODE_CONTACT_NOTIFY_EMAIL ?? process.env.NODE_SMTP_SENDER ?? '';

            if (notifyEmail)
                void enqueueEmail(
                    {
                        to: notifyEmail,
                        subject: `New contact request: ${createdFeedbackRequest.subject}`
                    },
                    'email-feedback-contact.ejs',
                    {
                        ...response.locals,
                        pageMetaTitle: 'New contact request',
                        pageMetaLinks: [],
                        name: createdFeedbackRequest.name,
                        email: createdFeedbackRequest.email,
                        subject: createdFeedbackRequest.subject,
                        message: createdFeedbackRequest.message,
                        createdAt: createdFeedbackRequest.createdAt?.toISOString()
                    }
                ).catch((error: Error) =>
                    logger.error({
                        message: 'feedback contact notification email failed',
                        error: error.message
                    })
                );

            successResponse(response, createdFeedbackRequest, 201);
        })
        .catch((error: Error) =>
            rejectResponse(response, 500, 'postFeedbackContact', [error.message])
        );
};
