/**
 * @module
 * Anti-automation: publishes which human-challenge provider is active, so a frontend knows
 * whether to render a widget before it submits a guarded form. The gate itself is a cross-cutting
 * middleware (`humanChallengeGate`), so `account` and `feedback` depend on
 * `infrastructure/adapters/antibot-providers` directly rather than on this module — which is why
 * this manifest carries no boot-time checks of its own: `app/config.ts` validates the
 * provider selection and its secrets, since that gate keeps running whether or not this module's
 * two HTTP routes are even mounted (SK-06).
 *
 * See: docs/modules/antibot.md
 */

import type { AppModule } from '@kernel/registry';
import { router } from './routes';

/** This module's manifest entry: two public routes, no persistence, no locales. */
export default {
    name: 'antibot',
    basePath: '/antibot',
    routes: router,
    // No persistence, no collection — a stateless challenge issued to a caller who, by
    // construction, has no account yet.
    personalData: 'none'
} satisfies AppModule;
