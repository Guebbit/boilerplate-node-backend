/**
 * @module
 * The `translatables` registry, as this module sees it: supplied once at boot, never assembled
 * here. `locales` cannot import `src/modules/*` to collect every module's manifest entry itself —
 * the same wall `@infrastructure/i18n`'s translation port is built around — so `src/app.ts` builds
 * the lookup with `resolveTranslatables(enabledModules)` and hands it in, the one direction data
 * may cross this boundary.
 */

import type { TranslatableTarget } from '@kernel/registry';

/** The registered lookup, empty until the app tier supplies one. */
let translatables: Readonly<Record<string, TranslatableTarget | undefined>> = {};

/**
 * Declare the translatable registry, replacing any previous one. Called once at boot; tests call
 * it again to install a fixture and to restore an empty one afterwards.
 */
export const setTranslatables = (
    registry: Readonly<Record<string, TranslatableTarget | undefined>>
): void => {
    translatables = registry;
};

/** The declared target for one `entityType`, or `undefined` when nothing registered it. */
export const translatableTarget = (entityType: string): TranslatableTarget | undefined =>
    translatables[entityType];
