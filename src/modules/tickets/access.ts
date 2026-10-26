/**
 * @module
 * Who may see and work which ticket. A visitor's message is the inbox's: anyone who gets past the
 * route's `Ticket` rule works it. A system ticket belongs to a jurisdiction: only a caller holding
 * the ticket's route set (an administrator holds them all) sees or works it. The route guards ask
 * the rules; this file narrows WHICH rows, so a route and a query cannot disagree.
 */

import type { Caller } from '@types';
import { holds, holdsSet } from '@kernel/ability';
import { PERMISSION_SETS, permissionsOfRole, isUnrestrictedRole } from '@kernel/permissions';
import { ROUTED_SETS } from './domain';
import { TicketSource } from '@types';

/** The two facts of a ticket that decide who may touch it. */
export interface Jurisdiction {
    source: TicketSource;
    routeSet: string;
}

/**
 * Every route set the caller holds.
 *
 * @param caller - the caller, in tenant scope
 */
export const heldRouteSets = (caller: Caller): string[] =>
    ROUTED_SETS.filter((setName) => holdsSet(caller, setName));

/**
 * The Mongo scope that limits a read to the caller's jurisdiction: every visitor ticket, plus the
 * system tickets of a held set. Empty for an unrestricted caller.
 *
 * @param caller - the caller, in tenant scope
 */
export const jurisdictionScope = (caller: Caller): Record<string, unknown> =>
    caller.unrestricted
        ? {}
        : {
              $or: [
                  { source: TicketSource.visitor },
                  { source: TicketSource.system, routeSet: { $in: heldRouteSets(caller) } }
              ]
          };

/**
 * Whether the caller falls inside a ticket's jurisdiction.
 *
 * @param caller - the caller, in tenant scope
 * @param ticket - its source and route set
 */
export const inJurisdiction = (caller: Caller, ticket: Jurisdiction): boolean =>
    ticket.source === TicketSource.visitor || holdsSet(caller, ticket.routeSet);

/**
 * Whether the caller may act on the ticket (resolve, assign, note…): `update:Ticket`, inside the
 * jurisdiction.
 *
 * @param caller - the caller, in tenant scope
 * @param ticket - its source and route set
 */
export const mayWork = (caller: Caller, ticket: Jurisdiction): boolean =>
    holds(caller, 'update', 'Ticket') && inJurisdiction(caller, ticket);

/**
 * Whether the caller may delete the ticket: `delete:Ticket`, inside the jurisdiction.
 *
 * @param caller - the caller, in tenant scope
 * @param ticket - its source and route set
 */
export const mayDelete = (caller: Caller, ticket: Jurisdiction): boolean =>
    holds(caller, 'delete', 'Ticket') && inJurisdiction(caller, ticket);

/**
 * Whether a person holding the tenant role `roleName` holds the route set — the question asked of
 * an assignee, who is not the caller. A role is data, so this reads the rules it expands to.
 *
 * @param roleName - the person's tenant role, or `null` when they hold none
 * @param routeSet - the ticket's route set
 */
export const roleHoldsRouteSet = (roleName: string | null, routeSet: string): boolean => {
    if (!roleName) return false;
    if (isUnrestrictedRole(roleName)) return true;

    const held = new Set(permissionsOfRole(roleName));
    const set = PERMISSION_SETS.find((candidate) => candidate.name === routeSet);
    return set?.rules.every((id) => held.has(id)) ?? false;
};
