/**
 * @module
 * The two coercions every environment reader shares.
 *
 * Everything reads `process.env` where it is used, and lazily — a value set after import still
 * applies, and a test can set a variable without knowing which import order froze it. What is
 * centralised is the COERCION, because a variable is always a string and there are only two things
 * this app does with one it did not just use verbatim: read it as a number, or read it as a switch.
 * Both were written several ways, and two of the spellings answered `NaN`.
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

/** The strings a deployment may write for "on", either case. */
const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

/** The strings a deployment may write for "off", either case. */
const FALSY = new Set(['0', 'false', 'no', 'off']);

/**
 * A switch from the environment, or `fallback` when the variable says nothing recognisable.
 *
 * Both vocabularies are accepted because both were already in use: kill switches were written
 * `!== '0'` while opt-ins used `=== '1'`/`'true'`, which used to invert flags like `NODE_DEMO`.
 *
 * @param key - the variable's name
 * @param fallback - the value a deployment gets when it did not usably set one
 */
export const environmentFlag = (key: string, fallback: boolean): boolean => {
    const raw = process.env[key]?.trim().toLowerCase();
    if (raw === undefined || raw === '') return fallback;
    if (TRUTHY.has(raw)) return true;
    if (FALSY.has(raw)) return false;
    return fallback;
};
