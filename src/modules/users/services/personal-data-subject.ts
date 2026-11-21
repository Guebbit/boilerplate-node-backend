/**
 * @module
 * Who an export or an erasure is about, read off the stored account. One place, so the export
 * (`account`) and the erasure cascade (`./remove.ts`) hand every module the same subject.
 */

import type { PersonalDataSubject } from '@kernel/registry';
import { normalizeEmail } from '@infrastructure/persistence/normalize-email';
import type { ClientSession } from 'mongoose';
import type { UserDocument } from '../model';
import { userRepository } from '../repository';

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

/**
 * The subject an erasure acts on: {@link personalDataSubjectOf} plus the two addresses a mail job
 * can still carry for the account, which no export may match on (`pendingEmail` was never proved).
 * Both are `select: false`, so they are read here.
 *
 * @param user - the account being erased
 * @param erasedAt - only for a repeat erasure on a restored database: the original erasure date
 * @param session - the erasure's transaction, when there is one
 */
export const erasureSubjectOf = (
    user: UserDocument,
    erasedAt?: Date,
    session?: ClientSession
): Promise<PersonalDataSubject> =>
    userRepository.findByIdWithEmailsInFlight(user.id, session).then((withEmails) => ({
        ...personalDataSubjectOf(user, erasedAt),
        ...(withEmails?.pendingEmail ? { pendingEmail: withEmails.pendingEmail } : {}),
        ...(withEmails?.previousEmail ? { previousEmail: withEmails.previousEmail } : {})
    }));

/**
 * Every address an erased account was reachable at, normalised and without repeats: what a held
 * job is matched against.
 *
 * @param subject - an erasure's subject
 */
export const addressesOf = (subject: PersonalDataSubject): string[] => [
    ...new Set(
        [subject.email, subject.pendingEmail, subject.previousEmail]
            .filter((address): address is string => Boolean(address))
            .map((address) => normalizeEmail(address))
    )
];
