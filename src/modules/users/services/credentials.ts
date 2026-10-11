/**
 * @module
 * The `account` end of the shared kernel, write side: one narrow mutation per operation.
 */

import { Error as MongooseError, type ClientSession } from 'mongoose';
import type { MfaReservation, UserDocument } from '../model';
import { userRepository } from '../repository';
import { isEmptyWrite, planTwoFactorWrite, settleTwoFactorWrite } from '../two-factor-write';

/**
 * Set an account's password — `account/services/profile.ts`'s `passwordChange` is the only
 * caller, itself the funnel both a password reset and an authenticated password change go
 * through. Takes the already-loaded, already-validated account: `passwordChange` refuses a weak
 * or breached password well before this point, so nothing here re-checks either.
 *
 * @param user - the account, carrying its credential fields
 * @param password - the new password, already accepted
 * @param session - the transaction this write belongs to, when the caller owns one
 */
export const setPassword = (
    user: UserDocument,
    password: string,
    session?: ClientSession
): Promise<UserDocument> => {
    user.password = password;
    return userRepository.save(user, session);
};

/**
 * Move the account's session epoch on the loaded document, for the caller's own `save` to carry:
 * a credential change that ends sessions in the very write that changes the credential cannot be
 * left half-done by a second write failing. Never moves the epoch backwards.
 *
 * @param user - the account the caller is about to save
 * @param at - the new epoch
 */
export const markSessionsEnded = (user: UserDocument, at: Date = new Date()): void => {
    if (!user.tokensValidAfter || user.tokensValidAfter < at) user.tokensValidAfter = at;
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
    // Kept for the undo link: the only copy of the address the account is being moved away from.
    user.previousEmail = user.email;
    user.email = newEmail;
    user.pendingEmail = undefined;
    user.verifiedAt = new Date();
    // The address is the recovery channel: whoever held the account under the old one is out now.
    markSessionsEnded(user);
    return userRepository.save(user);
};

/**
 * Put back the address held before the last confirmed change — the undo link's action. The old
 * address was proven when it was first verified, so `verifiedAt` stays. Document-only, like
 * {@link applyEmailChange}: ending the sessions is the caller's job. Rejects with a duplicate-key
 * error when another account has taken the old address since, which the caller answers as 409.
 *
 * @param user - the account, loaded with `previousEmail`
 */
export const restorePreviousEmail = (user: UserDocument): Promise<UserDocument> => {
    if (user.previousEmail) user.email = user.previousEmail;
    user.previousEmail = undefined;
    user.pendingEmail = undefined;
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
 * Persist the 2FA changes a request made on its loaded copy — `account/services/two-factor.ts`
 * calls this as the last step of every enrollment, confirmation, removal, disable and backup-code
 * action. The mutation stays `account`'s; this writes only what changed, per method and in one
 * atomic update, so a request holding an older copy cannot undo what a concurrent one wrote (a
 * claimed TOTP step above all) nor fail it with a lost-race error. A write that changes nothing
 * sends nothing.
 *
 * @param user - the loaded copy, credentials included, as the request left it
 * @param dropped - the methods the request removed from the copy, or `'all'` for a disable;
 *   the copy no longer holds them, so the write cannot find them by itself
 * @returns `user`, now settled
 * @throws DocumentNotFoundError when the account is gone, which `isLostRace` recognises
 */
export const persistTwoFactorMethods = (
    user: UserDocument,
    dropped: readonly string[] | 'all' = []
): Promise<UserDocument> => {
    const write = planTwoFactorWrite(user, dropped);
    if (isEmptyWrite(write)) return Promise.resolve(user);

    return userRepository.writeTwoFactor(user.id, write).then((found) => {
        // The error Mongoose's own `save` raises for a vanished row, so `isLostRace` treats both alike.
        if (!found) throw new MongooseError.DocumentNotFoundError(user.id);
        settleTwoFactorWrite(user);
        return user;
    });
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
 *
 * @param id - the account
 * @param at - the new epoch
 * @param session - the transaction this write belongs to, when the caller owns one
 */
export const bumpSessionEpoch = (
    id: string,
    at: Date = new Date(),
    session?: ClientSession
): Promise<void> => userRepository.bumpSessionEpoch(id, at, session);

/**
 * Stamp the account's last proof of life — a session was minted or refreshed. Throttled to one
 * write a day in the repository, so a caller may call it on every mint without counting.
 * @param id - the account
 * @param now - the moment to stamp
 */
export const touchLastActive = (id: string, now: Date = new Date()): Promise<void> =>
    userRepository.touchLastActive(id, now);

/**
 * Stamp the account as active because a key it minted was just used. Throttled to one write a day
 * in the repository, so the resolve path may call it on every request.
 * @param id - the account that minted the key
 * @param now - the moment to stamp
 */
export const touchApiKeyUse = (id: string, now: Date = new Date()): Promise<void> =>
    userRepository.touchApiKeyUse(id, now);
