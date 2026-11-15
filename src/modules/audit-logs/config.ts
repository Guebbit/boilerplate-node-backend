/**
 * @module
 * The audit trail's one knob: how long an entry is kept.
 *
 * @see docs/operate/configuration.md
 */

import { defineConfig } from '@infrastructure/config/define';
import { int } from '@infrastructure/config/fields';

/** Audit retention. */
export const auditLogsConfig = defineConfig({
    name: 'audit-logs',
    shape: {
        NODE_AUDIT_RETENTION_DAYS: int({ default: 180, min: 1 })
    }
});
