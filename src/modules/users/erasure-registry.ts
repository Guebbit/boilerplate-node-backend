/**
 * @module
 * The `personalData.erase` registry, as this module sees it: supplied once at boot,
 * never assembled here. `users` cannot import `src/modules/*` to collect every module's manifest
 * entry itself — the same wall `@modules/account/services/personal-data-registry.ts` is built
 * around — so `./module.ts`'s `onRegistered` hook builds the list with
 * `resolvePersonalDataErasers(modules)`, once every enabled module is known, and hands it in here.
 */

import type { PersonalDataEraser } from '@kernel/registry';

/** The registered erasers, empty until the app tier supplies them. */
let erasers: readonly PersonalDataEraser[] = [];

/**
 * Declare the personal-data erasers, replacing any previous list. Called once at boot; tests
 * call it again to install a fixture and to restore an empty one afterwards.
 */
export const setPersonalDataErasers = (registered: readonly PersonalDataEraser[]): void => {
    erasers = registered;
};

/** Every registered eraser, in declaration order. */
export const personalDataErasers = (): readonly PersonalDataEraser[] => erasers;
