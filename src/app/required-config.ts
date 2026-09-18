/**
 * @module
 * Boot-time checks that belong to neither a module's manifest nor the kernel — the kernel must
 * never name a module or an adapter (`kernel/registry.ts`'s own rule), so anything that is not one
 * module's business lands here instead, and `src/app.ts` hands it to `registerModules` as the
 * {@link NonModuleChecks} argument `kernel/required-config.ts` asks for.
 *
 * Three groups:
 *
 * - `NODE_URL` / `NODE_CORS_ORIGIN` — this application's own, never a module's.
 * - The SMTP companions that used to be hard-coded inside the kernel (`TIER_AUDIT_STRUCTURE.md`
 *   A9) — the probe itself lives with the adapter (`adapters/mailer.ts#missingSmtpCompanions`),
 *   this file only wires it in. Antibot's equivalent checks moved onto `modules/antibot`'s own
 *   manifest once B3 settled where that module lives (`TIER_AUDIT_STRUCTURE.md` B3).
 * - Three provider-selector probes (`TIER_AUDIT_BUGS.md` §3): analytics, mail transport and the
 *   log personal-field mode all pick an implementation by name and used to throw on the FIRST
 *   request that needed it rather than at boot. `checkSelector` turns each resolver's own throw
 *   into the same shape every other check here produces.
 * - NOT `NODE_PAYMENT_PROVIDER` or `NODE_ANTIBOT_PROVIDER` — both are real modules with their own
 *   manifests, so their selectors are probed by `payments/module.ts`'s and `antibot/module.ts`'s
 *   own `customCheck`.
 */

import { checkSelector, type NonModuleChecks } from '@kernel/required-config';
import type { RequiredConfig } from '@kernel/registry';
import { missingSmtpCompanions, resolveMailTransport } from '@infrastructure/adapters/mailer';
import { resolvePersonalFieldMode } from '@infrastructure/adapters/logger';
import { resolveAnalyticsProvider } from '@infrastructure/observability/analytics';

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
 * What `registerModules` (`src/app.ts`) hands `assertRequiredConfig` beyond what the modules
 * themselves declare — see this file's own header for what each entry is and why it lives here.
 */
export const APP_NON_MODULE_CHECKS: NonModuleChecks = {
    required: APP_REQUIRED_CONFIG,
    customChecks: [
        missingSmtpCompanions,
        () => checkSelector('NODE_ANALYTICS_PROVIDER', resolveAnalyticsProvider),
        () => checkSelector('NODE_MAIL_TRANSPORT', resolveMailTransport),
        () => checkSelector('NODE_LOG_PERSONAL_FIELDS', resolvePersonalFieldMode)
    ]
};
