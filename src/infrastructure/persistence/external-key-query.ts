/**
 * @module
 * The query option for a lookup keyed by a value an outsider supplied.
 */

/**
 * Per-query `sanitizeFilter`: any nested object in the filter whose key starts with `$` is wrapped
 * in `$eq`, so `{ "$ne": null }` standing where a string belongs matches nothing instead of
 * everything.
 *
 * Zod at the edge is the first guard and stays the main one; this is the second, for the lookups
 * keyed by a provider reference, an email or a federated identity. It is per query, not global:
 * a filter that carries its own operators must wrap them with `trusted()` from mongoose, or they
 * stop working too. https://mongoosejs.com/docs/api/query.html#Query.prototype.sanitizeFilter()
 */
export const EXTERNAL_KEY_QUERY = { sanitizeFilter: true } as const;
