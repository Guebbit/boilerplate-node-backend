/**
 * `eslint.config.ts`'s "a module does not import its own barrel" `boundaries/dependencies`
 * policy, checked LIVE against the real flat config. The bug this guards against
 * (`checkInternals` left unset) makes every same-module edge skip evaluation silently — a clean
 * `npm run lint` and a dead policy look identical from the CLI alone, so this needs its own
 * liveness probe rather than trusting a passing lint run to mean the policy ran.
 *
 * Spawned as the real `eslint` binary rather than `ESLint#lintFiles`: the Node API's config
 * loader needs `jiti` to read `eslint.config.ts`, which does not resolve inside a jest worker's
 * own module system — the same reason `apply.test.ts` shells out to `scenarios/apply.ts` rather
 * than importing it. A subprocess is also what `npm run lint` itself is.
 *
 * Against a REAL file under `src/modules/products/`, briefly: `parserOptions.project` resolves
 * against the physical TypeScript program, so a virtual path fails to parse before the boundaries
 * rule ever runs. The probe file is written and removed around the one run that needs it.
 */
import { execFile } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.join(__dirname, '..', '..', '..');
const ESLINT_BIN = path.join(REPO_ROOT, 'node_modules', '.bin', 'eslint');
const PROBE_PATH = path.join(REPO_ROOT, 'src/modules/products/__self-barrel-probe.ts');
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

describe('a module cannot import its own barrel', () => {
    afterEach(() => rmSync(PROBE_PATH, { force: true }));

    it('is refused by boundaries/dependencies, not silently allowed', async () => {
        writeFileSync(
            PROBE_PATH,
            "import { productService } from '@modules/products';\nvoid productService;\n"
        );

        const messages = await lintProbe();

        expect(messages.some((message) => message.ruleId === 'boundaries/dependencies')).toBe(true);
    });
});
