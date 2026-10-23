/**
 * `auditChanges` — what an `*.updated` audit row records about the fields an update moved.
 */
import { auditChanges } from '@infrastructure/observability/audit-changes';

const FIELDS = { valued: ['count', 'labels'], named: ['note'] } as const;

describe('auditChanges', () => {
    it('records a valued field that moved as { from, to }', () => {
        const before = { count: 1, labels: ['a'], note: 'x' };

        expect(auditChanges(before, { count: 2 }, FIELDS)).toEqual({
            changes: { count: { from: 1, to: 2 } }
        });
    });

    it('records a named field by name only, never its value', () => {
        const before = { count: 1, labels: ['a'], note: 'secret text' };

        const result = auditChanges(before, { note: 'other text' }, FIELDS);

        expect(result).toEqual({ changedFields: ['note'] });
        expect(JSON.stringify(result)).not.toContain('text');
    });

    it('says nothing for a field left out or sent unchanged', () => {
        const before = { count: 1, labels: ['a'], note: 'x' };

        expect(auditChanges(before, {}, FIELDS)).toEqual({});
        expect(auditChanges(before, { count: 1, labels: ['a'], note: 'x' }, FIELDS)).toEqual({});
    });

    it('reads a list as changed when its order changes', () => {
        const before = { count: 1, labels: ['a', 'b'], note: 'x' };

        expect(auditChanges(before, { labels: ['b', 'a'] }, FIELDS)).toEqual({
            changes: { labels: { from: ['a', 'b'], to: ['b', 'a'] } }
        });
    });

    it('treats an unset field and null alike, and records a clear as to: null', () => {
        const unset = { count: 1, labels: ['a'], note: undefined };
        const set = { count: 1, labels: ['a'], note: 'x' };

        expect(auditChanges(unset, { note: null }, FIELDS)).toEqual({});
        expect(auditChanges(set, { note: null }, FIELDS)).toEqual({ changedFields: ['note'] });
    });

    it('records an unset valued field as from: null', () => {
        const before = { count: undefined, labels: ['a'], note: 'x' };

        expect(auditChanges(before, { count: 3 }, FIELDS)).toEqual({
            changes: { count: { from: null, to: 3 } }
        });
    });
});
