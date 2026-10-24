/**
 * @module
 * The field-level diff an account edit leaves in its audit row, for the admin edit and the owner's
 * own profile edit alike. Which fields are shown by value and which by name is a privacy decision:
 * the audit collection is append-only and never scrubbed on erasure.
 */

import { decryptPii } from '@infrastructure/security/pii-encryption';
import {
    auditChanges,
    type AuditChanges,
    type AuditedFields
} from '@infrastructure/observability/audit-changes';
import { phoneAad, type UserDocument } from '../model';

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
            // Stored encrypted; compared as the person typed it.
            phone: user.phone ? decryptPii(user.phone, phoneAad(user.id), 'user phone') : undefined,
            website: user.website,
            imageUrl: user.imageUrl,
            locale: user.locale,
            analyticsConsent: user.analyticsConsent
        },
        data,
        USER_AUDITED_FIELDS
    );
