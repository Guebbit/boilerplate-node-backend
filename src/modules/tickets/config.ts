/**
 * @module
 * The contact form's configuration: where the operator is notified, and how long a ticket is kept.
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
        NODE_TICKETS_RETENTION_DAYS: int({ default: 730, min: 1 })
    }
});
