import { mkdirSync, mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stripModuleDoubles } from '../../../../scripts/ops/demo-remove-scenarios';

/** What `scenarios/support/doubles/register.ts` looks like with two modules' doubles in it. */
const REGISTER = `import { registerPaymentDouble } from './payments/register';
import { registerMailDoubles } from './mail';

export const registerDoubles = (): void => {
    registerPaymentDouble();
    registerMailDoubles();
};
`;

/** A throwaway checkout holding just the doubles folder. */
let root: string;

/** Write a file under the throwaway root, creating its folder. */
const write = (relative: string, content: string): void => {
    const full = path.join(root, relative);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
};

beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'demo-remove-doubles-'));
    write('scenarios/support/doubles/register.ts', REGISTER);
    write('scenarios/support/doubles/payments/register.ts', 'export {};\n');
    write('scenarios/support/doubles/payments/fake.ts', 'export {};\n');
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe('stripModuleDoubles', () => {
    it("deletes a removed module's doubles folder and unregisters it, leaving the rest", () => {
        const notes = stripModuleDoubles(root, ['payments']);

        expect(existsSync(path.join(root, 'scenarios/support/doubles/payments'))).toBe(false);
        const register = readFileSync(
            path.join(root, 'scenarios/support/doubles/register.ts'),
            'utf8'
        );
        expect(register).not.toMatch(/registerPaymentDouble/u);
        expect(register).toMatch(/registerMailDoubles\(\);/u);
        expect(notes).toHaveLength(1);
    });

    it('leaves alone a module that has no doubles', () => {
        expect(stripModuleDoubles(root, ['wishlist'])).toEqual([]);
        expect(existsSync(path.join(root, 'scenarios/support/doubles/payments'))).toBe(true);
    });

    it('refuses when the shared register file no longer imports the folder', () => {
        write(
            'scenarios/support/doubles/register.ts',
            'export const registerDoubles = () => {};\n'
        );

        expect(() => stripModuleDoubles(root, ['payments'])).toThrow(/does not import/u);
    });
});
