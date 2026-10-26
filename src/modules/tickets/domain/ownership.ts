/**
 * @module
 * Which tickets belong to a person: the one rule the data export and the erasure both ask.
 * Pure, so the two can never disagree about the set (export lists exactly what erase removes).
 */

/** Who an export or erasure is about; structurally the kernel's `PersonalDataSubject`. */
export interface OwnerRef {
    userId: string;
    email: string;
    emailVerified: boolean;
}

/** A Mongo filter over a ticket's owner: its account id, or its sender's address. */
export interface OwnTicketsFilter {
    $or: ({ subjectId: string } | { email: string })[];
}

/**
 * The tickets a person owns:
 *   - everything sent while signed in as the account (`subjectId`), whatever address was typed;
 *   - everything sent under the account's address, but only once the account PROVED that address.
 *     Anyone can sign up with a stranger's address, delete the account and wipe the stranger's
 *     messages, or export them (GDPR Art. 12(6): verify identity before disclosing).
 *
 * @param subject - who the export or erasure is about
 */
export const ownTicketsFilter = ({ userId, email, emailVerified }: OwnerRef): OwnTicketsFilter => ({
    $or: [{ subjectId: userId }, ...(emailVerified ? [{ email }] : [])]
});
