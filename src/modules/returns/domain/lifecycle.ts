/**
 * @module
 * The return lifecycle — which status each move may run FROM and where it lands. Every move backs a
 * conditional write (`repository.ts`'s `claimStatus`), so the table IS the guard, not a comment
 * beside it: two staff members approving and declining the same request race in the database and
 * exactly one wins.
 *
 * @see docs/modules/returns.md#the-lifecycle
 */

import { ReturnKind, ReturnStatus, ReturnReason, ReturnRemedy } from '@types';
import { defineLifecycle } from '@domain-primitives/lifecycle';
import type { LifecycleEvent } from '@domain-primitives/lifecycle';

/**
 * Where a return stands (`ReturnStatus`) and why the goods come back (`ReturnReason`: `withdrawal`
 * is the EU right, the rest are the shop's own reasons). Both sets are closed and come from the
 * contract; which move may follow which is this file's table.
 */
export type { ReturnStatus, ReturnReason, ReturnKind, ReturnRemedy } from '@types';

/** One of a return's moves, named like the door that makes it. */
export type ReturnEvent = 'approve' | 'decline' | 'receive' | 'cancel' | 'close';

/**
 * The moves, one entry each: where it may start and where it lands.
 *
 * - `approve` / `decline`: only a request nobody has answered yet.
 * - `receive`: only an approved return (a withdrawal is born approved).
 * - `cancel`: an approved return whose goods never came. Not a `requested` one (that is declined,
 *   with a reason code) and not a `received` one (the goods are in; it is closed).
 * - `close`: goods received whose money has not gone back yet.
 */
export const RETURN_EVENTS = {
    approve: { from: [ReturnStatus.requested], to: ReturnStatus.approved },
    decline: { from: [ReturnStatus.requested], to: ReturnStatus.declined },
    receive: { from: [ReturnStatus.approved], to: ReturnStatus.received },
    cancel: { from: [ReturnStatus.approved], to: ReturnStatus.canceled },
    close: { from: [ReturnStatus.received], to: ReturnStatus.closed }
} as const satisfies Record<ReturnEvent, LifecycleEvent<ReturnStatus>>;

/**
 * The table, checked once at load. Every set it hands out backs a conditional write
 * (`repository.ts`'s `claimStatus`), so the table IS the guard. `initial` is the status of a
 * request; the birth status is per door (`initialStatusFor` below).
 */
export const returnLifecycle = defineLifecycle<ReturnStatus, ReturnEvent>(
    Object.values(ReturnStatus),
    { initial: ReturnStatus.requested, events: RETURN_EVENTS }
);

/**
 * The status a return is opened in; it is per door (`create.ts`, `cancel-remainder.ts`,
 * `withdraw.ts`), a birth and not a move. A withdrawal is a right the consumer exercises, not a favour
 * staff grant, so there is nothing to decide and it starts `approved`; every other reason waits
 * for an answer — unless staff opened it, when opening it IS the answer.
 * @param reason - why the goods come back
 * @param byStaff - whether staff opened it on the buyer's behalf
 */
export const initialStatusFor = (reason: ReturnReason, byStaff = false): ReturnStatus =>
    reason === ReturnReason.withdrawal || byStaff ? ReturnStatus.approved : ReturnStatus.requested;

/**
 * Statuses in which a return still holds goods that have not come back — the ones that count
 * against an order line's returnable quantity. A declined or canceled return holds nothing: no
 * unit is spoken for, so the same lines can be returned again.
 */
export const QUANTITY_HOLDING_RETURN_STATUSES: readonly ReturnStatus[] = [
    ReturnStatus.requested,
    ReturnStatus.approved,
    ReturnStatus.received,
    ReturnStatus.closed
];

/**
 * The statuses a return must have reached for its goods to count as BACK — received, or closed
 * once the money followed. A return still `requested` or `approved` holds goods that have not come
 * back, so it neither makes the order whole nor takes the delivery refund. `canceled` is out on
 * purpose: it is not a completed return, it is one that never happened.
 */
export const BACK_RETURN_STATUSES: readonly ReturnStatus[] = [
    ReturnStatus.received,
    ReturnStatus.closed
];

/**
 * Whether a return gave the buyer a unit back: a replacement or a repair closes it with the goods
 * in the buyer's hands again, so the unit is not "back" and stays returnable under the guarantee.
 * @param returned - a return's remedy, once the goods were received
 */
export const handsUnitsBack = (returned: { remedy?: ReturnRemedy | undefined }): boolean =>
    returned.remedy === ReturnRemedy.replace || returned.remedy === ReturnRemedy.repair;

/**
 * Whether a return record counts toward the quantities a NEW return may still take: a `return` that
 * holds goods ({@link QUANTITY_HOLDING_RETURN_STATUSES}) and did not hand them back to the buyer.
 * A cancellation never does — its units never shipped — which is why it has its own accounting.
 * @param returned - a return's kind, status and remedy
 */
export const holdsReturnedGoods = (returned: {
    kind: ReturnKind;
    status: ReturnStatus;
    remedy?: ReturnRemedy | undefined;
}): boolean =>
    returned.kind === ReturnKind.return &&
    QUANTITY_HOLDING_RETURN_STATUSES.includes(returned.status) &&
    !handsUnitsBack(returned);
