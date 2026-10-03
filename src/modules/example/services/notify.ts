/**
 * @module
 * Optional capability, in its own files: the listener that mails an owner when their example is
 * published. `module.ts`'s `subscribe` attaches it to the domain event; the service never knows it
 * exists. Delete this file, `../emails.ts`, `../templates/` and the `subscribe` line to drop it.
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
