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
import type { StepUpTier } from '@kernel/permissions';

/** How recently a sign-in must be for a sensitive action. */
export const reauthConfig = defineConfig({
    name: 'reauthentication',
    shape: {
        NODE_REAUTH_TIME_CRITICAL: int({ default: 300, min: 0 }),
        NODE_REAUTH_TIME_SENSITIVE: int({ default: 900, min: 0 })
    }
});

/**
 * How many seconds a step-up tier allows since the caller last proved themselves.
 * Read per call, so a guard built when a router loads still sees the live setting.
 * @param tier - `critical` (money, destructive) or `sensitive` (identity, sessions)
 * @returns the freshness window in seconds
 */
export const reauthWindowSeconds = (tier: StepUpTier): number =>
    tier === 'critical'
        ? reauthConfig().NODE_REAUTH_TIME_CRITICAL
        : reauthConfig().NODE_REAUTH_TIME_SENSITIVE;

/** The transactional outbox. */
export const outboxConfig = defineConfig({
    name: 'outbox',
    shape: {
        NODE_OUTBOX_RETENTION_DAYS: int({ default: 7, min: 1 }),
        NODE_OUTBOX_MAX_ATTEMPTS: int({ default: 10, min: 1 }),
        NODE_OUTBOX_LEASE_SECONDS: int({ default: 60, min: 1 })
    }
});
