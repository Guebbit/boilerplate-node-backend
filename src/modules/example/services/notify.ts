/**
 * @module
 * In any module: a listener attached by `module.ts`'s `subscribe`; the service that emitted the
 * event never knows it exists.
 * Here: mails the owner when their example is published.
 * Delete it if: nothing reacts to the module's events (with `../emails.ts`, `../templates/` and the
 * `subscribe` line).
 *
 * See: docs/tools/events-and-logging.md#the-domain-event-bus-and-what-it-is-not
 */

import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { getDefaultLocale } from '@infrastructure/i18n';
import { userService } from '@modules/users';
import { examplePublishedEmail } from '../emails';

/**
 * Mail the owner of a just-published example, in their own language.
 *
 * A vanished owner (erased between the edit and this listener) means nobody to tell, not an error.
 * A rejection here is logged by the event bus and never reaches the request that published.
 * The event rides the outbox, and a retry re-runs every handler, so the mail can repeat.
 *
 * @param payload - the `example.published` event
 */
export const mailOwnerOfPublished = (payload: { userId: string; title: string }): Promise<void> =>
    userService.getById(payload.userId).then((owner) => {
        if (!owner) return;
        const mail = examplePublishedEmail(
            owner.locale ?? getDefaultLocale(),
            owner.username,
            payload.title
        );
        return enqueueEmail({ to: owner.email, subject: mail.subject }, mail.template, mail.data);
    });
