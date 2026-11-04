/**
 * @module
 * Jurisdiction: a contact message is routed to the set that reads contact messages, a system task
 * to the set its opener named, and a task is visible to a caller iff they hold that set. An
 * administrator holds every set a task is routed to, so no task is ever out of reach of the role that sees all.
 */

import { callerAs } from '@tests/callers';
import { PERMISSION_SETS, permissionsOfRole } from '@kernel/permissions';
import { TaskSource } from '@types';
import { heldRouteSets, inJurisdiction } from '../../access';
import { CONTACT_ROUTE_SET, accountReviewOpening, exportFailedOpening } from '../../domain';

const NOW = new Date('2030-05-01T10:00:00Z');

describe('routing', () => {
    it('routes a contact message to the set that reads contact messages', () => {
        expect(CONTACT_ROUTE_SET).toBe('TaskDisplay');
    });

    it.each([
        ['an account review', accountReviewOpening('u1', NOW).routeSet],
        ['a failed export', exportFailedOpening({ userId: 'u1', exportId: 'e1' }, NOW).routeSet],
        ['a contact message', CONTACT_ROUTE_SET]
    ])('routes %s to a declared permission set', (_name, routeSet) => {
        expect(PERMISSION_SETS.map((set) => set.name)).toContain(routeSet);
    });

    it.each([
        ['an account review', accountReviewOpening('u1', NOW).routeSet],
        ['a failed export', exportFailedOpening({ userId: 'u1', exportId: 'e1' }, NOW).routeSet],
        ['a contact message', CONTACT_ROUTE_SET]
    ])(
        'gives an administrator the set %s is routed to, with no special case',
        (_name, routeSet) => {
            const set = PERMISSION_SETS.find((candidate) => candidate.name === routeSet);
            const held = new Set(permissionsOfRole('admin'));

            expect(set?.rules.every((rule) => held.has(rule))).toBe(true);
        }
    );
});

describe('the jurisdiction of a system task', () => {
    const review = { source: TaskSource.system, routeSet: 'UserBanning' };

    it('shows the task to a caller who holds its set, and hides it from one who does not', () => {
        expect(heldRouteSets(callerAs('moderator'))).toContain('UserBanning');
        expect(inJurisdiction(callerAs('moderator'), review)).toBe(true);
        expect(inJurisdiction(callerAs('support'), review)).toBe(false);
    });

    it('shows it to an administrator, who holds every set', () => {
        expect(inJurisdiction(callerAs('admin'), review)).toBe(true);
    });

    it('shows a visitor task to anyone, whatever sets they hold', () => {
        expect(
            inJurisdiction(callerAs('support'), {
                source: TaskSource.visitor,
                routeSet: 'TaskDisplay'
            })
        ).toBe(true);
    });
});
