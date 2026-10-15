/**
 * @module
 * Row scoping for the payments collection — the one rule every other file here reads through.
 */

import { accessibleFilter } from '@kernel/access/query';
import { callerForSubject } from '@kernel/permissions';
import { heldRules } from '@kernel/ability';
import { orderService } from '@modules/orders';
import type { AuthContext } from '@types';
import { paymentRepository } from '../repository';

/**
 * Which payments a caller may read — the same rule `orderService.callerScope` applies, over this
 * module's collection. Unlike orders' pair (own AND still there), payments are never soft-deleted,
 * so "whose" is the only axis there is.
 */
export const callerScope = (context?: AuthContext) => accessibleFilter(context, 'Payment');

/**
 * Which payments a caller may CONFIRM or SYNC: their own, and nobody else's. These are the
 * customer's money steps, so the scope is the payer's — never {@link callerScope}, the READ scope,
 * which a role holding `display:Payment` would otherwise stretch across everyone's.
 *
 * @param context - the caller; with none, the anonymous read scope, which matches nothing
 */
export const payerScope = (context?: AuthContext): Record<string, unknown> =>
    context ? paymentRepository.ownerScope(context.id) : callerScope(undefined);

/**
 * Which orders a caller may open a payment intent on: their own live ones. The same reasoning as
 * {@link payerScope} — paying is the buyer's step, not whatever `display:Order` reaches.
 *
 * @param context - the caller; with none, the anonymous read scope, which matches nothing
 */
export const buyerOrderScope = (context?: AuthContext): Record<string, unknown> =>
    context ? orderService.ownLiveScope(context.id) : orderService.callerScope(undefined);

/**
 * Whether the caller reads every payment, and so may be sent the provider's own ids and a refund's
 * failure reason. By key name: `holds` would also say yes to `read:Payment`.
 *
 * @param context - the caller, or `undefined` for no request behind this read
 */
export const readsAllPayments = (context?: AuthContext): boolean =>
    context !== undefined && heldRules(callerForSubject(context, 'Payment')).has('display:Payment');
