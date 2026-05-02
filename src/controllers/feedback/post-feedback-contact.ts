import type { Request, Response } from 'express';
import { z } from 'zod';
import { successResponse, rejectResponse } from '@utils/response';
import { nodemailer } from '@utils/nodemailer';
import type { CreateFeedbackRequest } from '@types';
import { feedbackRequestService } from '@services/feedback-requests';

const createFeedbackSchema = z.object({
    name: z.string().trim().max(120).optional(),
    email: z.string().email(),
    subject: z.string().trim().min(1).max(200),
    message: z.string().trim().min(1).max(5000)
});

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
            const notifyEmail =
                process.env.NODE_CONTACT_NOTIFY_EMAIL ?? process.env.NODE_SMTP_SENDER ?? '';

            if (notifyEmail)
                void nodemailer(
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
                );

            successResponse(response, createdFeedbackRequest.toObject(), 201);
        })
        .catch((error: Error) => rejectResponse(response, 500, 'Internal Server Error', [error.message]));
};
