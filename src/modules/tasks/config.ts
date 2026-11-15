/**
 * @module
 * The contact form's configuration: how long a closed task is kept, and how soon a contact message is due.
 *
 * @see docs/operate/configuration.md
 */

import { defineConfig } from '@infrastructure/config/define';
import { int } from '@infrastructure/config/fields';

/** Tasks module configuration. */
export const tasksConfig = defineConfig({
    name: 'tasks',
    shape: {
        NODE_TASKS_RETENTION_DAYS: int({ default: 730, min: 1 }),
        NODE_TASKS_CONTACT_SLA_HOURS: int({ default: 48, min: 1 })
    }
});
