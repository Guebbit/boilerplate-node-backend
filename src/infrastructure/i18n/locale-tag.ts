/**
 * @module
 * The one definition of "the same language tag": BCP 47 compares tags case-blind (RFC 5646 §2.1.1,
 * RFC 4647 §3), and the canonical spelling (`pt-BR`, `zh-Hant-TW`) is the one this API stores,
 * returns and names its dictionary files by.
 *
 * Pure `Intl`, no imports: `infrastructure/config/fields.ts` reads it too, and that file sits near
 * jest's global-setup import chain.
 *
 * See: docs/tools/i18n.md#language-tags
 */

/**
 * The canonical spelling of a tag, or `undefined` when it is not a well-formed BCP 47 tag.
 *
 * @param tag - a tag in any casing
 */
const parseCanonical = (tag: string): string | undefined => {
    // eslint-disable-next-line no-restricted-syntax -- Intl has no non-throwing parse; the RangeError is contained here and read as "malformed"
    try {
        // Intl: canonicalises casing and deprecated subtags (`iw` -> `he`), throws a RangeError on
        // a malformed tag (`en-a`, `en_US`), returns `[]` for an empty one.
        // https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/getCanonicalLocales
        return Intl.getCanonicalLocales(tag).at(0);
    } catch {
        // The throw IS the answer: a malformed tag is a refusal, not an error to surface.
        return undefined;
    }
};

/**
 * Whether the tag is a well-formed BCP 47 language tag, in any casing. The check the 422 on a
 * written tag is made of.
 *
 * @param tag - a tag in any casing
 */
export const isWellFormedLocale = (tag: string): boolean => parseCanonical(tag) !== undefined;

/**
 * The canonical spelling of a tag (`pt-br` -> `pt-BR`, `iw` -> `he`). Never throws: a tag that
 * cannot be parsed comes back as it was, so a setter can store it and validation, not the setter,
 * refuses it.
 *
 * @param tag - a tag in any casing
 */
export const canonicalLocale = (tag: string): string => parseCanonical(tag) ?? tag;

/**
 * The primary language subtag, lower-case: `pt-BR` -> `pt`, `fil` -> `fil`. A tag that cannot be
 * parsed gets the text before its first hyphen, lower-cased.
 *
 * @param tag - a tag in any casing
 */
export const baseLanguage = (tag: string): string => {
    const canonical = parseCanonical(tag);
    // Intl.Locale: `.language` is the primary subtag of a parsed tag.
    // https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale/language
    return canonical === undefined
        ? tag.split('-', 1)[0].toLowerCase()
        : new Intl.Locale(canonical).language;
};

/**
 * The `set:` of a Mongoose column that stores a tag: trims and canonicalises a string, hands
 * anything else back untouched so Mongoose's own cast reports it. Never throws, so a bad value
 * reaches validation instead of failing inside the setter.
 * https://mongoosejs.com/docs/api/schematype.html#SchemaType.prototype.set()
 *
 * @param value - what was assigned to the column
 */
export const canonicalLocaleSetter = (value: unknown): unknown =>
    typeof value === 'string' ? canonicalLocale(value.trim()) : value;
