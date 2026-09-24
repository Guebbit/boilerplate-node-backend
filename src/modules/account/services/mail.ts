/**
 * @module
 * This module's one door onto `enqueueEmail` — the whole reason it exists is layer, not logic:
 * `tests/cross-cutting/side-effects-have-one-layer.test.ts` requires every `enqueueEmail` call to
 * come from the service layer, and `../emails.ts` is the copy layer (template + translated
 * strings), not this one. Kept a one-function file rather than folded into an existing service so
 * `two-factor/methods/email.ts` — itself not a service — can reach it without importing a whole
 * service's unrelated surface.
 */

import { enqueueEmail, type EmailContent } from '@infrastructure/adapters/mailer';
import type { JobPriority } from '@infrastructure/adapters/queue';

/**
 * Queue one of this module's own mails. Defaults to `'high'`: all but two of this module's sends
 * are a token-bearing link or a code someone is actively waiting on — the two confirmations that
 * are not (`resetConfirmEmail`, `deleteConfirmEmail`) pass `'normal'` explicitly at their call site.
 * @param to - the recipient address
 * @param mail - the finished template + subject + data, from one of `../emails.ts`'s builders
 * @param priority - see `enqueueEmail`'s own doc for what the two levels mean
 */
export const sendAccountMail = (
    to: string,
    mail: EmailContent,
    priority: JobPriority = 'high'
): Promise<void> => enqueueEmail({ to, subject: mail.subject }, mail.template, mail.data, priority);
