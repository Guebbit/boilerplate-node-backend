/**
 * @module
 * Anti-automation: publishes which human-challenge provider is active, so a frontend knows
 * whether to render a widget before it submits a guarded form. The gate itself is a cross-cutting
 * middleware (`humanChallengeGate`), so `account` and `feedback` depend on
 * `infrastructure/adapters/antibot-providers` directly rather than on this module.
 *
 * See: docs/modules/antibot.md
 */

import type { AppModule } from '@kernel/registry';
import { checkSelector } from '@kernel/required-config';
import { isEmailPolicy } from '@infrastructure/adapters/antibot';
import { resolveHumanChallengeProvider } from '@infrastructure/adapters/antibot-providers';
import { router } from './routes';

/**
 * What each selectable human-challenge provider cannot run without. `none` — the default — needs
 * nothing, which is why the rung costs an untouched deployment no configuration at all.
 */
const ANTIBOT_PROVIDER_SECRETS: Readonly<Record<string, readonly string[]>> = {
    altcha: ['NODE_ANTIBOT_ALTCHA_SECRET'],
    turnstile: ['NODE_ANTIBOT_TURNSTILE_SITE_KEY', 'NODE_ANTIBOT_TURNSTILE_SECRET']
};

/**
 * Selecting a human-challenge provider is a choice; selecting one without its secret is not. The
 * provider would throw on the first guarded request instead of at boot — a signup outage that
 * looks like a bug rather than a missing variable.
 *
 * @returns the variables the selected provider needs and does not have
 */
const missingAntibotProviderSecrets = (): string[] =>
    (ANTIBOT_PROVIDER_SECRETS[process.env.NODE_ANTIBOT_PROVIDER ?? 'none'] ?? []).filter(
        (key) => !process.env[key]
    );

/**
 * Same reasoning as {@link missingAntibotProviderSecrets}: an unrecognized
 * `NODE_ANTIBOT_EMAIL_POLICY` would otherwise only throw on the first signup, in the middle of a
 * request, rather than at boot.
 *
 * @returns `['NODE_ANTIBOT_EMAIL_POLICY']` when the value is set and unrecognized, otherwise `[]`
 */
const invalidEmailPolicy = (): string[] => {
    const raw = process.env.NODE_ANTIBOT_EMAIL_POLICY;
    return raw !== undefined && !isEmailPolicy(raw) ? ['NODE_ANTIBOT_EMAIL_POLICY'] : [];
};

/** This module's manifest entry: one public route, no persistence, no locales. */
export default {
    name: 'antibot',
    basePath: '/antibot',
    routes: router,
    // No persistence, no collection — a stateless challenge issued to a caller who, by
    // construction, has no account yet.
    personalData: 'none',
    // Three checks `requiredConfig` cannot express, all conditional on which provider is
    // selected: the secrets a live provider needs, the email-policy rung's own selector, and
    // `NODE_ANTIBOT_PROVIDER` itself — `resolveHumanChallengeProvider` already throws a good
    // message on an unknown name; this is what makes that throw happen at boot instead of on the
    // first guarded request (`TIER_AUDIT_BUGS.md` §3, `TIER_AUDIT_STRUCTURE.md` B3).
    customCheck: () => [
        ...missingAntibotProviderSecrets(),
        ...invalidEmailPolicy(),
        ...checkSelector('NODE_ANTIBOT_PROVIDER', resolveHumanChallengeProvider)
    ]
} satisfies AppModule;
