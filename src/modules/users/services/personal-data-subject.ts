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
 * @param erasedAt - only for a repeat erasure on a restored database: the original erasure date
 */
export const personalDataSubjectOf = (
    user: UserDocument,
    erasedAt?: Date
): PersonalDataSubject => ({
    userId: String(user._id),
    email: user.email,
    emailVerified: Boolean(user.verifiedAt),
    ...(erasedAt ? { erasedAt } : {})
});
