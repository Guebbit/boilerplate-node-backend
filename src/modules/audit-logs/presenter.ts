/**
 * @module
 * What the platform operator's view of an audit entry carries. The tenant view serves a stored
 * entry as the repository normalised it; the operator's differs in one way, named here.
 */

import type { AuditEntryItem } from '@types';
import { correlationDigest } from '@infrastructure/security/pseudonymise';

/**
 * An entry as the platform operator sees it: the address is replaced by a digest, so repeated
 * attempts from one address still correlate without the operator reading a shop's visitors' IPs.
 *
 * @param item - the stored entry
 */
export const presentIncidentEntry = (item: AuditEntryItem): AuditEntryItem => ({
    ...item,
    ...(item.ip === undefined ? {} : { ip: correlationDigest(item.ip) })
});
