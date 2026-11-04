/**
 * @module
 * What each situation `tasks` itself owns opens — `src/modules/tasks/domain/system.ts`. Pure: no
 * mocks, no database. The shop's openers are tested beside the module that owns them.
 */

import { PERMISSION_SETS } from '@kernel/permissions';
import { TaskKind, TaskLinkType } from '@types';
import {
    accountReviewOpening,
    clear,
    exportFailedOpening,
    openKeyOf,
    type SystemOpening
} from '../../domain';

const NOW = new Date('2030-05-01T10:00:00Z');

describe('the openings', () => {
    const all: [string, SystemOpening][] = [
        ['account review', accountReviewOpening('u1', NOW)],
        ['export failed', exportFailedOpening({ userId: 'u1', exportId: 'e1' }, NOW)]
    ];

    it.each(all)('%s names its kind, its record and a declared route set', (_name, opening) => {
        expect(Object.values(TaskKind)).toContain(opening.kind);
        expect(PERMISSION_SETS.map((set) => set.name)).toContain(opening.routeSet);
        expect(openKeyOf(opening.kind, opening.link)).toBe(
            `${opening.kind}:${opening.link.type}:${opening.link.id}`
        );
    });

    it('routes an account review to the set that bans, and a failed export to the one that erases', () => {
        expect(accountReviewOpening('u1', NOW)).toMatchObject({
            routeSet: 'UserBanning',
            link: { type: TaskLinkType.user, id: 'u1' }
        });
        expect(exportFailedOpening({ userId: 'u1', exportId: 'e1' }, NOW)).toMatchObject({
            routeSet: 'UserErasure',
            link: { type: TaskLinkType.export, id: 'e1' }
        });
    });

    it('ties both openings to their person, so export and erasure follow it', () => {
        expect(accountReviewOpening('u1', NOW).subjectId).toBe('u1');
        expect(exportFailedOpening({ userId: 'u1', exportId: 'e1' }, NOW).subjectId).toBe('u1');
    });

    it('carries ids only, never an address or a name', () => {
        for (const [, opening] of all) expect(opening.message).not.toMatch(/@/);
    });
});

describe('clear — the system closes what the situation no longer owes', () => {
    it('resolves as cleared, stamps closedAt and drops the dedup key', () => {
        expect(clear(NOW)).toEqual({
            set: { status: 'resolved', resolution: 'cleared', closedAt: NOW },
            unset: ['openKey']
        });
    });
});
