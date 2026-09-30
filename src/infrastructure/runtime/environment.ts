/**
 * @module
 * The one place the vocabulary of a switch is written down: `parseBooleanWord`, shared by the
 * configuration fields (`infrastructure/config/fields.ts`) and by request parsing, where a query
 * string and a form field use the same words an environment variable does.
 *
 * Reading the environment itself is not done here: every variable is read by its owner's
 * `config.ts`, through `defineConfig`.
 */

/** The words a caller may write for "on", either case. */
export const TRUTHY_WORDS: readonly string[] = ['1', 'true', 'yes', 'on'];

/** The words a caller may write for "off", either case. */
export const FALSY_WORDS: readonly string[] = ['0', 'false', 'no', 'off'];

/** {@link TRUTHY_WORDS} as a set — a lookup with no prototype chain to fall into. */
const TRUTHY = new Set(TRUTHY_WORDS);

/** {@link FALSY_WORDS} as a set. */
const FALSY = new Set(FALSY_WORDS);

/**
 * Decode one word as a boolean, case-insensitively — the vocabulary an env var, a query string
 * and a form field all use — or say it isn't one.
 *
 * A `Set` lookup rather than a property lookup on a plain object: `'constructor' in {}` is true
 * (every object inherits from `Object.prototype`), so keying a lookup on caller-controlled text
 * through `in` or bracket access can resolve to an inherited method instead of "not found".
 * `Set.has` carries no prototype chain to fall into.
 *
 * @param word - the raw text to decode
 * @returns `true`/`false` for a recognised word, `undefined` for anything else (including blank)
 */
export const parseBooleanWord = (word: string): boolean | undefined => {
    const normalized = word.trim().toLowerCase();
    if (TRUTHY.has(normalized)) return true;
    if (FALSY.has(normalized)) return false;
    return undefined;
};
