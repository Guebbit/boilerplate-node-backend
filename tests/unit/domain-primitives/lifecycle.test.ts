import { defineLifecycle } from '@domain-primitives/lifecycle';

/** A small made-up status set, so the primitive is tested apart from any module. */
const STATUSES = ['draft', 'live', 'gone'] as const;
type Status = (typeof STATUSES)[number];

const table = {
    initial: 'draft',
    events: {
        publish: { from: ['draft'], to: 'live', actors: ['staff'] },
        retire: { from: ['draft', 'live'], to: 'gone', actors: ['staff', 'system'] },
        revive: { from: ['gone'], to: 'draft' }
    }
} as const;

const lifecycle = defineLifecycle<Status, keyof typeof table.events, 'staff' | 'system'>(
    STATUSES,
    table
);

/** A thunk that builds a lifecycle from loose strings, for the tables that must be refused. */
const build =
    (events: Record<string, { from: string[]; to: string }>, initial = 'draft') =>
    () =>
        defineLifecycle<string, string>(STATUSES, { initial, events });

describe('defineLifecycle', () => {
    it('answers the table it was given', () => {
        expect(lifecycle.initial).toBe('draft');
        expect(lifecycle.fromOf('retire')).toEqual(['draft', 'live']);
        expect(lifecycle.toOf('publish')).toBe('live');
        expect(lifecycle.allows('publish', 'draft')).toBe(true);
        expect(lifecycle.allows('publish', 'live')).toBe(false);
    });

    it('lists the events and the statuses reachable from a status, in table order', () => {
        expect(lifecycle.eventsFrom('draft')).toEqual(['publish', 'retire']);
        expect(lifecycle.reachableFrom('draft')).toEqual(['live', 'gone']);
        expect(lifecycle.reachableFrom('gone')).toEqual(['draft']);
    });

    it('narrows by actor when the event names its actors, and lets anyone take one that does not', () => {
        expect(lifecycle.allows('retire', 'live', 'system')).toBe(true);
        expect(lifecycle.allows('publish', 'draft', 'system')).toBe(false);
        expect(lifecycle.allows('revive', 'gone', 'system')).toBe(true);
        expect(lifecycle.eventsFrom('draft', 'system')).toEqual(['retire']);
    });

    it('never counts staying where it is as a move', () => {
        for (const status of STATUSES) expect(lifecycle.canTransition(status, status)).toBe(false);
        expect(lifecycle.canTransition('draft', 'live')).toBe(true);
        expect(lifecycle.canTransition('live', 'draft')).toBe(false);
    });

    it('refuses a table whose statuses are not real, or whose event lands inside its own from', () => {
        expect(build({ a: { from: ['draft'], to: 'nowhere' } })).toThrow('unknown "nowhere"');
        expect(build({ a: { from: ['ghost'], to: 'live' } })).toThrow('unknown "ghost"');
        expect(build({}, 'ghost')).toThrow('unknown initial "ghost"');
        expect(build({ a: { from: [], to: 'live' } })).toThrow('has no from');
        expect(build({ a: { from: ['draft', 'live'], to: 'live' } })).toThrow(
            'lands inside its own from'
        );
    });
});
