/**
 * `eslint.config.ts`'s "a module does not import its own barrel" `boundaries/dependencies` policy,
 * checked LIVE against the real flat config.
 *
 * Guards:   the bug where `checkInternals` was left unset, so every same-module edge skips
 *           evaluation silently. A clean `npm run lint` and a dead policy look identical from the
 *           CLI, so this is its own liveness probe.
 * Process:  the real `eslint` binary, not `ESLint#lintFiles`: the Node API's config loader needs
 *           `jiti` to read `eslint.config.ts`, which does not resolve inside a jest worker (the
 *           reason `apply.test.ts` shells out to `scenarios/apply.ts`). `npm run lint` is a
 *           subprocess too.
 * Real file: briefly under `src/modules/users/`. `parserOptions.project` resolves against the
 *           physical TypeScript program, so a virtual path fails to parse before the boundaries
 *           rule runs. The probe is written and removed around the one run that needs it.
 */
import { execFile } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '@tests/paths';

/** The eslint binary the probe is run with. */
const ESLINT_BIN = path.join(REPO_ROOT, 'node_modules', '.bin', 'eslint');
/** Path of the probe file the case writes. */
const PROBE_PATH = path.join(REPO_ROOT, 'src/modules/users/__self-barrel-probe.ts');
/** The probe file path, relative to the repo root, as eslint reports it. */
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
            "import { userService } from '@modules/users';\nvoid userService;\n"
        );

        const messages = await lintProbe();

        expect(messages.some((message) => message.ruleId === 'boundaries/dependencies')).toBe(true);
    });
});
