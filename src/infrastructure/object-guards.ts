/**
 * @module
 * Generic value guards with no home of their own — narrow enough that three unrelated call sites
 * (i18n dictionary merging, locale key trees, an HTTP request body) would each hand-write the
 * same one.
 */

/**
 * True for a plain object — excludes `null` and arrays, which `typeof value === 'object'` alone
 * would not, and which every caller here treats as a leaf rather than a node to descend into or
 * index.
 * @param value - anything; typically `unknown` at a JSON or request boundary
 */
export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
