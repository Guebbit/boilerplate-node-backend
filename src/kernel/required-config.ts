/**
 * @module
 * The boot-time configuration gate: everything the application refuses to start without, checked
 * in one pass so a misconfigured deployment names every mistake at once instead of one per
 * restart. Modules declare their own on the manifest; what belongs to no module — but is not the
 * kernel's business either, since the kernel must never name one — is handed in by the caller as
 * {@link NonModuleChecks} (`src/app/required-config.ts` is that caller today).
 *
 * See: docs/reference/ops.md
 */

import { isDemoMode } from '@infrastructure/runtime/demo-profile';
import type { AppModule, RequiredConfig } from '@kernel/registry';

/**
 * Checks owned by neither a module nor the kernel — the app tier's own variables, plus whatever
 * else has nowhere better to live yet (see `src/app/required-config.ts`'s own docblock for the
 * current list and why each entry is there rather than on a module).
 */
export interface NonModuleChecks {
    /** Declarative entries, same shape a module's own `requiredConfig` uses. */
    required?: readonly RequiredConfig[];
    /** Cross-field or parsed checks, same shape a module's own `customCheck` returns. */
    customChecks?: readonly (() => string[])[];
}

/**
 * Turns a resolver that throws on an unrecognised selector into the shape every other check here
 * produces — call it once at boot; a throw means the variable names an implementation this build
 * does not have. The resolver's own thrown message (naming the variable and the allowed values) is
 * what a caller sees if this probe is ever bypassed and the resolver runs for real later.
 *
 * @param key - the variable name to report if `resolve` throws
 * @param resolve - the resolver to probe
 * @returns `[key]` when `resolve` throws, `[]` when it does not
 */
export const checkSelector = (key: string, resolve: () => unknown): string[] => {
    // eslint-disable-next-line no-restricted-syntax -- the resolver's throw IS the signal this probes for; there is no safe wrapper for "does this synchronous call throw"
    try {
        resolve();
        return [];
    } catch {
        return [key];
    }
};

/**
 * Whether a `productionOnly` entry is in scope for the current `NODE_ENV`.
 */
const applies = ({ productionOnly }: RequiredConfig): boolean =>
    !productionOnly || process.env.NODE_ENV === 'production';

/**
 * Whether any comma-separated member of the configured value is absent, too short, or still the
 * placeholder `.env-example` ships. A plain single-valued variable has no comma, so this checks
 * exactly one member and behaves exactly as before; a key ring (`account/session/config.ts`'s
 * `NODE_TOKEN_ACCESS`/`NODE_TOKEN_REFRESH`) is checked member-by-member, so a placeholder or a
 * truncated value anywhere in the ring — not just its first entry — still refuses to boot.
 */
const fails = ({ key, minLength, placeholder }: RequiredConfig): boolean => {
    const value = process.env[key] ?? '';
    return value.split(',').some((member) => member.length < minLength || member === placeholder);
};

/**
 * Every module-declared {@link AppModule.forbiddenInProduction} variable that is actually set,
 * under `NODE_ENV=production` — the opposite of every other check here, which refuses an ABSENT
 * value rather than a present one.
 *
 * @param appModules - the enabled module list, each contributing its own `forbiddenInProduction`
 * @returns the offending variable names, empty outside production
 */
const forbiddenUnderProduction = (appModules: AppModule[]): string[] =>
    process.env.NODE_ENV === 'production'
        ? appModules
              .flatMap((appModule) => appModule.forbiddenInProduction ?? [])
              .filter((key) => (process.env[key] ?? '') !== '')
        : [];

/**
 * Refuse to boot on a missing, truncated or still-placeholder required variable — or on
 * {@link forbiddenUnderProduction}'s one variable set where it must not be.
 *
 * Skipped under `NODE_ENV=test` and in the demo profile: a demo deployment that developers
 * routinely boot straight off a copied `.env-example` is not the placeholder-in-production risk
 * this exists to catch, and blocking it breaks the paired frontend's e2e/visual suites, which
 * start this profile with no env of their own. Throws ONCE, listing every offending variable
 * across every module — not the first one, which would mean N restarts to find N mistakes.
 *
 * @param appModules - the enabled module list, each contributing its own `requiredConfig`
 * @param nonModuleChecks - what belongs to neither a module nor the kernel — see
 *   {@link NonModuleChecks}; omitted only by a caller with nothing of its own to add
 * @throws when any required variable fails its check, or the forbidden one is set, outside
 *   `NODE_ENV=test`/the demo profile
 */
export const assertRequiredConfig = (
    appModules: AppModule[],
    nonModuleChecks: NonModuleChecks = {}
): void => {
    if (process.env.NODE_ENV === 'test' || isDemoMode()) return;

    const declared = [
        ...appModules.flatMap((appModule) => appModule.requiredConfig ?? []),
        ...(nonModuleChecks.required ?? [])
    ];
    const offending = [
        ...declared.filter((entry) => applies(entry) && fails(entry)).map(({ key }) => key),
        ...(nonModuleChecks.customChecks ?? []).flatMap((check) => check()),
        ...appModules.flatMap((appModule) => appModule.customCheck?.() ?? [])
    ];
    const forbidden = forbiddenUnderProduction(appModules);

    // Two different failure shapes ("absent" vs "present") get two clauses rather than one
    // combined variable list, so the message still says which is wrong for which variable.
    const problems = [
        ...(offending.length > 0
            ? [
                  `missing, too short, or still set to their .env-example placeholder — ${offending.join(', ')}`
              ]
            : []),
        ...(forbidden.length > 0
            ? [`set, which must never happen here — ${forbidden.join(', ')}`]
            : [])
    ];

    if (problems.length > 0) throw new Error(`Refusing to boot: ${problems.join('; ')}`);
};
