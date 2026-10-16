/**
 * The permission-action vocabulary has ONE home: `actions:` in `shared/authorization-keys.yaml`.
 *
 * `api/permission-actions.ts` is generated from it, and `kernel/permissions.ts` (and through it
 * the Zod schema that validates every key) imports the result. This holds the two ends of that
 * chain: the generated array is the yaml's, and every declared rule's action is in it.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { PERMISSION_ACTIONS } from '@api/permission-actions';
import { PERMISSION_RULES } from '@kernel/permissions';
import { REPO_ROOT } from '@tests/paths';

const yamlActions = (
    parse(readFileSync(path.join(REPO_ROOT, 'shared', 'authorization-keys.yaml'), 'utf8')) as {
        actions: string[];
    }
).actions;

describe('permission actions', () => {
    it('are exactly what the shared yaml declares', () => {
        expect([...PERMISSION_ACTIONS]).toEqual(yamlActions);
    });

    it('cover every action a declared rule carries', () => {
        for (const rule of PERMISSION_RULES) expect(yamlActions).toContain(rule.action);
    });
});
