/**
 * The two coercions every environment reader shares.
 *
 * Everything reads `process.env` where it is used, and lazily — a value set after import still
 * applies, and a test can set a variable without knowing which import order froze it. What is
 * centralised is the COERCION, because a variable is always a string and there are only two things
 * this app does with one it did not just use verbatim: read it as a number, or read it as a switch.
 * Both were written several ways, and two of the spellings answered `NaN`.
 */

/**
 * An integer from the environment, or `fallback` when the variable is unusable.
 *
 * Whole-string match, base 10: a trailing unit (`NODE_MAX_UPLOAD_BYTES=5mb`) takes the default
 * rather than becoming a five-byte limit, and a zero-padded `0900` is 900 rather than octal.
 *
 * @param key - the variable's name
 * @param fallback - the value a deployment gets when it did not usably set one
 * @param min - reject a parsed value below this, falling back instead. For readers whose number is
 *   a size or an interval, where `0` and negatives are not smaller settings but broken ones.
 */
const INTEGER = /^[+-]?\d+$/;

export const environmentNumber = (key: string, fallback: number, min?: number): number => {
    const raw = process.env[key]?.trim();
    if (!raw || !INTEGER.test(raw)) return fallback;

    const parsed = Number.parseInt(raw, 10);
    return min !== undefined && parsed < min ? fallback : parsed;
};

/** The strings a deployment may write for "on" and "off", either case. */
const TRUTHY = new Set(['1', 'true', 'yes', 'on']);
const FALSY = new Set(['0', 'false', 'no', 'off']);

/**
 * A switch from the environment, or `fallback` when the variable says nothing recognisable.
 *
 * Both vocabularies are accepted because both were already in use: kill switches were written
 * `!== '0'` and opt-ins `=== '1'` or `=== 'true'`, so `NODE_DEMO=1` turned demo mode off and
 * `NODE_RABBITMQ_ENABLED=false` left the queue on.
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
