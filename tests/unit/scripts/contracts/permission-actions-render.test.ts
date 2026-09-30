import {
    readPermissionActions,
    renderPermissionActions
} from '../../../../scripts/contracts/permission-actions-render';

describe('readPermissionActions', () => {
    it('returns the declared actions in order', () => {
        expect(
            readPermissionActions('version: 1\nactions:\n  - read\n  - sweep\nkeys: []\n')
        ).toEqual(['read', 'sweep']);
    });

    it.each([
        ['is missing', 'version: 1\n'],
        ['is empty', 'actions: []\n'],
        ['holds a non-string', 'actions:\n  - read\n  - 3\n'],
        ['repeats an action', 'actions:\n  - read\n  - read\n']
    ])('refuses a document whose `actions` %s', (_case, text) => {
        expect(() => readPermissionActions(text)).toThrow(/actions/);
    });

    it('refuses an empty document', () => {
        expect(() => readPermissionActions('')).toThrow(/no `actions:`/);
    });
});

describe('renderPermissionActions', () => {
    const output = renderPermissionActions(['read', 'sweep']);

    it('emits the runtime array in declared order', () => {
        expect(output).toContain(
            'export const PERMISSION_ACTIONS = [\n    "read",\n    "sweep"\n] as const;'
        );
    });

    it('derives the union type from that array', () => {
        expect(output).toContain(
            'export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];'
        );
    });

    it('is deterministic', () => {
        expect(renderPermissionActions(['read', 'sweep'])).toBe(output);
    });
});
