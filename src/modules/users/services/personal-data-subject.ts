/**
 * @module
 * Who an export or an erasure is about, read off the stored account. One place, so the export
 * (`account`) and the erasure cascade (`./remove.ts`) hand every module the same subject.
 */

import type { PersonalDataSubject } from '@kernel/registry';
import type { UserDocument } from '../model';

/**
 * The subject a `personalData` section collects or erases for.
 *
 * `emailVerified` is what lets a section that matches rows by address answer only for an account
 * that proved the address (anyone can sign up with a stranger's).
 *
 * @param user - the account being exported or erased
 */
export const personalDataSubjectOf = (user: UserDocument): PersonalDataSubject => ({
    userId: String(user._id),
    email: user.email,
    emailVerified: Boolean(user.verifiedAt)
});
