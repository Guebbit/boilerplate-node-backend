/**
 * @module
 * `applyScaffold` against a scratch root: what lands on disk, that it is formatted, and that a
 * refusal writes nothing. The real repo's own checks over a generated module are
 * `npm run measure:scaffold`, too slow for a unit suite.
 */

import {
    cpSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyScaffold, refusalsFor } from '../../../../scripts/scaffold/apply';
import type { FormatText } from '../../../../scripts/scaffold/format-text';
import { planModule } from '../../../../scripts/scaffold/plan';
import type { ScaffoldOptions } from '../../../../scripts/scaffold/options';
import { REPO_ROOT } from '@tests/paths';

/** The repo files the central edits and the formatter read. */
const COPIED = [
    '.prettierrc',
    '.prettierignore',
    'src/modules.ts',
    'shared/authorization-roles.yaml',
    'shared/authorization-conformance.yaml',
    'tests/cross-cutting/replace-patch-parity.test.ts'
];

/** A plain scaffold. */
const OPTIONS: ScaffoldOptions = {
    name: 'scaffold-probe',
    group: 'foundation',
    summary: 'A note.',
    audit: true,
    regenerate: false
};

/** No formatting: Prettier cannot load under Jest, and `measure:scaffold` covers the real one. */
const identity: FormatText = (_root, _file, content) => Promise.resolve(content);

/** The scratch root of the current test. */
let root = '';

beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'scaffold-test-'));
    for (const file of COPIED) {
        mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        cpSync(path.join(REPO_ROOT, file), path.join(root, file));
    }
    // One existing contract fragment, so `Taken` is a schema name a scaffold may not reuse.
    mkdirSync(path.join(root, 'src/modules/other'), { recursive: true });
    writeFileSync(
        path.join(root, 'src/modules/other/openapi.yaml'),
        'components:\n    schemas:\n        Taken: { type: object }\n'
    );
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe('applyScaffold', () => {
    it('writes every planned file and registers the module', async () => {
        const plan = await applyScaffold(root, OPTIONS, identity);

        for (const file of plan.files) expect(existsSync(path.join(root, file.path))).toBe(true);
        expect(readFileSync(path.join(root, 'src/modules.ts'), 'utf8')).toContain(
            "import scaffoldProbe from './modules/scaffold-probe/module';"
        );
        expect(readFileSync(path.join(root, 'shared/authorization-roles.yaml'), 'utf8')).toContain(
            '- scaffoldprobe.any.delete'
        );
    });

    it('refuses a second scaffold of the same name, listing why, and writes nothing more', async () => {
        await applyScaffold(root, OPTIONS, identity);
        const registry = readFileSync(path.join(root, 'src/modules.ts'), 'utf8');

        await expect(applyScaffold(root, OPTIONS, identity)).rejects.toThrow(
            /already exists[\s\S]*already registered/
        );
        expect(readFileSync(path.join(root, 'src/modules.ts'), 'utf8')).toBe(registry);
    });

    it('refuses before writing anything when a central file has changed shape', async () => {
        writeFileSync(path.join(root, 'shared/authorization-roles.yaml'), 'roles: []\n');

        await expect(applyScaffold(root, OPTIONS, identity)).rejects.toThrow(/anchor/);
        expect(existsSync(path.join(root, 'src/modules/scaffold-probe'))).toBe(false);
    });
});

describe('refusalsFor', () => {
    it('points at --entity when a schema name is taken', () => {
        const plan = planModule({ ...OPTIONS, name: 'takens' });

        expect(refusalsFor(root, plan).join('\n')).toMatch(/Taken[\s\S]*--entity/);
    });

    it('has nothing to say about a fresh name', () => {
        expect(refusalsFor(root, planModule(OPTIONS))).toEqual([]);
    });
});
