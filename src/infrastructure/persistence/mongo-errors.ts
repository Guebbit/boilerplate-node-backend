/**
 * @module
 * Driver-level facts about a Mongo write failure — checks a repository or the HTTP error
 * interpreter can make without reaching into the response layer for something that is really a
 * driver fact, not an HTTP one.
 */

/**
 * Mongo's duplicate-key error (E11000): a write a unique index refused.
 *
 * One definition because two layers read it differently — the cart repository as a retry signal,
 * `http/errors.ts`'s interpreter as "already taken" (409). The CODE is checked, not the message,
 * because E11000's text names the index and would break the first time one is renamed.
 */
export const isDuplicateKey = (error: unknown): boolean =>
    (error as { code?: number } | undefined)?.code === 11_000;
