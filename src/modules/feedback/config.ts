/**
 * @module
 * The contact form's configuration: where the operator is notified, how long a ticket is kept, and
 * whether a data export includes tickets.
 *
 * See: docs/tools/configuration.md
 */

import { defineConfig } from '@infrastructure/config/define';
import { flag, int, text } from '@infrastructure/config/fields';

/** Feedback tickets. */
export const feedbackConfig = defineConfig({
    name: 'feedback',
    shape: {
        NODE_CONTACT_NOTIFY_EMAIL: text({
            describe: 'Mailbox notified of a contact request. Falls back to the SMTP sender.'
        }),
        NODE_FEEDBACK_RETENTION_DAYS: int({
            default: 730,
            min: 1,
            describe: 'Days a ticket is kept. Changing it needs `db:sync`.'
        }),
        NODE_EXPORT_INCLUDE_FEEDBACK: flag({
            default: false,
            describe: 'Include a person’s tickets (matched by email) in their data export.'
        })
    }
});
