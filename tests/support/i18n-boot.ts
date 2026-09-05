/**
 * Reproduce the import ordering `app.ts` forces: module first, i18next second.
 *
 * This is the machinery behind the tests that could have caught PROBLEM 01 — `t()` called at
 * module scope, before `i18next.init()`, returning `undefined` so Zod quietly used its own English
 * defaults. No test saw it, because `tests/support/setup.ts` runs in Jest's `setupFiles` and
 * therefore initialises i18next BEFORE any spec imports anything. Under Jest the eager `t()`
 * worked; in production it did not.
 *
 * So a spec that wants to assert real copy has to rebuild that ordering deliberately: load the
 * module under test inside `jest.isolateModulesAsync` against a fresh, un-initialised i18next, and
 * only initialise afterwards.
 *
 * It lives in `tests/support` because it is about the i18n BOOT, not about any domain — the module
 * whose messages are being checked is passed in.
 */

import { readLocaleDictionary } from '@infrastructure/i18n';

/** The merged dictionaries — shared keys plus every enabled module's contribution. */
export const mergedResources = () => ({
    en: { translation: readLocaleDictionary('en') },
    it: { translation: readLocaleDictionary('it') }
});

/**
 * Load a module the way production does, then initialise i18next in `locale`.
 *
 * @param locale - the language to initialise with
 * @param load - imports the module under test; called BEFORE i18next exists
 * @param probeKey - a key that must resolve to nothing beforehand, proving the ordering is real
 */
export const loadBeforeI18n = async <T>(
    locale: 'en' | 'it',
    load: () => Promise<T>,
    probeKey: string
): Promise<T> => {
    let loaded!: T;

    await jest.isolateModulesAsync(async () => {
        const i18nextModule = await import('i18next');
        const i18next = i18nextModule.default;

        // deliberately BEFORE init — this is the ordering ES modules force on `app.ts`
        loaded = await load();

        // the premise: an un-initialised i18next resolves nothing, so an eagerly-called `t()` in
        // the loaded module would have baked `undefined` into its checks
        expect(i18next.isInitialized).toBeFalsy();
        expect(i18next.t(probeKey)).toBeUndefined();

        await i18next.init({ lng: locale, fallbackLng: 'en', resources: mergedResources() });
    });

    return loaded;
};
