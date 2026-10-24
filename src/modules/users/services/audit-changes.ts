/**
 * @module
 * The field-level diff an account edit leaves in its audit row, for the admin edit and the owner's
 * own profile edit alike. Which fields are shown by value and which by name is a privacy decision:
 * the audit collection is append-only and never scrubbed on erasure.
 */

import {
    auditChanges,
    type AuditChanges,
    type AuditedFields
} from '@infrastructure/observability/audit-changes';
import type { UserDocument } from '../model';

/** The fields either edit can move, as the request names them. */
type UserAuditedKey =
    | 'username'
    | 'email'
    | 'phone'
    | 'website'
    | 'imageUrl'
    | 'locale'
    | 'analyticsConsent';

/**
 * Preferences are recorded with their values; everything that identifies the person (name, email,
 * phone, website, picture) by name only.
 */
const USER_AUDITED_FIELDS: AuditedFields<UserAuditedKey> = {
    valued: ['locale', 'analyticsConsent'],
    named: ['username', 'email', 'phone', 'website', 'imageUrl']
};

/**
 * What an edit would move on an account.
 *
 * Call it BEFORE the change is assigned: the document is updated in place.
 *
 * @param user - the loaded account, not yet changed
 * @param data - the change-set; an absent key leaves the field alone, `null` clears it
 * @returns `metadata` for the audit row: `{}` when nothing audited moved
 */
export const userAuditChanges = (
    user: UserDocument,
    data: Readonly<Partial<Record<UserAuditedKey, unknown>>>
): AuditChanges =>
    auditChanges(
        {
            username: user.username,
            email: user.email,
            // Stored encrypted with a random IV, so two equal numbers never compare equal and
            // decrypting just to diff would make an audit row able to fail an edit. Presence
            // stands in: sending a number counts as a change, clearing an unset one does not.
            phone: user.phone ? '<set>' : undefined,
            website: user.website,
            imageUrl: user.imageUrl,
            locale: user.locale,
            analyticsConsent: user.analyticsConsent
        },
        data,
        USER_AUDITED_FIELDS
    );
