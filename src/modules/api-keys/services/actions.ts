/**
 * @module
 * In any module: what the caller may do to a record is decided here, once, so no client re-derives
 * it. Here: the one move a credential has, revoking it, from the `delete:ApiKey` key and the
 * credential's own state.
 *
 * Delete it if: the module has nothing a client must grey out per row.
 *
 * See: docs/theory/tactical-ddd.md#2-capabilities-the-server-answers-what-a-client-may-do
 */

import type { ApiKeyActions, TenantCallerContext } from '@types';
import { permitsOnRows } from '@kernel/ability';
import type { StoredApiKey } from '../repository';

/**
 * A function from a stored credential to its actions, for one caller: the ability is built once,
 * then asked of each row, so a page costs one ability and not one per row.
 *
 * @param context - the caller
 */
export const actionsForRows = (
    context: TenantCallerContext
): ((row: Pick<StoredApiKey, 'revokedAt'>) => ApiKeyActions) => {
    const permits = permitsOnRows(context.caller, 'ApiKey', ['delete']);

    // A revoked credential is revoked for good; the call would be an accepted no-op, so the
    // control is off rather than offered.
    return (row) => ({ revoke: permits({}).delete && !row.revokedAt });
};
