/**
 * @module
 * Boot-time checks that belong to neither a module's manifest nor the kernel — the kernel must
 * never name a module or an adapter (`kernel/registry.ts`'s own rule), so anything that is not one
 * module's business lands here instead, and `src/app.ts` hands it to `registerModules` as the
 * {@link NonModuleChecks} argument `kernel/required-config.ts` asks for.
 *
 * Groups:
 *
 * - `NODE_URL` / `NODE_CORS_ORIGIN` / `NODE_PSEUDONYM_KEY` — this application's own, never a
 *   module's.
 * - The SMTP companions, since the kernel must not name the mail adapter directly — the probe
 *   itself lives with the adapter (`adapters/mailer.ts#missingSmtpCompanions`), this file only
 *   wires it in.
 * - Two mail guards, also from the adapter: an e2e run may only use a local SMTP host, and a
 *   deployment must name its transport.
 * - Four provider-selector probes: analytics, mail transport, the log personal-field mode and the
 *   antibot human-challenge ladder each pick an implementation by name; a wrong name must fail at
 *   boot, not on the first request that needs it. `checkSelector` turns each resolver's own throw
 *   into the same shape every other check here produces.
 * - Antibot's OWN checks (SK-06): a selected provider's missing secret, and an unrecognised
 *   `NODE_ANTIBOT_EMAIL_POLICY`. Antibot is a real module (`modules/antibot`), but the human
 *   -challenge GATE it configures is cross-cutting middleware `account`/`feedback` call directly
 *   — deleting the module's HTTP surface would not stop the gate from running, so validating it
 *   cannot live on a manifest that deleting the module also deletes.
 * - NOT `NODE_PAYMENT_PROVIDER` — a real module (`payments`) whose gate IS the module, so its
 *   selector is probed by `payments/module.ts`'s own `customCheck`.
 */

import { checkSelector, type NonModuleChecks } from '@kernel/required-config';
import type { RequiredConfig } from '@kernel/registry';
import {
    missingSmtpCompanions,
    nonLocalE2eSmtpHost,
    resolveMailTransport,
    unsetMailTransportOutsideDevelopment
} from '@infrastructure/adapters/mailer';
import { resolvePersonalFieldMode } from '@infrastructure/adapters/logger';
import { resolveAnalyticsProvider } from '@infrastructure/observability/analytics';
import { isEmailPolicy } from '@infrastructure/adapters/antibot';
import { resolveHumanChallengeProvider } from '@infrastructure/adapters/antibot-providers';

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

/**
 * `NODE_URL` is unconditional: unset, `account/oauth/config.ts` builds a relative OAuth redirect
 * URI, so every login through a real provider points nowhere — a failure that surfaces as a
 * support ticket, never as an error. `NODE_CORS_ORIGIN` is checked in production only, where its
 * `http://localhost:8080` fallback (`app/security.ts`) cannot be the right answer.
 *
 * Both are the app's own. The shop's jurisdiction and its two VAT rates are NOT — `orders` and
 * `products` declare those on their own manifests, so deleting either module deletes its gate.
 *
 * `NODE_PSEUDONYM_KEY` (`src/infrastructure/security/pseudonymise.ts`) is production-only too: outside production
 * it falls back to a non-secret dev key, since there is nothing to protect on a
 * machine that already has this source tree.
 */
const APP_REQUIRED_CONFIG: readonly RequiredConfig[] = [
    { key: 'NODE_URL', minLength: 1 },
    { key: 'NODE_CORS_ORIGIN', minLength: 1, productionOnly: true },
    {
        key: 'NODE_PSEUDONYM_KEY',
        minLength: 16,
        placeholder: 'your-pseudonym-key-here',
        productionOnly: true
    }
];

/**
 * What `registerModules` (`src/app.ts`) hands `assertRequiredConfig` beyond what the modules
 * themselves declare — see this file's own header for what each entry is and why it lives here.
 */
export const APP_NON_MODULE_CHECKS: NonModuleChecks = {
    required: APP_REQUIRED_CONFIG,
    customChecks: [
        missingSmtpCompanions,
        nonLocalE2eSmtpHost,
        unsetMailTransportOutsideDevelopment,
        () => checkSelector('NODE_ANALYTICS_PROVIDER', resolveAnalyticsProvider),
        () => checkSelector('NODE_MAIL_TRANSPORT', resolveMailTransport),
        () => checkSelector('NODE_LOG_PERSONAL_FIELDS', resolvePersonalFieldMode),
        () => checkSelector('NODE_ANTIBOT_PROVIDER', resolveHumanChallengeProvider),
        missingAntibotProviderSecrets,
        invalidEmailPolicy
    ]
};
