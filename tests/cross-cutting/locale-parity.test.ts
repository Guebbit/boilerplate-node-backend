/**
 * Every language declares the same keys, across the shared file and every module at once.
 *
 * Asserts:  against the MERGED dictionaries, so a module that ships `en.json` and forgets
 *           `it.json` fails, and so does a shared key translated on one side only. Each file is
 *           valid JSON alone; a missing key reaches a user as the raw key, in the wrong language.
 * Names:    no domain. Per-module copy is each module's own `validation-messages` spec.
 * Tier 1:   these are the deployed files, loaded at boot. Do NOT extend this to the database rows
 *           `src/modules/locales` serves: static parity is a build-time property of this repo;
 *           dynamic completeness is `entryCount` in `GET /locales`. Conflating them would fail the
 *           suite of a repo that does not own the translation.
 * Read:     `listSupportedLocales()`, not `en` and `it` by name. A third language would otherwise
 *           have its completeness checked by nothing. A language added tomorrow is covered, one
 *           removed stops being asserted without a test edit, and `NODE_SUPPORTED_LOCALES`
 *           narrowing the set keeps the answer right.
 */

import { listSupportedLocales, readLocaleDictionary } from '@infrastructure/i18n';

/** Every leaf key of a nested dictionary, dot-joined and sorted. */
const flattenKeys = (dictionary: Record<string, unknown>, prefix = ''): string[] =>
    Object.entries(dictionary)
        .flatMap(([key, value]) =>
            value !== null && typeof value === 'object'
                ? flattenKeys(value as Record<string, unknown>, `${prefix}${key}.`)
                : [`${prefix}${key}`]
        )
        .toSorted();

/** The languages the backend lists as supported. */
const supported = listSupportedLocales();

/**
 * One language is the reference and the rest are compared to it — any of them would do, since
 * "they all declare the same keys" is symmetric, and comparing every pair would report the same
 * defect once per pair.
 */
const [reference = 'en', ...others] = supported;
/** Every key of the reference language; the others must have the same. */
const referenceKeys = flattenKeys(readLocaleDictionary(reference));

describe('locale files', () => {
    it('has more than one language to compare, so the assertions below are not vacuous', () => {
        /**
         * A canary. With a single supported locale `others` is empty, `it.each` runs zero cases,
         * and this file would pass while checking nothing.
         */
        expect(supported.length).toBeGreaterThan(1);
    });

    it.each(others)('%s declares exactly the same keys as %s, across every module', (locale) => {
        expect(flattenKeys(readLocaleDictionary(locale))).toEqual(referenceKeys);
    });

    it('carries more than the shared dictionary, so the module merge actually ran', () => {
        /**
         * A canary: if `registerLocaleDirectories` were never called, every language would still
         * agree — on the shared half alone — and the parity assertion above would pass vacuously.
         */
        expect(referenceKeys.length).toBeGreaterThan(20);
    });
});
