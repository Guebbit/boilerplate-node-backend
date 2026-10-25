/**
 * Problem-details helpers for response comparisons.
 *
 * `instance` is `urn:uuid:` and the request id, so two answers to two requests never carry the same
 * one. A test that asserts "these two requests got the same answer" (an enumeration guard, a
 * malformed id against an unknown one) compares everything else.
 */

/**
 * The body without its per-request `instance`.
 *
 * @param body - A parsed problem-details body
 * @returns The same members, `instance` dropped
 */
export const withoutInstance = (body: object): object => ({ ...body, instance: undefined });
