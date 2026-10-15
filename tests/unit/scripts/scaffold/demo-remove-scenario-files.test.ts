import { mkdirSync, mkdtempSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { removeScenarioModuleFiles } from '../../../../scripts/scaffold/demo-remove-scenarios';

/** A throwaway checkout holding just the scenario files a module can own. */
let root: string;

/** Write a file under the throwaway root, creating its folder. */
const write = (relative: string): void => {
    const full = path.join(root, relative);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, 'export {};\n');
};

/** Whether a path exists under the throwaway root. */
const exists = (relative: string): boolean => existsSync(path.join(root, relative));

beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'demo-remove-scenario-files-'));
    write('scenarios/payments.ts');
    write('scenarios/values/payments.ts');
    write('scenarios/support/doubles/payments/register.ts');
    write('scenarios/support/doubles/payments/fake.ts');
    write('scenarios/users.ts');
    write('scenarios/values/users.ts');
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe('removeScenarioModuleFiles', () => {
    it("deletes a removed module's fixtures, example values and doubles folder, and nothing else", () => {
        const notes = removeScenarioModuleFiles(root, ['payments']);

        expect(exists('scenarios/payments.ts')).toBe(false);
        expect(exists('scenarios/values/payments.ts')).toBe(false);
        expect(exists('scenarios/support/doubles/payments')).toBe(false);
        expect(exists('scenarios/users.ts')).toBe(true);
        expect(exists('scenarios/values/users.ts')).toBe(true);
        expect(notes.map((note) => note.file)).toEqual([
            'scenarios/payments.ts',
            'scenarios/values/payments.ts',
            'scenarios/support/doubles/payments'
        ]);
    });

    it('reports nothing for a module that has no scenario files', () => {
        expect(removeScenarioModuleFiles(root, ['wishlist'])).toEqual([]);
        expect(exists('scenarios/support/doubles/payments')).toBe(true);
    });
});
