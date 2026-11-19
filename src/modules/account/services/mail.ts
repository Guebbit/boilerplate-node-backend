/**
 * @module
 * This module's one door onto `enqueueEmail` — the whole reason it exists is layer, not logic:
 * the layer rule keeps every `enqueueEmail` call in the service layer (a lint ban in
 * controllers, repositories and models), and `../emails.ts` is the copy layer (template + translated
 * strings), not this one. Kept a one-function file rather than folded into an existing service so
 * `two-factor/methods/email.ts` — itself not a service — can reach it without importing a whole
 * service's unrelated surface.
 *
 * @see docs/understand/layers.md#layer-stack-inside-one-module
 */

import { enqueueEmail, type EmailContent } from '@infrastructure/adapters/mailer';

/**
 * Queue one of this module's own mails. Never rejects (`enqueueEmail` logs its own failure).
 * Normal by default; `urgent` is for the few a person is sitting on a screen waiting for — a
 * verification link, a reset link, a two-factor code, the export-ready link, the deletion link —
 * which travel on their own queue so ordinary mail never waits ahead of them.
 * @param to - the recipient address
 * @param mail - the finished template + subject + data, from one of `../emails.ts`'s builders
 * @param options - `urgent`: send on the urgent queue
 */
export const sendAccountMail = (
    to: string,
    mail: EmailContent,
    options: { urgent?: boolean } = {}
): Promise<void> => enqueueEmail({ to, subject: mail.subject }, mail.template, mail.data, options);
