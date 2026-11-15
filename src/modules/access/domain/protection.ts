/**
 * @module
 * The pure rules of protecting people: may a caller change an account, and is a thing the
 * caller's own. No I/O; the lookups that feed them live in `services/protection.ts`.
 *
 * @see docs/understand/authorization.md#protecting-people
 */

import type { CallerContext } from '@types';

/**
 * The protection rule itself, as a pure question: may a caller change this account? Yes when the
 * account holds no staff role, or the caller holds `assign:Role`. The caller's own account is not
 * a case: a key shares its minter's id, so "own" would let a key act on its minter. The one
 * place the rule is written: `services/protection.ts`'s `canChangeAccount` asks it after a lookup, and `users` asks it
 * of a whole page of rows after one batched lookup.
 *
 * @param caller - who is asking: whether they hold `assign:Role`
 * @param account - the account in question: its id and whether it holds a staff role
 */
export const mayChangeAccount = (
    caller: { holdsAssignRole: boolean },
    account: { holdsStaffRole: boolean }
): boolean => !account.holdsStaffRole || caller.holdsAssignRole;

/**
 * Does `ownerId` name the caller themselves? The question behind a money step's `ownOrder` audit
 * flag — no context, the system actor and a thing nobody owns are never the caller's own.
 *
 * @param context - the caller, or `undefined` for a path with no request behind it
 * @param ownerId - who the order, payment or return belongs to
 */
export const isOwnThing = (
    context: CallerContext | undefined,
    ownerId: string | null | undefined
): boolean =>
    context !== undefined &&
    !context.caller.system &&
    Boolean(ownerId) &&
    context.caller.id === ownerId;

/**
 * The audit metadata a money step carries when the caller is the order's own buyer: the step is
 * allowed (a customer who is staff is trusted with their own order), and the record says so, so a
 * review sees self-dealing at a glance.
 *
 * @param context - the caller, or `undefined` for a path with no request behind it
 * @param ownerId - who the order belongs to
 * @returns `{ ownOrder: true }` for the buyer's own order, otherwise nothing
 */
export const ownOrderFlag = (
    context: CallerContext | undefined,
    ownerId: string | null | undefined
): { ownOrder?: true } => (isOwnThing(context, ownerId) ? { ownOrder: true } : {});
