/**
 * @module
 * Who may see and work which task. A visitor's message is the inbox's: anyone who gets past the
 * route's `Task` rule works it. A system task belongs to a jurisdiction: only a caller holding
 * the task's route set (an administrator holds them all) sees or works it. The route guards ask
 * the rules; this file narrows WHICH rows, so a route and a query cannot disagree.
 */

import type { Caller } from '@types';
import { holds, holdsSet } from '@kernel/ability';
import { PERMISSION_SETS, permissionsOfRole, isUnrestrictedRole } from '@kernel/permissions';
import { ROUTED_SETS } from './domain';
import { TaskSource } from '@types';

/** The two facts of a task that decide who may touch it. */
export interface Jurisdiction {
    source: TaskSource;
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
 * The Mongo scope that limits a read to the caller's jurisdiction: every visitor task, plus the
 * system tasks of a held set. Empty for an unrestricted caller.
 *
 * @param caller - the caller, in tenant scope
 */
export const jurisdictionScope = (caller: Caller): Record<string, unknown> =>
    caller.unrestricted
        ? {}
        : {
              $or: [
                  { source: TaskSource.visitor },
                  { source: TaskSource.system, routeSet: { $in: heldRouteSets(caller) } }
              ]
          };

/**
 * Whether the caller falls inside a task's jurisdiction.
 *
 * @param caller - the caller, in tenant scope
 * @param task - its source and route set
 */
export const inJurisdiction = (caller: Caller, task: Jurisdiction): boolean =>
    task.source === TaskSource.visitor || holdsSet(caller, task.routeSet);

/**
 * Whether the caller may act on the task (resolve, assign, note…): `update:Task`, inside the
 * jurisdiction.
 *
 * @param caller - the caller, in tenant scope
 * @param task - its source and route set
 */
export const mayWork = (caller: Caller, task: Jurisdiction): boolean =>
    holds(caller, 'update', 'Task') && inJurisdiction(caller, task);

/**
 * Whether the caller may delete the task: `delete:Task`, inside the jurisdiction.
 *
 * @param caller - the caller, in tenant scope
 * @param task - its source and route set
 */
export const mayDelete = (caller: Caller, task: Jurisdiction): boolean =>
    holds(caller, 'delete', 'Task') && inJurisdiction(caller, task);

/**
 * Whether a person holding the tenant role `roleName` holds the route set — the question asked of
 * an assignee, who is not the caller. A role is data, so this reads the rules it expands to.
 *
 * @param roleName - the person's tenant role, or `null` when they hold none
 * @param routeSet - the task's route set
 */
export const roleHoldsRouteSet = (roleName: string | null, routeSet: string): boolean => {
    if (!roleName) return false;
    if (isUnrestrictedRole(roleName)) return true;

    const held = new Set(permissionsOfRole(roleName));
    const set = PERMISSION_SETS.find((candidate) => candidate.name === routeSet);
    return set?.rules.every((id) => held.has(id)) ?? false;
};
