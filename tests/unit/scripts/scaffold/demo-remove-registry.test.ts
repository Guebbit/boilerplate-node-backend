/**
 * @module
 * The strip's edit of `src/modules.ts`: every line that registers a removed module goes, and no
 * other. A hyphenated module is the case that matters, because the file spells it twice, as
 * `'stock-alerts'` in the union and as `stockAlerts` in the import and the array.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { stripModuleRegistry } from '../../../../scripts/scaffold/demo-remove-registry';

/** A `src/modules.ts` in the shape the scaffolder writes, with one plain and one hyphenated module. */
const SAMPLE = [
    "import orders from './modules/orders/module';",
    "import stockAlerts from './modules/stock-alerts/module';",
    "import users from './modules/users/module';",
    '',
    'export const enabledModules = [',
    '    orders,',
    '    stockAlerts,',
    '    users',
    '];',
    '',
    'export type ModuleName =',
    "    | 'orders'",
    "    | 'stock-alerts'",
    "    | 'users';",
    ''
].join('\n');

/** The temporary checkout each case writes into. */
let root: string;

beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'demo-remove-registry-'));
    mkdirSync(path.join(root, 'src'));
    writeFileSync(path.join(root, 'src', 'modules.ts'), SAMPLE);
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe('stripModuleRegistry', () => {
    it('removes the import, the array entry and the union member of a hyphenated module', () => {
        stripModuleRegistry(root, ['stock-alerts']);

        const after = readFileSync(path.join(root, 'src', 'modules.ts'), 'utf8');
        expect(after).not.toMatch(/stockAlerts|stock-alerts/);
        expect(after).toContain('    orders,');
        expect(after).toContain("    | 'users';");
    });

    it('still removes a module whose folder name and identifier are the same word', () => {
        stripModuleRegistry(root, ['orders']);

        const after = readFileSync(path.join(root, 'src', 'modules.ts'), 'utf8');
        expect(after).not.toMatch(/orders/);
        expect(after).toContain('    stockAlerts,');
    });
});
