import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    readDemoModuleNames,
    resolveStripModules
} from '../../../../scripts/testing/demo-module-names';

/** A throwaway checkout holding `src/modules/<name>/module.yaml` files. */
let root: string;

/**
 * Write one module's descriptor.
 *
 * @param name - the module folder
 * @param group - the descriptor's `group`
 * @param dependsOn - the modules it names in `dependsOn`
 */
const moduleOf = (name: string, group: string, dependsOn: string[] = []): void => {
    const directory = path.join(root, 'src', 'modules', name);
    mkdirSync(directory, { recursive: true });
    writeFileSync(
        path.join(directory, 'module.yaml'),
        `summary: 'A module.'\nsubdomain: generic\ngroup: ${group}\ndependsOn: [${dependsOn.join(', ')}]\n`
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

describe('resolveStripModules', () => {
    beforeEach(() => {
        moduleOf('users', 'foundation');
        moduleOf('orders', 'shop', ['cart']);
        moduleOf('example', 'example');
        moduleOf('cart', 'shop');
    });

    it('takes every demo module when the flag is absent', () => {
        expect(resolveStripModules(root, []).toSorted()).toEqual(['cart', 'example', 'orders']);
    });

    it('takes exactly the named modules, so `example` stays unless it is listed', () => {
        expect(resolveStripModules(root, ['--modules', 'orders, cart,orders'])).toEqual([
            'orders',
            'cart'
        ]);
        expect(resolveStripModules(root, ['--modules=orders,example'])).toEqual([
            'orders',
            'example'
        ]);
    });

    it('can name a foundation module, which the default never takes', () => {
        expect(resolveStripModules(root, ['--modules=users'])).toEqual(['users']);
    });

    it.each([
        ['a bare flag', ['--modules'], /names no module/u],
        ['an empty list', ['--modules='], /names no module/u],
        ['a folder that is not a module', ['--modules=orders,nope'], /no such module: nope/u],
        [
            'a list that keeps a module needing a stripped one',
            ['--modules=cart'],
            /orders depends on cart/u
        ]
    ])('refuses %s', (_case, argv, message) => {
        expect(() => resolveStripModules(root, argv)).toThrow(message);
    });
});
