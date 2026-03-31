import path from 'node:path';
import ejs, { type Data } from 'ejs';
import { createTransport, type SendMailOptions, type SentMessageInfo } from 'nodemailer';
import { getDirname } from './helpers-filesystem';
import logger from '@utils/winston';

// Create a transporter object using the default SMTP transport
export const transporter = createTransport({
    name: process.env.NODE_SMTP_NAME ?? '',
    host: process.env.NODE_SMTP_HOST ?? '',
    port: process.env.NODE_SMTP_PORT ? Number.parseInt(process.env.NODE_SMTP_PORT) : 587,
    secure: process.env.NODE_SMTP_PORT === '465', // True for 465, false for other ports (587 = TCP)
    auth: {
        user: process.env.NODE_SMTP_USER ?? '',
        pass: process.env.NODE_SMTP_PASS ?? ''
    }
});
// const transporter = nodemailer.createTransport(
//     sendgridTransport({
//         auth: {
//             api_key: process.env.NODE_APIKEY_SENDGRID ?? ""
//         }
//     })
// );

/**
 * Send email to requested target
 * Retrieve the selected template and apply the requested options
 *
 * If file already exists: it will be overwritten
 *
 * @param request
 * @param templateName
 * @param data
 */
export const nodemailer = async (
    request: SendMailOptions,
    templateName: string,
    data: Data
): Promise<SentMessageInfo> => {
    // Render the EJS template
    const html = await ejs.renderFile(
        // Retrieve the template
        path.resolve(getDirname(import.meta.url), '../../views/templates-emails', templateName),
        // Populate the template
        data
    );
    /**
     * Send email (nodemailer returns a Promise when no callback is provided)
     */
    const info: SentMessageInfo = await transporter.sendMail({
        from: process.env.NODE_SMTP_SENDER,
        html,
        ...request
    });
    logger.info('Message sent: %s', info.messageId);
    return info;
};
