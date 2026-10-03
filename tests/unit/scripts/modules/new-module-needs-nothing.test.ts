/**
 * The genericity claim, asserted: a module folder plus its line in `src/modules.ts` is everything
 * a new module needs. A throwaway `widgets` module is written into a scratch tree, and every
 * table a new module would otherwise need a hand edit in is asked whether it includes it.
 *
 * Only the pieces that read a module tree are driven here; the ones that read the registry are
 * driven with a virtual registry. The real repo's own guard tests are what fail for a real module.
 */

import { Router } from 'express';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { modulesDeclaringProbes } from '../../../../scripts/contracts/client-collections-bundle';
import { assembleRoot, readModuleFragments } from '../../../../scripts/contracts/root-assembly';
import {
    moduleSidebar,
    readCatalogue,
    renderModuleList
} from '../../../../scripts/docs/module-catalogue';
import {
    frontendCounterparts,
    readAllModuleDescriptors
} from '../../../../scripts/docs/module-descriptor';
import { REPO_ROOT } from '../../../../scripts/contracts/bundle-kinds';
import { routedModulesOf } from '@tests/routes';

/** The scratch repo root every case reads. */
let scratch = '';

/** `src/modules` of the scratch tree. */
const modulesRoot = (): string => path.join(scratch, 'src', 'modules');

/** Writes one file into the scratch tree, creating its folder. */
const write = (relative: string, content: string): void => {
    const file = path.join(scratch, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
};

beforeAll(() => {
    scratch = mkdtempSync(path.join(tmpdir(), 'new-module-'));

    // One existing module, so "appended after" means something, and the throwaway one. Nothing
    // else is written: no registry, no root edit, no test table.
    write(
        'src/modules/feedback/module.yaml',
        'summary: Contact requests.\nsubdomain: generic\ngroup: foundation\ndependsOn: []\n'
    );
    write(
        'src/modules/feedback/openapi.yaml',
        'paths:\n    /feedback:\n        get:\n            tags: [Feedback]\n'
    );
    write(
        'src/modules/widgets/module.yaml',
        'summary: Widgets, for the test.\nsubdomain: supporting\ngroup: shop\ndependsOn: []\n'
    );
    write(
        'src/modules/widgets/openapi.yaml',
        'paths:\n    /widgets:\n        get:\n            tags: [Widgets]\n    /widgets/{id}:\n        get:\n            tags: [Widgets]\n'
    );
    write('src/modules/widgets/probes.ts', 'export const probes = [];\n');
    write('docs/modules/widgets.md', '# widgets\n');
    write('docs/modules/widgets-deep.md', '# Going deeper\n');
});

afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
});

describe('a module folder alone is enough', () => {
    it('reads its descriptor, with the frontend counterpart defaulting to its own name', () => {
        const descriptors = readAllModuleDescriptors(modulesRoot());

        expect(Object.keys(descriptors)).toEqual(['feedback', 'widgets']);
        expect(frontendCounterparts('widgets', descriptors.widgets)).toEqual(['widgets']);
        expect(descriptors.widgets.noAudit).toBeUndefined();
    });

    it('reaches the root contract, paths and tag, with the root file untouched', () => {
        const root = readFileSync(
            path.join(REPO_ROOT, 'shared', 'contracts', 'openapi.root.yaml'),
            'utf8'
        );
        const completed = parseYaml(assembleRoot(root, readModuleFragments(modulesRoot(), []))) as {
            tags: { name: string }[];
            paths: Record<string, unknown>;
        };

        expect(Object.keys(completed.paths)).toEqual(
            expect.arrayContaining(['/widgets', '/widgets/{id}'])
        );
        expect(completed.tags.map(({ name }) => name)).toContain('Widgets');
        expect(existsSync(path.join(modulesRoot(), '..', '..', 'shared'))).toBe(false);
    });

    it('is found by the client collections through its probes.ts', () => {
        expect(modulesDeclaringProbes(modulesRoot())).toEqual(['widgets']);
    });

    it('is listed in the docs index and the sidebar under its group, with its deeper page', () => {
        const catalogue = readCatalogue(modulesRoot(), path.join(scratch, 'docs', 'modules'));

        expect(renderModuleList(catalogue)).toContain(
            '- [`widgets`](./widgets.md) — Widgets, for the test. Deeper: [Going deeper](./widgets-deep.md).'
        );
        expect(moduleSidebar(catalogue).map(({ text }) => text)).toEqual([
            'Overview',
            'Foundation',
            'Demo shop'
        ]);
    });

    it('is in the router-guard set as soon as it is in the registry', () => {
        const router = Router();

        expect(
            Object.keys(
                routedModulesOf([{ name: 'widgets', routes: router }, { name: 'headless' }])
            )
        ).toEqual(['widgets']);
    });
});
