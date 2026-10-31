/**
 * The session answers carry every permission rule's conditions, and the never-null response check
 * exempts exactly one null there: `deletedAt: null`. A rule that put any other null, or an
 * `$exists`-style operator, into its conditions would reach the wire, so it fails here first.
 */
import { PERMISSION_RULES } from '@kernel/permissions';

/** Every key of a condition object, nested ones included, with the value found there. */
const entriesDeep = (value: unknown, path = ''): [string, unknown][] => {
    if (typeof value !== 'object' || value === null) return [];
    return Object.entries(value).flatMap(([key, child]): [string, unknown][] => [
        [`${path}${key}`, child],
        ...entriesDeep(child, `${path}${key}.`)
    ]);
};

describe('permission rule conditions', () => {
    const conditions = PERMISSION_RULES.flatMap((rule) =>
        entriesDeep(rule.conditions).map(([path, value]) => ({ id: rule.id, path, value }))
    );

    it('has conditions to judge (canary: the declared rules do carry some)', () => {
        expect(conditions.length).toBeGreaterThan(0);
    });

    it('holds a null only as the top-level deletedAt', () => {
        const stray = conditions.filter(
            ({ path, value }) => value === null && path !== 'deletedAt'
        );
        expect(stray).toEqual([]);
    });

    it('uses no $exists-style operator', () => {
        const stray = conditions.filter(({ path }) => /(^|\.)\$exists$/.test(path));
        expect(stray).toEqual([]);
    });
});
