/**
 * `eslint.config.ts`'s "no `factories.ts` import in production code" `no-restricted-imports`
 * block, checked LIVE against the real flat config — the same reason `self-barrel-import.test.ts`
 * shells out to the `eslint` binary rather than `ESLint#lintFiles`: the Node API's config loader
 * needs `jiti` to read `eslint.config.ts`, which does not resolve inside a jest worker.
 *
 * Against a REAL file under `src/modules/products/`, briefly, for the same reason that test uses
 * one: `parserOptions.project` resolves against the physical TypeScript program.
 */
import { execFile } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '@tests/paths';

const ESLINT_BIN = path.join(REPO_ROOT, 'node_modules', '.bin', 'eslint');
const PROBE_PATH = path.join(REPO_ROOT, 'src/modules/products/__factories-import-probe.ts');
const PROBE_RELATIVE = path.relative(REPO_ROOT, PROBE_PATH);

/** One run of the real `eslint` CLI, `--format json` parsed back into its message list. */
const lintProbe = (): Promise<{ ruleId: string | null }[]> =>
    new Promise((resolve, reject) => {
        execFile(
            ESLINT_BIN,
            ['--format', 'json', '--no-warn-ignored', PROBE_RELATIVE],
            { cwd: REPO_ROOT, encoding: 'utf8' },
            // A finding exits non-zero, which is the case under test — only a parse failure of
            // eslint's own JSON output is a real error here.
            (_error, stdout) => {
                try {
                    resolve(JSON.parse(stdout)[0]?.messages ?? []);
                } catch (parseError) {
                    reject(
                        parseError instanceof Error ? parseError : new Error(String(parseError))
                    );
                }
            }
        );
    });

describe('production code cannot import a factories.ts builder', () => {
    afterEach(() => rmSync(PROBE_PATH, { force: true }));

    it("is refused by no-restricted-imports, even for the module's own factories.ts", async () => {
        writeFileSync(
            PROBE_PATH,
            "import { makeProduct } from './factories';\nvoid makeProduct;\n"
        );

        const messages = await lintProbe();

        expect(messages.some((message) => message.ruleId === 'no-restricted-imports')).toBe(true);
    });
});
