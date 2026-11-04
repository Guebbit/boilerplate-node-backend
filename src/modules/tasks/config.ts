/**
 * @module
 * The contact form's configuration: the fallback mailbox for a contact message nobody could be told of, how long a closed task is kept, and how soon a contact message is due.
 *
 * See: docs/tools/configuration.md
 */

import { defineConfig } from '@infrastructure/config/define';
import { int, text } from '@infrastructure/config/fields';

/** Tasks module configuration. */
export const tasksConfig = defineConfig({
    name: 'tasks',
    shape: {
        NODE_CONTACT_NOTIFY_EMAIL: text(),
        NODE_TASKS_RETENTION_DAYS: int({ default: 730, min: 1 }),
        NODE_TASKS_CONTACT_SLA_HOURS: int({ default: 48, min: 1 })
    }
});
