/**
 * @module
 * Generic value guards and object helpers with no home of their own — narrow enough that
 * unrelated call sites (i18n dictionary merging, locale key trees, an HTTP request body, test
 * factories) would each hand-write the same one.
 */

/**
 * True for a plain object — excludes `null` and arrays, which `typeof value === 'object'` alone
 * would not, and which every caller here treats as a leaf rather than a node to descend into or
 * index.
 * @param value - anything; typically `unknown` at a JSON or request boundary
 */
export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Drop keys whose value is `undefined`.
 *
 * Not named `compact` — that's lodash's own (array-only, falsy-dropping) function, and reusing
 * the name for this one invites the wrong assumption. `readInput` (`@infrastructure/http/request`)
 * needs it to keep a `||`-merged request from carrying explicit `undefined`s through to a
 * Mongoose filter, and every test factory needs it for the mirror reason: `{ stock: undefined }`
 * spread over a default would WIN, shadowing the model's own `default:`.
 *
 * @param source - the object to filter
 * @returns a copy without the keys whose value is `undefined`
 */
export const stripUndefined = <T extends Record<string, unknown>>(source: T): T =>
    // `Object.fromEntries` returns `{ [k: string]: unknown }`; the cast restores `T`, whose keys
    // are the subset that survived the filter.
    Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined)) as T;
