/**
 * @module
 * The contact form's configuration: where the operator is notified, how long a closed ticket is kept, and how soon a contact message is due.
 *
 * See: docs/tools/configuration.md
 */

import { defineConfig } from '@infrastructure/config/define';
import { int, text } from '@infrastructure/config/fields';

/** Tickets module configuration. */
export const ticketsConfig = defineConfig({
    name: 'tickets',
    shape: {
        NODE_CONTACT_NOTIFY_EMAIL: text(),
        NODE_TICKETS_RETENTION_DAYS: int({ default: 730, min: 1 }),
        NODE_TICKETS_CONTACT_SLA_HOURS: int({ default: 48, min: 1 })
    }
});
