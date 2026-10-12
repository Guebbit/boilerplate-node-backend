/**
 * @module
 * The per-account wrong-code policy. `users` stores the counter; how many misses lock, and for
 * how long, is `account`'s call and is handed to the users door on every reservation.
 */

/**
 * Wrong codes an account may have reserved against its armed 2FA before it locks. NIST SP 800-63B
 * allows at most 100; ten is what a person mistyping can plausibly reach.
 */
export const MFA_MAX_FAILURES = 10;

/** How long the lock lasts once {@link MFA_MAX_FAILURES} is reached. */
export const MFA_LOCK_MS = 15 * 60_000;
