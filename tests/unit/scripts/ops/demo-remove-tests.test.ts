import { mkdirSync, mkdtempSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { removeResidueTests } from '../../../../scripts/ops/demo-remove-tests';

/** The alias of the removed module, spelled once so no fixture below reads as a real import. */
const REMOVED = '@modules/cart';

/** A throwaway repo root with `src/modules/<foundation>` and a `tests/` tree. */
let root: string;

/** Write a file under the throwaway root, creating its folder. */
const write = (relative: string, content: string): void => {
    const full = path.join(root, relative);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
};

beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'demo-remove-tests-'));
    mkdirSync(path.join(root, 'src', 'modules', 'users', 'tests'), { recursive: true });
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe('removeResidueTests', () => {
    it('deletes a test that imports a removed module, by alias or by relative path', () => {
        write('tests/a.test.ts', "import { x } from '@modules/cart';\n");
        write('tests/b.test.ts', "import '@modules/cart/module';\n");
        write('tests/c.test.ts', "import { y } from '../src/modules/cart/model';\n");

        const notes = removeResidueTests(root, ['cart']);

        expect(notes.map((note) => note.file).toSorted()).toEqual([
            path.join('tests', 'a.test.ts'),
            path.join('tests', 'b.test.ts'),
            path.join('tests', 'c.test.ts')
        ]);
        expect(existsSync(path.join(root, 'tests', 'a.test.ts'))).toBe(false);
    });

    it('sees jest.mock and dynamic import specifiers too', () => {
        write('tests/m.test.ts', `jest.mock('${REMOVED}/routes');\n`);
        write('tests/d.test.ts', `const m = await import('${REMOVED}/audit');\n`);

        expect(removeResidueTests(root, ['cart'])).toHaveLength(2);
    });

    it('keeps a test that only quotes an import inside a string, like a lint fixture', () => {
        write('tests/lint.test.ts', `const source = "import { x } from '${REMOVED}';";\n`);

        expect(removeResidueTests(root, ['cart'])).toEqual([]);
    });

    it('keeps a test that only names a removed module in a string or a sibling module', () => {
        write(
            'tests/keep.test.ts',
            "import { u } from '@modules/users';\nconst s = '@modules/cartoon/x';\n"
        );
        write('src/modules/users/tests/own.test.ts', "import { u } from '../service';\n");

        expect(removeResidueTests(root, ['cart'])).toEqual([]);
    });

    it('follows the deletion into a test file that imported a deleted support file', () => {
        write('tests/support/checkout.ts', "import '@modules/cart/module';\n");
        write('tests/uses-support.test.ts', "import { c } from '@tests/checkout';\n");
        write('tests/relative.test.ts', "import { c } from './support/checkout';\n");
        write('tests/unrelated.test.ts', "import { z } from '@tests/other';\n");

        const files = removeResidueTests(root, ['cart']).map((note) => note.file);

        expect(files).toHaveLength(3);
        expect(existsSync(path.join(root, 'tests', 'unrelated.test.ts'))).toBe(true);
    });

    it('deletes a test that declares it requires a removed module without importing it', () => {
        write('tests/kernel.test.ts', '// requires-module: cart, orders\nit("x", () => {});\n');
        write('tests/other.test.ts', '// requires-module: users\nit("x", () => {});\n');

        const files = removeResidueTests(root, ['cart']).map((note) => note.file);

        expect(files).toEqual([path.join('tests', 'kernel.test.ts')]);
    });

    it('also sweeps the tests folder of a surviving module', () => {
        write(
            'src/modules/users/tests/x.test.ts',
            "import { p } from '@modules/cart/tests/factories';\n"
        );

        expect(removeResidueTests(root, ['cart'])).toHaveLength(1);
    });
});
