/**
 * @module
 * The kernel's configuration: the step-up tiers `requireFreshAuth` demands and the outbox relay's
 * retry policy. Kernel-level, not `account`'s: any module with a money or identity route mounts
 * `requireFreshAuth`, and none of them may reach into a sibling's config.
 *
 * See: docs/tools/configuration.md
 */

import { defineConfig } from '@infrastructure/config/define';
import { int } from '@infrastructure/config/fields';

/** How recently a sign-in must be for a sensitive action. */
export const reauthConfig = defineConfig({
    name: 'reauthentication',
    shape: {
        NODE_REAUTH_TIME_CRITICAL: int({ default: 300, min: 0 }),
        NODE_REAUTH_TIME_SENSITIVE: int({ default: 900, min: 0 })
    }
});

/** The transactional outbox. */
export const outboxConfig = defineConfig({
    name: 'outbox',
    shape: {
        NODE_OUTBOX_RETENTION_DAYS: int({ default: 7, min: 1 }),
        NODE_OUTBOX_MAX_ATTEMPTS: int({ default: 10, min: 1 }),
        NODE_OUTBOX_LEASE_SECONDS: int({ default: 60, min: 1 })
    }
});
