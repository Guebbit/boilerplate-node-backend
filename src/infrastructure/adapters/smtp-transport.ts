/**
 * @module
 * The `smtp` mail transport's sender: a nodemailer SMTP client, built on first use and reused.
 *
 * Its own file so `./mail-transports` (loaded before the application, by the jest setup and the
 * dev preload) never imports nodemailer: a test's own `jest.mock('nodemailer')` must still win.
 *
 * See: docs/tools/email-and-rendering.md#smtp-configuration
 */

// nodemailer: `createTransport` builds a reusable SMTP sender; `SentMessageInfo` is the server's
// reply (messageId, accepted/rejected recipients) — https://nodemailer.com/smtp/
import { createTransport, type SentMessageInfo, type Transporter } from 'nodemailer';
import { mailConfig } from './config';
import type { OutgoingMail } from './mail-transports';

/** The memoised transporter. See {@link getTransporter}. */
let transport: Transporter | undefined;

/**
 * Reset the memoised transporter. Test seam: a suite that varies SMTP configuration changes the
 * environment and asks for a fresh transporter, instead of resetting the module registry and
 * re-importing this file to get one.
 */
export const resetTransporter = (): void => {
    transport = undefined;
};

/**
 * The transporter, built on first use and reused rather than rebuilt per email. LAZY rather than
 * module-scope, so the environment is read when first needed, not frozen at import — which is also
 * what lets {@link resetTransporter} hand a suite a fresh one after it varies the configuration.
 */
const getTransporter = (): Transporter => {
    if (transport) return transport;

    /** The port the SMTP client dials, and the one fact `secure` is derived from. */
    const smtp = mailConfig();
    const port = smtp.NODE_SMTP_PORT;

    transport = createTransport({
        // Hostname this client announces in the SMTP EHLO greeting. Some strict servers
        // check it.
        name: smtp.NODE_SMTP_NAME ?? '',
        // SMTP server to connect to.
        host: smtp.NODE_SMTP_HOST ?? '',
        // 587 = submission with STARTTLS (the modern default); 465 = implicit TLS;
        // 25 = relay.
        port,
        // `secure: true` means TLS from the first byte, which is only correct on 465.
        // On 587 it must be false — the connection starts plaintext and is upgraded via
        // STARTTLS. Compared as a NUMBER, so a zero-padded `0465` cannot read as "not
        // 465" and open a plaintext connection to a port expecting TLS immediately.
        secure: port === 465,
        // On 587, refuse to go on without STARTTLS. nodemailer otherwise upgrades only
        // when the server advertises it, so an attacker who strips the advertisement
        // gets the AUTH credentials in cleartext.
        // https://nodemailer.com/smtp/#tls-options
        requireTLS: port === 587,
        // Transport-level switches: message data can never turn them off. A `path` or `href` in
        // any attachment or part is refused, so a forged job cannot read a local file or fetch a URL.
        // https://nodemailer.com/message/attachments/ (security note on `path`)
        disableFileAccess: true,
        disableUrlAccess: true,
        // SMTP AUTH credentials. Empty strings when unset, in which case nodemailer
        // attempts an unauthenticated send and the server rejects it — the failure
        // surfaces at send time, not at boot, because email is not a hard startup
        // dependency.
        auth: {
            user: smtp.NODE_SMTP_USER ?? '',
            pass: smtp.NODE_SMTP_PASS ?? ''
        }
    });

    return transport;
};

/**
 * nodemailer: renders the message, then hands the transporter that one finished envelope.
 * https://nodemailer.com/message/
 *
 * @param mail - the message and the means to render it
 * @returns the SMTP server's receipt
 */
export const sendBySmtp = (mail: OutgoingMail): Promise<SentMessageInfo> =>
    mail.render().then((message) => getTransporter().sendMail(message));
