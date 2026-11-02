/**
 * @module
 * Which tasks belong to a person: the one rule the data export and the erasure both ask.
 * Pure, so the two can never disagree about the set (export lists exactly what erase removes).
 */

/** Who an export or erasure is about; structurally the kernel's `PersonalDataSubject`. */
export interface OwnerRef {
    userId: string;
    email: string;
    emailVerified: boolean;
}

/**
 * A Mongo filter over a visitor task's owner: its account id, or its sender's address. System
 * tasks are about a record, not a sender; they follow `subjectId` through their own rule.
 */
export interface OwnTasksFilter {
    source: 'visitor';
    $or: ({ subjectId: string } | { email: string })[];
}

/**
 * The visitor tasks a person owns:
 *   - everything sent while signed in as the account (`subjectId`), whatever address was typed;
 *   - everything sent under the account's address, but only once the account PROVED that address.
 *     Anyone can sign up with a stranger's address, delete the account and wipe the stranger's
 *     messages, or export them (GDPR Art. 12(6): verify identity before disclosing).
 *
 * @param subject - who the export or erasure is about
 */
export const ownTasksFilter = ({ userId, email, emailVerified }: OwnerRef): OwnTasksFilter => ({
    source: 'visitor',
    $or: [{ subjectId: userId }, ...(emailVerified ? [{ email }] : [])]
});
