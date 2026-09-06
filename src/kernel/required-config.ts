/**
 * @module
 * The boot-time configuration gate: everything the application refuses to start without, checked
 * in one pass so a misconfigured deployment names every mistake at once instead of one per
 * restart. Modules declare their own on the manifest; what belongs to no module lives here.
 *
 * See: docs/reference/ops.md
 */

import { isDemoMode } from '@infrastructure/adapters/demo-outbox';
import { isEmailPolicy } from '@infrastructure/adapters/antibot';
import type { AppModule, RequiredConfig } from '@kernel/registry';

/**
 * Variables no single module owns.
 *
 * `NODE_URL` is unconditional: unset, `account/emails.ts` and `account/oauth/config.ts` build
 * relative links, so every password-reset mail and OAuth callback points nowhere — a failure that
 * surfaces as a support ticket, never as an error. `NODE_CORS_ORIGIN` is checked in production
 * only, where its `http://localhost:8080` fallback (`app/security.ts`) cannot be the right answer.
 */
const APP_REQUIRED_CONFIG: readonly RequiredConfig[] = [
    { key: 'NODE_URL', minLength: 1 },
    { key: 'NODE_CORS_ORIGIN', minLength: 1, productionOnly: true }
];

/**
 * The mailer's companions to `NODE_SMTP_HOST` — the ones a transport cannot authenticate or
 * address without.
 */
const SMTP_COMPANIONS = ['NODE_SMTP_USER', 'NODE_SMTP_PASS', 'NODE_SMTP_SENDER'] as const;

/**
 * What each selectable human-challenge provider cannot run without. `none` — the default — needs
 * nothing, which is why the rung costs an untouched deployment no configuration at all.
 */
const ANTIBOT_PROVIDER_SECRETS: Readonly<Record<string, readonly string[]>> = {
    altcha: ['NODE_ANTIBOT_ALTCHA_SECRET'],
    turnstile: ['NODE_ANTIBOT_TURNSTILE_SITE_KEY', 'NODE_ANTIBOT_TURNSTILE_SECRET']
};

/**
 * Whether a `productionOnly` entry is in scope for the current `NODE_ENV`.
 */
const applies = ({ productionOnly }: RequiredConfig): boolean =>
    !productionOnly || process.env.NODE_ENV === 'production';

/**
 * Whether the configured value is absent, too short, or still the placeholder `.env-example` ships.
 */
const fails = ({ key, minLength, placeholder }: RequiredConfig): boolean => {
    const value = process.env[key] ?? '';
    return value.length < minLength || value === placeholder;
};

/**
 * SMTP is all-or-nothing rather than required: `account/two-factor/methods/email.ts` gates the
 * email second factor on `NODE_SMTP_HOST` being set at all, so leaving mail unconfigured is a
 * choice. A host set *without* its credentials is not — it builds a transport that only fails
 * when something first tries to send, which is a real user asking to reset a password.
 *
 * @returns the companion variables left unset alongside a configured host
 */
const missingSmtpCompanions = (): string[] =>
    process.env.NODE_SMTP_HOST ? SMTP_COMPANIONS.filter((key) => !process.env[key]) : [];

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
 * Refuse to boot on a missing, truncated or still-placeholder required variable.
 *
 * Skipped under `NODE_ENV=test` and in the demo profile: a demo deployment that developers
 * routinely boot straight off a copied `.env-example` is not the placeholder-in-production risk
 * this exists to catch, and blocking it breaks the paired frontend's e2e/visual suites, which
 * start this profile with no env of their own. Throws ONCE, listing every offending variable
 * across every module — not the first one, which would mean N restarts to find N mistakes.
 *
 * @param appModules - the enabled module list, each contributing its own `requiredConfig`
 * @throws when any required variable fails its check outside `NODE_ENV=test`/the demo profile
 */
export const assertRequiredConfig = (appModules: AppModule[]): void => {
    if (process.env.NODE_ENV === 'test' || isDemoMode()) return;

    const declared = [
        ...appModules.flatMap((appModule) => appModule.requiredConfig ?? []),
        ...APP_REQUIRED_CONFIG
    ];
    const offending = [
        ...declared.filter((entry) => applies(entry) && fails(entry)).map(({ key }) => key),
        ...missingSmtpCompanions(),
        ...missingAntibotProviderSecrets(),
        ...invalidEmailPolicy()
    ];

    if (offending.length > 0)
        throw new Error(
            `Refusing to boot: these environment variables are missing, too short, or still set to their .env-example placeholder — ${offending.join(', ')}`
        );
};
