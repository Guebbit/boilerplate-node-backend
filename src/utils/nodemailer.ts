import path from "path";
import ejs, { type Data } from "ejs";
import { createTransport, type SendMailOptions, type SentMessageInfo } from "nodemailer";




// Create a transporter object using the default SMTP transport
export const transporter = createTransport({
    name: process.env.NODE_SMTP_NAME || "",
    host: process.env.NODE_SMTP_HOST || "",
    port: process.env.NODE_SMTP_PORT ? parseInt(process.env.NODE_SMTP_PORT) : 587,
    secure: process.env.NODE_SMTP_PORT === "465", // True for 465, false for other ports (587 = TCP)
    auth: {
        user: process.env.NODE_SMTP_USER || "",
        pass: process.env.NODE_SMTP_PASS || ""
    },
});
// const transporter = nodemailer.createTransport(
//     sendgridTransport({
//         auth: {
//             api_key: process.env.NODE_APIKEY_SENDGRID || ""
//         }
//     })
// );


/**
 * Send email to requested target
 * Retrieve the selected template and apply the requested options
 *
 * @param request
 * @param templateName
 * @param data
 */
export default (request: SendMailOptions, templateName: string, data: Data): Promise<SentMessageInfo> =>
    new Promise((resolve, reject) =>
        ejs.renderFile(
            // Retrieve the template
            path.resolve(__dirname, '../../views/templates', templateName),
            // Populate the template
            data,
            // callback
            (err: Error | null, html: string) => {
                if (err)
                    return reject(err);
                /**
                 * Send email
                 */
                transporter.sendMail({
                    from: process.env.NODE_SMTP_SENDER,
                    html,
                    ...request
                }, (error, info) => {
                    console.log('Message sent: %s', info.messageId);
                    // error happened
                    if (error)
                        return reject(error);
                    // message sent
                    return resolve(info);
                });
            }
        )
    )