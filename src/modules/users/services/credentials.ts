/**
 * @module
 * The `account` end of the shared kernel, write side: one narrow mutation per operation.
 */

import type { MfaReservation, UserDocument } from '../model';
import { userRepository } from '../repository';

/**
 * Set an account's password — `account/services/profile.ts`'s `passwordChange` is the only
 * caller, itself the funnel both a password reset and an authenticated password change go
 * through. Takes the already-loaded, already-validated account: `passwordChange` refuses a weak
 * or breached password well before this point, so nothing here re-checks either.
 */
export const setPassword = (user: UserDocument, password: string): Promise<UserDocument> => {
    user.password = password;
    return userRepository.save(user);
};

/**
 * Prove an account's email: stamp `verifiedAt` and save — document-only, per this file's own
 * module docblock. The `unverified` → `customer` promotion that follows a self-service
 * verification is `account`'s own flow's job (`completeEmailVerification`), not this operation's;
 * see `markVerified` in `account/services/verification.ts` for the same split on the
 * password-reset path. Takes the already-loaded holder of the spent token, not an id:
 * `completeEmailVerification`'s caller already found and spent it (see that file's own docblock
 * on why finding and spending are two calls), and a second fetch here would just be a redundant
 * round trip.
 */
export const markEmailVerified = (user: UserDocument): Promise<UserDocument> => {
    user.verifiedAt = new Date();
    return userRepository.save(user);
};

/**
 * Swap a proven `pendingEmail` into `email`, and mark the account verified — the new address just
 * proved itself. Document-only, same split as {@link markEmailVerified}: the caller promotes a
 * still-`unverified` role, since an email change can be the first proof an `unverified` signup
 * ever completes. Revoking the account's refresh tokens afterward is also the caller's job, not
 * this operation's — `save` here answers with the document a token-revoke call needs, nothing more.
 */
export const applyEmailChange = (user: UserDocument, newEmail: string): Promise<UserDocument> => {
    user.email = newEmail;
    user.pendingEmail = undefined;
    user.verifiedAt = new Date();
    return userRepository.save(user);
};

/**
 * Discard a pending email change without proving the new address — its own explicit action
 * (`DELETE /account/pending-email`), distinct from {@link applyEmailChange}'s swap-on-proof. A
 * no-op when nothing is pending, so the caller does not need to check first.
 */
export const cancelPendingEmail = (user: UserDocument): Promise<UserDocument> => {
    user.pendingEmail = undefined;
    return userRepository.save(user);
};

/**
 * Stamp that an inactive account has been warned, so the reaper (`scripts/ops/reap-inactive-accounts.ts`)
 * does not warn it twice. The one field this operation may touch.
 */
export const markInactivityWarned = (user: UserDocument): Promise<UserDocument> => {
    user.inactivityWarnedAt = new Date();
    return userRepository.save(user);
};

/**
 * Persist a 2FA method array mutated in place — `account/services/two-factor.ts` calls this
 * directly as the last step of every enrollment, confirmation, removal, disable and backup-code
 * action. `markModified` is not belt-and-braces: several of those paths UNSET a
 * field on a subdocument (a spent code, a replaced secret), and Mongoose does not always see a
 * delete inside an array element as a change on its own — the write would silently do nothing.
 * The mutation itself stays `account`'s: this operation only knows "persist whatever changed",
 * the same way a `save` on any other ORM does once a caller already holds a loaded, owned document.
 */
export const persistTwoFactorMethods = (user: UserDocument): Promise<UserDocument> => {
    user.markModified('twoFactorMethods');
    return userRepository.save(user);
};

/**
 * Persist the step-up code `account/services/reauth.ts` armed, spent or burned on the loaded
 * document. The mutation stays `account`'s; this only writes it — same split as
 * {@link persistTwoFactorMethods}.
 */
export const persistReauthCode = (user: UserDocument): Promise<UserDocument> => {
    user.markModified('reauthCode');
    return userRepository.save(user);
};

/**
 * Wrong codes an account may have reserved against its armed 2FA before it locks. NIST SP 800-63B
 * allows at most 100; ten is what a person mistyping can plausibly reach.
 */
export const MFA_MAX_FAILURES = 10;

/** How long the lock lasts once {@link MFA_MAX_FAILURES} is reached. */
export const MFA_LOCK_MS = 15 * 60_000;

/**
 * Reserve one wrong-code attempt against the account's armed 2FA, before any code is compared.
 * `reserved: false` means locked: the caller must refuse without comparing. `lockedNow` is true
 * for exactly the reservation that tripped the lock.
 */
export const reserveMfaAttempt = (id: string): Promise<MfaReservation> =>
    userRepository.reserveMfaAttempt(id, MFA_MAX_FAILURES, MFA_LOCK_MS);

/** Clear the 2FA attempt counter and lock — after a right code, or a completed password reset. */
export const resetMfaAttempts = (id: string): Promise<void> => userRepository.resetMfaAttempts(id);

/**
 * Take a TOTP time step for one method, atomically. `false` means a concurrent request (or a
 * replay) already holds that step or a later one.
 */
export const claimTotpStep = (id: string, method: string, step: number): Promise<boolean> =>
    userRepository.claimTotpStep(id, method, step);

/**
 * Move the account's session epoch to `at` (now by default): every access or refresh token minted
 * before it stops working. The funnel for every "I may be compromised" event — logout-all, a
 * password change or reset, a 2FA factor change, an email change, detected refresh reuse.
 */
export const bumpSessionEpoch = (id: string, at: Date = new Date()): Promise<void> =>
    userRepository.bumpSessionEpoch(id, at);
