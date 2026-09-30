/**
 * @module
 * The boot-time configuration gate: everything the application refuses to start without, checked
 * in one pass so a misconfigured deployment names every mistake at once instead of one per
 * restart.
 *
 * A module declares its own slices on the manifest (`AppModule.config`); what belongs to no module
 * — but is not the kernel's business either, since the kernel must never name an adapter — is
 * handed in by the caller as `appSlices` (`src/app/config.ts` is that caller). A module's rate-limit
 * budgets are slices too, generated from the data it already declares, so deleting the module
 * deletes its gate.
 *
 * See: docs/tools/configuration.md
 */

import type { AppModule } from '@kernel/registry';
import { assertConfig, type ConfigSlice } from '@infrastructure/config/define';
import { rateLimitBudgetConfig } from '@infrastructure/http/config';

/**
 * Every slice one module contributes: its own declared ones, plus its rate-limit budgets.
 *
 * @param appModule - the module
 * @returns the slices, in declaration order
 */
export const configSlicesOf = (appModule: AppModule): readonly ConfigSlice[] => [
    ...(appModule.config ?? []),
    ...(appModule.rateLimits?.length
        ? [rateLimitBudgetConfig(`${appModule.name}-rate-limits`, appModule.rateLimits).slice]
        : [])
];

/**
 * Refuse to boot on any wrongly-shaped value, missing secret, forbidden variable or failed
 * cross-field check, across every slice — thrown ONCE, listing every problem.
 *
 * Presence, forbidden and cross-field rules are skipped under `NODE_ENV=test` (jest builds its own
 * environment per suite, never this one); shape rules are not. The demo profile carries no
 * exemption (SK-08): it satisfies this gate the ordinary way, by setting every variable a slice
 * asks for (`scenarios/run-server.ts`'s `REQUIRED_DEFAULTS`), the same as any other deployment.
 *
 * @param appModules - the enabled module list, each contributing its own slices
 * @param appSlices - what belongs to neither a module nor the kernel
 * @throws {ConfigError} when anything is wrong
 */
export const assertModuleConfig = (
    appModules: readonly AppModule[],
    appSlices: readonly ConfigSlice[]
): void =>
    assertConfig([...appSlices, ...appModules.flatMap((appModule) => configSlicesOf(appModule))]);
