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
 */

import { readLocaleDictionary } from '@infrastructure/i18n';

const enTranslation = readLocaleDictionary('en') as Record<string, unknown>;
const itTranslation = readLocaleDictionary('it') as Record<string, unknown>;

/** Every leaf key of a nested dictionary, dot-joined and sorted. */
const flattenKeys = (dictionary: Record<string, unknown>, prefix = ''): string[] =>
    Object.entries(dictionary)
        .flatMap(([key, value]) =>
            value !== null && typeof value === 'object'
                ? flattenKeys(value as Record<string, unknown>, `${prefix}${key}.`)
                : [`${prefix}${key}`]
        )
        .toSorted();

describe('locale files', () => {
    it('en and it declare exactly the same keys, across every module', () => {
        expect(flattenKeys(itTranslation)).toEqual(flattenKeys(enTranslation));
    });

    it('carries more than the shared dictionary, so the module merge actually ran', () => {
        // A canary: if `registerLocaleDirectories` were never called, both sides would still
        // agree — on the shared half alone — and the parity assertion above would pass vacuously.
        expect(flattenKeys(enTranslation).length).toBeGreaterThan(20);
    });
});
