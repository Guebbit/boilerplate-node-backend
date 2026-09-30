/**
 * The permission-action vocabulary has ONE home: `actions:` in `shared/authorization-keys.yaml`.
 *
 * `api/permission-actions.ts` is generated from it, and `kernel/permissions.ts` (and through it
 * the Zod schema that validates every key) imports the result. This holds the two ends of that
 * chain: nothing types the list a second time, and the generated array is the yaml's.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { PERMISSION_ACTIONS } from '@api/permission-actions';
import { PERMISSION_KEYS } from '@kernel/permissions';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

const yamlActions = (
    parse(readFileSync(path.join(REPO_ROOT, 'shared', 'authorization-keys.yaml'), 'utf8')) as {
        actions: string[];
    }
).actions;

describe('permission actions', () => {
    it('are exactly what the shared yaml declares', () => {
        expect([...PERMISSION_ACTIONS]).toEqual(yamlActions);
    });

    it('cover every action a declared key carries', () => {
        for (const key of PERMISSION_KEYS) expect(yamlActions).toContain(key.action);
    });

    it('are not typed a second time in the kernel', () => {
        const source = readFileSync(
            path.join(REPO_ROOT, 'src', 'kernel', 'permissions.ts'),
            'utf8'
        );
        expect(source).not.toMatch(/PERMISSION_ACTIONS\s*=/);
        for (const action of yamlActions.filter(
            (name) => !['read', 'create', 'update', 'delete'].includes(name)
        ))
            expect(source).not.toContain(`'${action}'`);
    });
});
