/**
 * The language-tag helpers — `src/infrastructure/i18n/locale-tag.ts`. One definition of "the same
 * tag": case-blind to compare, canonical to store, and never throwing on a tag it cannot read.
 */
import {
    baseLanguage,
    canonicalLocale,
    canonicalLocaleSetter,
    isWellFormedLocale
} from '@infrastructure/i18n';

describe('canonicalLocale', () => {
    it.each([
        ['pt-br', 'pt-BR'],
        ['PT-BR', 'pt-BR'],
        ['zh-hant-tw', 'zh-Hant-TW'],
        ['iw', 'he'],
        ['EN', 'en']
    ])('spells %s as %s', (tag, expected) => {
        expect(canonicalLocale(tag)).toBe(expected);
    });

    it.each(['en-a', 'en_US', '', 'e'])('hands %j back as written, never throwing', (tag) => {
        expect(canonicalLocale(tag)).toBe(tag);
    });
});

describe('isWellFormedLocale', () => {
    it.each(['en', 'PT-br', 'fil', 'zh-Hant-TW'])('accepts %s', (tag) => {
        expect(isWellFormedLocale(tag)).toBe(true);
    });

    it.each(['en-a', 'en_US', '', 'x'])('refuses %j', (tag) => {
        expect(isWellFormedLocale(tag)).toBe(false);
    });
});

describe('baseLanguage', () => {
    it.each([
        ['pt-BR', 'pt'],
        ['PT-br', 'pt'],
        ['fil', 'fil'],
        ['iw', 'he']
    ])('takes the primary subtag of %s: %s', (tag, expected) => {
        expect(baseLanguage(tag)).toBe(expected);
    });

    it('falls back to the text before the first hyphen for a tag it cannot parse', () => {
        expect(baseLanguage('EN-a')).toBe('en');
    });
});

describe('canonicalLocaleSetter', () => {
    it('trims and canonicalises a string', () => {
        expect(canonicalLocaleSetter('  pt-br ')).toBe('pt-BR');
    });

    it('leaves a non-string for the schema to refuse', () => {
        expect(canonicalLocaleSetter(42)).toBe(42);
        expect(canonicalLocaleSetter(undefined)).toBeUndefined();
    });
});
