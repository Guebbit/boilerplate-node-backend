/**
 * @module
 * Jurisdiction: every kind routes to a permission set that exists, and an administrator holds
 * every set a task can be routed to (so no task is ever out of reach of the role that sees all).
 */

import { PERMISSION_SETS, permissionsOfRole } from '@kernel/permissions';
import { ROUTED_SETS, routeSetOf, TASK_KINDS } from '../../domain';

describe('routing', () => {
    it.each(TASK_KINDS)('routes %s to a declared permission set', (kind) => {
        expect(PERMISSION_SETS.map((set) => set.name)).toContain(routeSetOf(kind));
    });

    it('routes a contact message to the set that reads contact messages', () => {
        expect(routeSetOf('contact')).toBe('TaskDisplay');
    });

    it('gives an administrator every routed set, with no special case', () => {
        const held = new Set(permissionsOfRole('admin'));
        for (const name of ROUTED_SETS) {
            const set = PERMISSION_SETS.find((candidate) => candidate.name === name)!;
            expect(set.rules.every((rule) => held.has(rule))).toBe(true);
        }
    });
});
