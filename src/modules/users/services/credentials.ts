/**
 * @module
 * The `account` end of the shared kernel, write side: one narrow mutation per operation.
 */

import type { UserDocument } from '../model';
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
