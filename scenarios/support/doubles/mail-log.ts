/**
 * @module
 * The `log` mail transport — a test double, never shipped. It renders the message (so a broken
 * template still fails where it is sent) and opens no socket: nodemailer's own `jsonTransport`
 * returns the message as JSON instead of delivering it.
 *
 * It does NOT `deliver`: a code mailed through it reaches nobody, so a boot check or a second
 * factor that depends on a person reading mail must not count it. Registered by `./register`.
 */

import type { MailTransportAdapter } from '@infrastructure/adapters/mail-transports';

/**
 * Render the message and let nodemailer's JSON transport "send" it.
 *
 * `nodemailer` is imported on the call, not at the top: the jest setup loads this file before a
 * test's own `jest.mock('nodemailer')` is hoisted, and a top-level import would hand that test an
 * already-evaluated, un-mockable copy.
 */
export const logMailTransport: MailTransportAdapter = {
    delivers: () => false,
    send: (mail) =>
        Promise.all([mail.render(), import('nodemailer')]).then(([message, nodemailer]) =>
            // nodemailer: `jsonTransport: true` builds a transport that renders the message to a
            // JSON string and returns it, with no network. https://nodemailer.com/transports/
            nodemailer
                .createTransport({
                    jsonTransport: true,
                    // Same switches as the SMTP transport: a path or URL in a message is refused.
                    disableFileAccess: true,
                    disableUrlAccess: true
                })
                .sendMail(message)
        )
};
