/**
 * @module
 * The contact form's configuration: where the operator is notified, how long a ticket is kept, and
 * whether a data export includes tickets.
 *
 * See: docs/tools/configuration.md
 */

import { defineConfig } from '@infrastructure/config/define';
import { flag, int, text } from '@infrastructure/config/fields';

/** Tickets module configuration. */
export const ticketsConfig = defineConfig({
    name: 'tickets',
    shape: {
        NODE_CONTACT_NOTIFY_EMAIL: text(),
        NODE_TICKETS_RETENTION_DAYS: int({ default: 730, min: 1 }),
        NODE_EXPORT_INCLUDE_TICKETS: flag({ default: false })
    }
});
