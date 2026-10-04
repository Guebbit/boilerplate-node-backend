/**
 * @module
 * The return lifecycle — which status each write may run FROM. Every set backs a conditional write
 * (`repository.ts`'s `claimStatus`), so membership here IS the guard, not a comment beside it: two
 * staff members approving and declining the same request race in the database and exactly one wins.
 *
 * See: docs/modules/returns.md#the-lifecycle
 */

import { ReturnStatus, ReturnReason } from '@types';

/**
 * Where a return stands (`ReturnStatus`) and why the goods come back (`ReturnReason`: `withdrawal`
 * is the EU right, the rest are the shop's own reasons). Both sets are closed and come from the
 * contract; which move may follow which is this file's table.
 */
export type { ReturnStatus, ReturnReason } from '@types';

/** What staff may decide: only a request nobody has answered yet. */
export const DECIDABLE_RETURN_STATUSES: readonly ReturnStatus[] = [ReturnStatus.requested];

/** What may be received: only a return that was approved (a withdrawal is born approved). */
export const RECEIVABLE_RETURN_STATUSES: readonly ReturnStatus[] = [ReturnStatus.approved];

/** What may be closed: goods received whose money has not gone back yet. */
export const CLOSABLE_RETURN_STATUSES: readonly ReturnStatus[] = [ReturnStatus.received];

/**
 * The status a return is opened in. A withdrawal is a right the consumer exercises, not a favour
 * staff grant, so there is nothing to decide and it starts `approved`; every other reason waits
 * for an answer.
 * @param reason - why the goods come back
 */
export const initialStatusFor = (reason: ReturnReason): ReturnStatus =>
    reason === ReturnReason.withdrawal ? ReturnStatus.approved : ReturnStatus.requested;

/**
 * Statuses in which a return still holds goods that have not come back — the ones that count
 * against an order line's returnable quantity. A declined return holds nothing.
 */
export const QUANTITY_HOLDING_RETURN_STATUSES: readonly ReturnStatus[] = [
    ReturnStatus.requested,
    ReturnStatus.approved,
    ReturnStatus.received,
    ReturnStatus.closed
];
