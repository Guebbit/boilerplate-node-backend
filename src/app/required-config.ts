/**
 * @module
 * Boot-time checks that belong to neither a module's manifest nor the kernel — the kernel must
 * never name a module or an adapter (`kernel/registry.ts`'s own rule), so anything that is not one
 * module's business lands here instead, and `src/app.ts` hands it to `registerModules` as the
 * {@link NonModuleChecks} argument `kernel/required-config.ts` asks for.
 *
 * Four groups:
 *
 * - `NODE_URL` / `NODE_CORS_ORIGIN` — this application's own, never a module's.
 * - The SMTP companions and the two antibot checks that used to be hard-coded inside the kernel
 *   (`TIER_AUDIT_STRUCTURE.md` A9) — SMTP's own probe now lives with the adapter
 *   (`adapters/mailer.ts#missingSmtpCompanions`); antibot's stay here because where antibot itself
 *   lands is still undecided (`TIER_AUDIT_STRUCTURE.md` B3) — a two-line move once it is.
 * - Four provider-selector probes (`TIER_AUDIT_BUGS.md` §3): analytics, antibot, mail transport and
 *   the log personal-field mode all pick an implementation by name and used to throw on the FIRST
 *   request that needed it rather than at boot. `checkSelector` turns each resolver's own throw
 *   into the same shape every other check here produces.
 * - NOT `NODE_PAYMENT_PROVIDER` — `payments` is a real module with its own manifest, so its
 *   selector is probed by `payments/module.ts`'s own `customCheck`, the same door
 *   `validateBankTransferConfig` already uses.
 */

import { checkSelector, type NonModuleChecks } from '@kernel/required-config';
import type { RequiredConfig } from '@kernel/registry';
import { isEmailPolicy } from '@infrastructure/adapters/antibot';
import { missingSmtpCompanions, resolveMailTransport } from '@infrastructure/adapters/mailer';
import { resolvePersonalFieldMode } from '@infrastructure/adapters/logger';
import { resolveAnalyticsProvider } from '@infrastructure/observability/analytics';
import { resolveHumanChallengeProvider } from '@infrastructure/adapters/antibot-providers';

/**
 * `NODE_URL` is unconditional: unset, `account/emails.ts` and `account/oauth/config.ts` build
 * relative links, so every password-reset mail and OAuth callback points nowhere — a failure that
 * surfaces as a support ticket, never as an error. `NODE_CORS_ORIGIN` is checked in production
 * only, where its `http://localhost:8080` fallback (`app/security.ts`) cannot be the right answer.
 *
 * Both are the app's own. The shop's jurisdiction and its two VAT rates are NOT — `orders` and
 * `products` declare those on their own manifests, so deleting either module deletes its gate.
 */
const APP_REQUIRED_CONFIG: readonly RequiredConfig[] = [
    { key: 'NODE_URL', minLength: 1 },
    { key: 'NODE_CORS_ORIGIN', minLength: 1, productionOnly: true }
];

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
 * Rung 2's own boot check, same reasoning as {@link missingAntibotProviderSecrets}: an unrecognized
 * `NODE_ANTIBOT_EMAIL_POLICY` would otherwise only throw on the first signup, in the middle of a
 * request, rather than at boot.
 *
 * @returns `['NODE_ANTIBOT_EMAIL_POLICY']` when the value is set and unrecognized, otherwise `[]`
 */
const invalidEmailPolicy = (): string[] => {
    const raw = process.env.NODE_ANTIBOT_EMAIL_POLICY;
    return raw !== undefined && !isEmailPolicy(raw) ? ['NODE_ANTIBOT_EMAIL_POLICY'] : [];
};

/**
 * What `registerModules` (`src/app.ts`) hands `assertRequiredConfig` beyond what the modules
 * themselves declare — see this file's own header for what each entry is and why it lives here.
 */
export const APP_NON_MODULE_CHECKS: NonModuleChecks = {
    required: APP_REQUIRED_CONFIG,
    customChecks: [
        missingSmtpCompanions,
        missingAntibotProviderSecrets,
        invalidEmailPolicy,
        () => checkSelector('NODE_ANALYTICS_PROVIDER', resolveAnalyticsProvider),
        () => checkSelector('NODE_ANTIBOT_PROVIDER', resolveHumanChallengeProvider),
        () => checkSelector('NODE_MAIL_TRANSPORT', resolveMailTransport),
        () => checkSelector('NODE_LOG_PERSONAL_FIELDS', resolvePersonalFieldMode)
    ]
};
