/**
 * @module
 * Anti-automation: publishes which human-challenge provider is active, so a frontend knows
 * whether to render a widget before it submits a guarded form. The gate itself is a cross-cutting
 * middleware (`humanChallengeGate`), so `account` and `feedback` depend on
 * `infrastructure/adapters/antibot-providers` directly rather than on this module.
 *
 * ── Position ───────────────────────────────────────────────────────────────────────────────
 * Reaches:      nothing
 * Reached by:   nothing — the configuration is read anonymously, by anyone about to call a
 *               guarded route, not by another module
 *
 * See: docs/modules/antibot.md
 */

import type { AppModule } from '@kernel/registry';
import { router } from './routes';

/** This module's manifest entry: one public route, no persistence, no locales. */
export default {
    name: 'antibot',
    basePath: '/antibot',
    routes: router
} satisfies AppModule;
