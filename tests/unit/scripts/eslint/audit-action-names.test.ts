/**
 * The audit-vocabulary block of `eslint.config.ts`, checked LIVE against the real flat config.
 *
 * `no-restricted-syntax` replaces, never merges, between config blocks, so the block that adds the
 * action-name selector must also keep the double-cast and try/catch bans. Only a real lint run
 * shows whether all three are alive.
 *
 * Spawned as the real `eslint` binary (as `self-barrel-import.test.ts` explains), against a probe
 * `audit.ts` in a throwaway module folder: the block matches `src/modules/*\/audit.ts` by name.
 */
import { execFile } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '@tests/paths';

/** The eslint binary the probe is run with. */
const ESLINT_BIN = path.join(REPO_ROOT, 'node_modules', '.bin', 'eslint');
/** Folder the probe module is written to, removed after each case. */
const PROBE_DIR = path.join(REPO_ROOT, 'src/modules/__audit-names-probe');
/** Folder the probe module is written to, removed after each case. */
const PROBE_RELATIVE = path.relative(REPO_ROOT, path.join(PROBE_DIR, 'audit.ts'));

/** Lints `source` as a module's `audit.ts` and returns the `no-restricted-syntax` messages. */
const lintAuditFile = (source: string): Promise<string[]> => {
    mkdirSync(PROBE_DIR, { recursive: true });
    writeFileSync(path.join(PROBE_DIR, 'audit.ts'), source);

    return new Promise((resolve, reject) => {
        execFile(
            ESLINT_BIN,
            ['--format', 'json', '--no-warn-ignored', PROBE_RELATIVE],
            { cwd: REPO_ROOT, encoding: 'utf8' },
            // A finding exits non-zero, which is the case under test.
            (_error, stdout) => {
                try {
                    const messages = (JSON.parse(stdout)[0]?.messages ?? []) as {
                        ruleId: string | null;
                        message: string;
                    }[];
                    resolve(
                        messages
                            .filter((message) => message.ruleId === 'no-restricted-syntax')
                            .map((message) => message.message)
                    );
                } catch (parseError) {
                    reject(
                        parseError instanceof Error ? parseError : new Error(String(parseError))
                    );
                }
            }
        );
    });
};

describe('audit.ts action names', () => {
    afterEach(() => rmSync(PROBE_DIR, { recursive: true, force: true }));

    it('accepts dotted lower snake_case names of 2 to 4 segments', async () => {
        const messages = await lintAuditFile(
            "export const actions = { a: 'order.refunded', b: 'user.cart_item.removed', c: 'a.b.c.d' } as const;\n"
        );

        expect(messages).toEqual([]);
    });

    it.each([
        'User.cart.removed',
        'cartremoved',
        'user.cart-item.removed',
        'a.b.c.d.e',
        'user.cart.'
    ])('refuses %s', async (name) => {
        const messages = await lintAuditFile(`export const actions = { a: '${name}' } as const;\n`);

        expect(messages).toHaveLength(1);
    });

    it('still refuses a double cast and a try/catch', async () => {
        const messages = await lintAuditFile(
            'export const a = 1 as unknown as string;\nexport const b = () => { try { return 1; } catch { return 2; } };\n'
        );

        expect(messages).toHaveLength(2);
    });
});
