/**
 * Every language declares the same keys — across the shared file and every module at once.
 *
 * Asserted against the MERGED dictionaries, so a module that ships `en.json` and forgets `it.json`
 * fails here, and so does a shared key translated on one side only. Nothing else notices: each
 * dictionary is valid JSON on its own, and a missing key surfaces as the raw key printed to a user
 * in the wrong language.
 *
 * Per-module copy is asserted by each module's own `validation-messages` spec. This file
 * deliberately names no domain — it is the one property that must hold however many modules exist.
 *
 * ── This is about TIER 1, and must stay that way ─────────────────────────────────────────────
 * The dictionaries here are the deployed files — the API's own copy, loaded at boot. Do not extend
 * this over the database rows `src/modules/locales` serves: static parity is a build-time property
 * of this repository, dynamic completeness is `entryCount` in `GET /locales`, and conflating them
 * would make a half-translated language fail the test suite of a repo that does not own the
 * translation.
 *
 * ── Why the languages are read rather than named ─────────────────────────────────────────────
 * This file used to compare `en` and `it` by name. `es.json` has been in `src/locales/` and in
 * every module's locale directory for as long as those directories have existed, and its
 * completeness was checked by nothing — a Spanish key could go missing and the suite stayed green.
 * That was worst for the one language a client is most likely to download rather than bundle.
 *
 * Iterating `listSupportedLocales()` means a language added tomorrow is covered by existing, and
 * the answer stays right when `NODE_SUPPORTED_LOCALES` narrows the set for a deployment.
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

const supported = listSupportedLocales();

/*
 * One language is the reference and the rest are compared to it — any of them would do, since
 * "they all declare the same keys" is symmetric, and comparing every pair would report the same
 * defect once per pair.
 */
const [reference = 'en', ...others] = supported;
const referenceKeys = flattenKeys(readLocaleDictionary(reference));

describe('locale files', () => {
    it('has more than one language to compare, so the assertions below are not vacuous', () => {
        // A canary. With a single supported locale `others` is empty, `it.each` runs zero cases,
        // and this file would pass while checking nothing.
        expect(supported.length).toBeGreaterThan(1);
    });

    it.each(others)('%s declares exactly the same keys as %s, across every module', (locale) => {
        expect(flattenKeys(readLocaleDictionary(locale))).toEqual(referenceKeys);
    });

    it('carries more than the shared dictionary, so the module merge actually ran', () => {
        // A canary: if `registerLocaleDirectories` were never called, every language would still
        // agree — on the shared half alone — and the parity assertion above would pass vacuously.
        expect(referenceKeys.length).toBeGreaterThan(20);
    });
});
