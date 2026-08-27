/**
 * The locale schemas' contracts, and the base-language derivation in front of them.
 *
 * Two unique indexes here are what make the translation tier addressable at all:
 *
 *   - `locales_tag` — one row per language tag. Without it two `en-GB` rows can exist, and which
 *     one a dictionary read returns is whichever Mongo reaches first.
 *   - `localeMessages_locale_tenant_key` — one value per (locale, tenant, key). This is the
 *     compound identity of a translation, and it is what lets a merge be an upsert rather than a
 *     read-modify-write. Lose it and re-saving a string silently appends a duplicate that shadows
 *     the original.
 *
 * The `lowercase: true` flags are part of the same guarantee: `EN-gb` and `en-GB` must not be able
 * to occupy two rows under a unique index on `tag`.
 */
import { localeSchema, localeMessageSchema, deriveBaseLanguage } from '@modules/locales/model';
import { LocaleDirection } from '@types';
import {
    defaultOf,
    enumOf,
    indexOptionSpecs,
    indexSpecs,
    optionsOf,
    pathOptions,
    requiredPaths
} from '@tests/schema';

/** Whether a string path normalises case/whitespace before it is stored. */
const normalises = (schema: Parameters<typeof optionsOf>[0], path: string) =>
    (schema.path(path) as { options?: { lowercase?: boolean; trim?: boolean } }).options ?? {};

describe('localeSchema', () => {
    it('requires everything needed to offer a language', () => {
        // `baseLanguage` is required and never supplied by a caller — the `pre('validate')` hook
        // below derives it. Required plus derived is the pairing that makes it impossible to
        // store a row the negotiator cannot match.
        expect(requiredPaths(localeSchema)).toEqual(['baseLanguage', 'name', 'nativeName', 'tag']);
    });

    it('makes one row per tag a database fact', () => {
        expect(indexOptionSpecs(localeSchema)).toEqual(['locales_tag: unique=true']);
        expect(indexSpecs(localeSchema)).toEqual(['locales_tag: tag+1']);
    });

    it('lower-cases and trims the tag, so the unique index cannot be evaded', () => {
        // `EN-gb` and `en-GB` are the same language. Without normalisation they are two rows
        // under a unique index that believes it is doing its job.
        expect(normalises(localeSchema, 'tag')).toMatchObject({ lowercase: true, trim: true });
        expect(normalises(localeSchema, 'baseLanguage')).toMatchObject({
            lowercase: true,
            trim: true
        });
    });

    it('defaults a language to left-to-right, active, at revision zero', () => {
        // `active: true` — adding a language publishes it. `revision: 0` is the counter clients
        // poll to know their dictionary is stale; absent, every client would refetch forever.
        expect(defaultOf(localeSchema, 'direction')).toBe(LocaleDirection.ltr);
        expect(defaultOf(localeSchema, 'active')).toBe(true);
        expect(defaultOf(localeSchema, 'revision')).toBe(0);
    });

    it('restricts direction to the contract enum and refuses a negative revision', () => {
        expect(enumOf(localeSchema, 'direction')).toEqual(Object.values(LocaleDirection));
        expect(pathOptions(localeSchema, 'revision').min).toBe(0);
    });
});

describe('deriveBaseLanguage', () => {
    it('takes the primary subtag', () => {
        // `en-GB` and `en-US` must both negotiate against `en`, or a client asking for a regional
        // variant nobody has translated falls back to the API default instead of to its own
        // language.
        expect(deriveBaseLanguage('en-GB')).toBe('en');
        expect(deriveBaseLanguage('pt-BR')).toBe('pt');
    });

    it('leaves a bare tag alone', () => {
        expect(deriveBaseLanguage('it')).toBe('it');
    });

    it('normalises case and surrounding whitespace', () => {
        // The stored value feeds a case-sensitive comparison in the negotiator, and a tag arrives
        // from an `Accept-Language` header written by whoever wrote the client.
        expect(deriveBaseLanguage('  EN-gb ')).toBe('en');
        expect(deriveBaseLanguage('IT')).toBe('it');
    });
});

describe('localeMessageSchema', () => {
    it('requires the full compound identity of a translation', () => {
        // `value` is not required: an empty string is a legitimate translation — it is how a
        // string is deliberately blanked — and the default below makes that the initial state.
        expect(requiredPaths(localeMessageSchema)).toEqual(['key', 'locale', 'tenant']);
    });

    it('makes one value per locale, tenant and key a database fact', () => {
        // The compound identity. This is what lets a merge be an upsert rather than a
        // read-modify-write, and what stops a re-save from shadowing the original with a copy.
        expect(indexSpecs(localeMessageSchema)).toEqual([
            'localeMessages_locale_tenant_key: locale+1, tenant+1, key+1'
        ]);
        expect(indexOptionSpecs(localeMessageSchema)).toEqual([
            'localeMessages_locale_tenant_key: unique=true'
        ]);
    });

    it('normalises the locale and tenant but not the key', () => {
        // Locale and tenant are addresses and are case-insensitive; a KEY is not. `Cart.Empty`
        // and `cart.empty` are different keys, and lower-casing them would silently merge two
        // strings into one.
        expect(normalises(localeMessageSchema, 'locale')).toMatchObject({ lowercase: true });
        expect(normalises(localeMessageSchema, 'tenant')).toMatchObject({ lowercase: true });
        expect(normalises(localeMessageSchema, 'key').lowercase).toBeUndefined();
        expect(normalises(localeMessageSchema, 'key')).toMatchObject({ trim: true });
    });

    it('defaults a value to the empty string rather than leaving it absent', () => {
        // A missing key and a key set to nothing are different states to an editor; `''` is what
        // makes "declared but untranslated" representable.
        expect(defaultOf(localeMessageSchema, 'value')).toBe('');
    });

    it('keeps timestamps on both collections', () => {
        expect(optionsOf(localeSchema).timestamps).toBe(true);
        expect(optionsOf(localeMessageSchema).timestamps).toBe(true);
    });
});
