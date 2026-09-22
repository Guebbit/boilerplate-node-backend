/**
 * @module
 * The coercions every environment reader shares.
 *
 * Everything reads `process.env` where it is used, and lazily — a value set after import still
 * applies, and a test can set a variable without knowing which import order froze it. What is
 * centralised is the COERCION, because a variable is always a string and there are only a few
 * things this app does with one it did not just use verbatim: read it as a whole number, as a
 * decimal, or as a switch. Each was written several ways, and more than one spelling answered
 * `NaN`.
 */

/** Whole-string, base-10 integers only — no leading/trailing junk, no hex, no unit suffix. */
const INTEGER = /^[+-]?\d+$/;

/**
 * An integer from the environment, or `fallback` when the variable is unusable.
 *
 * Whole-string match, base 10: a trailing unit (`NODE_MAX_UPLOAD_BYTES=5mb`) takes the default,
 * and a zero-padded `0900` is 900, not octal.
 *
 * @param key - the variable's name
 * @param fallback - the value a deployment gets when it did not usably set one
 * @param min - reject a value below this, falling back instead — for sizes/intervals where
 *   `0`/negative is broken, not just small
 */
export const environmentNumber = (key: string, fallback: number, min?: number): number => {
    const raw = process.env[key]?.trim();
    if (!raw || !INTEGER.test(raw)) return fallback;

    const parsed = Number.parseInt(raw, 10);
    return min !== undefined && parsed < min ? fallback : parsed;
};

/** Whole-string decimals only — an optional sign, digits, and an optional fractional part. */
const DECIMAL = /^[+-]?\d+(\.\d+)?$/;

/**
 * The one decimal parse every reader and every boot-time validity check must share — `.5` (no
 * leading digit), `1e-1` (scientific notation) and a whitespace-only string all coerce to a
 * number under a bare `Number(raw)`, so a check written that way can wave a value through that
 * this parser (and therefore {@link environmentDecimal}) then treats as unset. Two callers reading
 * the same variable through two different parsers is exactly how a value passes validation and
 * still silently falls back to the default — see `products/config.ts`'s `invalidVatRateConfig`.
 *
 * @param raw - the variable's raw string value, or `undefined` when unset
 * @returns the parsed number, or `undefined` when `raw` is missing or not a whole-string decimal
 */
export const parseEnvironmentDecimal = (raw: string | undefined): number | undefined => {
    const trimmed = raw?.trim();
    return trimmed && DECIMAL.test(trimmed) ? Number.parseFloat(trimmed) : undefined;
};

/**
 * A decimal number from the environment, or `fallback` when the variable is unusable — the same
 * contract as {@link environmentNumber}, for a value that is not a whole number (a VAT rate, a
 * ratio) rather than a count.
 *
 * @param key - the variable's name
 * @param fallback - the value a deployment gets when it did not usably set one
 */
export const environmentDecimal = (key: string, fallback: number): number =>
    parseEnvironmentDecimal(process.env[key]) ?? fallback;

/** The words a caller may write for "on", either case. */
const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

/** The words a caller may write for "off", either case. */
const FALSY = new Set(['0', 'false', 'no', 'off']);

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

/**
 * A switch from the environment, or `fallback` when the variable says nothing recognisable.
 *
 * Both vocabularies are accepted because both are in use: kill switches are written `!== '0'`
 * while opt-ins use `=== '1'`/`'true'`.
 *
 * @param key - the variable's name
 * @param fallback - the value a deployment gets when it did not usably set one
 */
export const environmentFlag = (key: string, fallback: boolean): boolean =>
    parseBooleanWord(process.env[key] ?? '') ?? fallback;

/**
 * A closed-set choice from the environment — the shape a provider/mode selector reads: trimmed,
 * lower-cased, empty or unset falls back to `fallback`, anything else outside `allowed` throws.
 * One rule for every selector (`NODE_PAYMENT_PROVIDER`, `NODE_ANTIBOT_PROVIDER`,
 * `NODE_ANALYTICS_PROVIDER`, `NODE_MAIL_TRANSPORT`, `NODE_LOG_PERSONAL_FIELDS`) rather than five
 * separate ones: a hand-rolled `process.env[key] ?? fallback` with no trim refuses to boot on a
 * trailing space or an empty `X=` instead of falling back the way this shared version does.
 *
 * @param key - the variable's name, used only in the thrown message
 * @param allowed - the closed set of valid values, already lower-cased
 * @param fallback - the value a deployment gets when it did not usably set one; must itself be a
 *   member of `allowed`
 * @returns the trimmed, lower-cased value, or `fallback` when unset/empty
 * @throws {Error} when set to something outside `allowed`
 */
export const environmentChoice = <T extends string>(
    key: string,
    allowed: readonly T[],
    fallback: T
): T => {
    const raw = process.env[key]?.trim().toLowerCase();
    if (!raw) return fallback;
    if ((allowed as readonly string[]).includes(raw)) return raw as T;
    throw new Error(`Unknown ${key}: "${raw}". Allowed: ${allowed.join(', ')}.`);
};
