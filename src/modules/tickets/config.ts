/**
 * @module
 * The contact form's configuration: the fallback mailbox for a contact message nobody could be told of, how long a closed ticket is kept, how soon a contact message is due, and the ship-to countries whose delays owe a consent reminder.
 *
 * See: docs/tools/configuration.md
 */

import { defineConfig } from '@infrastructure/config/define';
import { csv, int, text } from '@infrastructure/config/fields';

/** Tickets module configuration. */
export const ticketsConfig = defineConfig({
    name: 'tickets',
    shape: {
        NODE_CONTACT_NOTIFY_EMAIL: text(),
        NODE_TICKETS_RETENTION_DAYS: int({ default: 730, min: 1 }),
        NODE_TICKETS_CONTACT_SLA_HOURS: int({ default: 48, min: 1 }),
        // 16 CFR 435.2 binds a seller shipping to the United States and its territories.
        NODE_TICKETS_FTC_COUNTRIES: csv({
            case: 'upper',
            default: ['US', 'PR', 'GU', 'VI', 'AS', 'MP']
        })
    }
});
