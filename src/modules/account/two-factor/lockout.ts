/**
 * @module
 * The per-account wrong-code policy. `users` stores the counter; how many misses lock, and for
 * how long, is `account`'s call and is handed to the users door on every reservation.
 */

import { twoFactorRules } from '../rules.generated';

/**
 * Wrong codes an account may have reserved against its armed 2FA before it locks. NIST SP 800-63B
 * allows at most 100; ten is what a person mistyping can plausibly reach. From `rules.yaml`.
 */
export const MFA_MAX_FAILURES: number = twoFactorRules.lockout.maxFailures;

/** How long the lock lasts once {@link MFA_MAX_FAILURES} is reached. From `rules.yaml`. */
export const MFA_LOCK_MS: number = twoFactorRules.lockout.lockMs;
