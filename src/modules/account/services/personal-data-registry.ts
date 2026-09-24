/**
 * @module
 * The `personalData` registry, as this module sees it: supplied once at boot, never assembled
 * here. `account` cannot import `src/modules/*` to collect every module's manifest entry itself —
 * the same wall `@modules/locales/services/translatables.ts` is built around — so `src/app.ts`
 * builds the list with `resolvePersonalDataSections(enabledModules)` and hands it in, the one
 * direction data may cross this boundary.
 */

import type { PersonalDataSection } from '@kernel/registry';

/** The registered sections, empty until the app tier supplies them. */
let sections: readonly PersonalDataSection[] = [];

/**
 * Declare the personal-data sections, replacing any previous list. Called once at boot; tests
 * call it again to install a fixture and to restore an empty one afterwards.
 */
export const setPersonalDataSections = (registered: readonly PersonalDataSection[]): void => {
    sections = registered;
};

/** Every registered section, in declaration order. */
export const personalDataSections = (): readonly PersonalDataSection[] => sections;
