/**
 * @module
 * The `translatables` registry, as this module sees it: supplied once at boot, never assembled
 * here. `locales` cannot import `src/modules/*` to collect every module's manifest entry itself —
 * the same wall `kernel/translation.ts`'s translation port is built around — so `../module.ts`'s
 * `onRegistered` hook builds the lookup with `resolveTranslatables(modules)`, once every enabled
 * module is known, and hands it in here.
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
    // Own-property only: `entityType` comes off the URL, and `constructor` is inherited by every object.
    Object.hasOwn(translatables, entityType) ? translatables[entityType] : undefined;

/**
 * Every cache tag a translation write clears, once each — what a language switching on or off, or
 * going away, must clear too, since it changes which stored text the cached responses may carry.
 */
export const translatableCacheTags = (): string[] => [
    ...new Set(Object.values(translatables).flatMap((target) => (target ? [target.cacheTag] : [])))
];
