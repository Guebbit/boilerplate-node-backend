import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readDemoModuleNames } from '../../../../scripts/testing/demo-module-names';

/** A throwaway checkout holding `src/modules/<name>/module.yaml` files. */
let root: string;

/**
 * Write one module's descriptor.
 *
 * @param name - the module folder
 * @param group - the descriptor's `group`
 */
const moduleOf = (name: string, group: string): void => {
    const directory = path.join(root, 'src', 'modules', name);
    mkdirSync(directory, { recursive: true });
    writeFileSync(
        path.join(directory, 'module.yaml'),
        `summary: 'A module.'\nsubdomain: generic\ngroup: ${group}\ndependsOn: []\n`
    );
};

beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'demo-module-names-'));
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe('readDemoModuleNames', () => {
    it('names the shop modules and the example module, and never a foundation one', () => {
        moduleOf('users', 'foundation');
        moduleOf('orders', 'shop');
        moduleOf('example', 'example');
        moduleOf('cart', 'shop');

        expect(readDemoModuleNames(root).toSorted()).toEqual(['cart', 'example', 'orders']);
    });
});
