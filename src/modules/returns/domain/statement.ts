/**
 * @module
 * What the buyer said, and when: the date and the channel of a request or a withdrawal. The buyer's
 * own are set by the server (now, `online`); staff recording a phone call, an email or a letter
 * give them. Timing is judged on the day it was SENT, not the day the shop read it (CRD Art.
 * 11(2)), so a late-read, in-time withdrawal is still in time.
 *
 * Pure: the one rule that decides which of the two fields each caller may or must send.
 *
 * See: docs/modules/returns.md#staff-open-a-return-for-the-buyer
 */

import type { ReturnStatementChannel, StaffStatementChannel } from '@types';
import type { ReturnKind, ReturnReason } from './lifecycle';

/** What {@link checkStatement} reads. */
export interface StatementInput {
    /** Whether the caller is the order's buyer (a staff member buying for themselves is one). */
    byBuyer: boolean;
    reason: ReturnReason;
    kind: ReturnKind;
    /** What the request carried, if anything. */
    requestedAt?: Date | undefined;
    statedVia?: StaffStatementChannel | undefined;
    /** When the order was made: nobody asks to return what did not exist yet. */
    orderCreatedAt: Date;
    now: Date;
}

/** The statement a return is written with. */
export interface Statement {
    requestedAt: Date;
    /** Set on a withdrawal only. */
    statedVia?: ReturnStatementChannel;
}

/** The verdict {@link checkStatement} returns. */
export type StatementVerdict =
    | ({ ok: true } & Statement)
    | {
          ok: false;
          field: 'requestedAt' | 'statedVia';
          reason: 'forbidden' | 'required' | 'future' | 'before-order';
      };

/**
 * Whether a date a staff member gave can stand: not in the future, not before the order was made.
 * No other limit on backdating — the audit row names the staff member who did it.
 * @param at - the date staff gave
 * @param input - the order's creation and the present moment
 */
const rangeRefusal = (
    at: Date,
    { orderCreatedAt, now }: Pick<StatementInput, 'orderCreatedAt' | 'now'>
): 'future' | 'before-order' | undefined => {
    if (at.getTime() > now.getTime()) return 'future';
    return at.getTime() < orderCreatedAt.getTime() ? 'before-order' : undefined;
};

/**
 * The statement of a staff member's request. A withdrawal needs both fields; any other reason takes
 * no channel, and a remainder cancel takes no date either (there is no asking to date).
 * @param input - the request and the order
 */
const staffStatement = (input: StatementInput): StatementVerdict => {
    const { reason, kind, requestedAt, statedVia, now } = input;
    const withdrawal = reason === 'withdrawal';

    if (requestedAt === undefined && withdrawal)
        return { ok: false, field: 'requestedAt', reason: 'required' };
    if (requestedAt !== undefined && kind === 'cancellation' && !withdrawal)
        return { ok: false, field: 'requestedAt', reason: 'forbidden' };
    const refusal = requestedAt === undefined ? undefined : rangeRefusal(requestedAt, input);
    if (requestedAt !== undefined && refusal)
        return { ok: false, field: 'requestedAt', reason: refusal };

    if (withdrawal && statedVia === undefined)
        return { ok: false, field: 'statedVia', reason: 'required' };
    if (!withdrawal && statedVia !== undefined)
        return { ok: false, field: 'statedVia', reason: 'forbidden' };

    return { ok: true, requestedAt: requestedAt ?? now, ...(statedVia ? { statedVia } : {}) };
};

/**
 * Decide the statement a return is written with. The buyer sends neither field: the server stamps
 * now, and `online` on a withdrawal. Staff send what the buyer told them.
 *
 * @param input - who is asking, what they sent, and the order's age
 * @returns the statement to store, or which field cannot stand and why
 */
export const checkStatement = (input: StatementInput): StatementVerdict => {
    if (!input.byBuyer) return staffStatement(input);

    if (input.requestedAt !== undefined)
        return { ok: false, field: 'requestedAt', reason: 'forbidden' };
    if (input.statedVia !== undefined)
        return { ok: false, field: 'statedVia', reason: 'forbidden' };

    return {
        ok: true,
        requestedAt: input.now,
        ...(input.reason === 'withdrawal' ? { statedVia: 'online' as const } : {})
    };
};
