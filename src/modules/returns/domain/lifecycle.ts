/**
 * @module
 * The return lifecycle — which status each write may run FROM. Every set backs a conditional write
 * (`repository.ts`'s `claimStatus`), so membership here IS the guard, not a comment beside it: two
 * staff members approving and declining the same request race in the database and exactly one wins.
 *
 * See: docs/modules/returns.md#the-lifecycle
 */

/** Where a return stands. The set is closed; which move may follow which is this file's table. */
export type ReturnStatus = 'requested' | 'approved' | 'declined' | 'received' | 'closed';

/** Why the goods come back. `withdrawal` is the EU right; the rest are the shop's own reasons. */
export type ReturnReason = 'withdrawal' | 'defective' | 'wrong_item' | 'other';

/** What staff may decide: only a request nobody has answered yet. */
export const DECIDABLE_RETURN_STATUSES: readonly ReturnStatus[] = ['requested'];

/** What may be received: only a return that was approved (a withdrawal is born approved). */
export const RECEIVABLE_RETURN_STATUSES: readonly ReturnStatus[] = ['approved'];

/** What may be closed: goods received whose money has not gone back yet. */
export const CLOSABLE_RETURN_STATUSES: readonly ReturnStatus[] = ['received'];

/**
 * The status a return is opened in. A withdrawal is a right the consumer exercises, not a favour
 * staff grant, so there is nothing to decide and it starts `approved`; every other reason waits
 * for an answer.
 * @param reason - why the goods come back
 */
export const initialStatusFor = (reason: ReturnReason): ReturnStatus =>
    reason === 'withdrawal' ? 'approved' : 'requested';

/**
 * Statuses in which a return still holds goods that have not come back — the ones that count
 * against an order line's returnable quantity. A declined return holds nothing.
 */
export const QUANTITY_HOLDING_RETURN_STATUSES: readonly ReturnStatus[] = [
    'requested',
    'approved',
    'received',
    'closed'
];
