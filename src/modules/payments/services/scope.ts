/**
 * @module
 * Row scoping for the payments collection — the one rule every other file here reads through.
 */

import { accessibleFilter } from '@kernel/access/query';
import type { AuthContext } from '@types';

/**
 * Which payments a caller may read — the same rule `orderService.callerScope` applies, over this
 * module's collection. `ownerScope` not `visibleScope`: payments are never soft-deleted, so
 * "whose" is the only axis there is.
 */
export const callerScope = (context?: AuthContext) => accessibleFilter(context, 'Payment');
