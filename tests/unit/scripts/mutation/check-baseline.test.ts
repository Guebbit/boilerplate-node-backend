/**
 * `scripts/mutation/check-baseline.ts` — what a plain check claims about a file it did not record.
 *
 * Run through the real entry point in a scratch directory: the script reads and writes relative
 * to the working directory, so nothing in the repo is touched.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** The repo root: the script under test and the repo's own tsx live here. */
const root = path.resolve(__dirname, '../../../..');

/** Scratch directories to remove after each case. */
const scratch: string[] = [];

afterEach(() => {
    for (const directory of scratch.splice(0)) rmSync(directory, { recursive: true, force: true });
});

/**
 * Runs the CLI in a fresh directory whose baseline knows one file and whose report also
 * measured a second, unrecorded one.
 *
 * @param flags - CLI flags to pass
 */
const runCheck = (...flags: string[]) => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'mutation-check-'));
    scratch.push(cwd);
    mkdirSync(path.join(cwd, 'tmp/reports/mutation'), { recursive: true });
    const killed = { mutants: [{ status: 'Killed' }] };
    writeFileSync(
        path.join(cwd, 'tmp/reports/mutation/mutation.json'),
        JSON.stringify({ files: { 'src/old.ts': killed, 'src/fresh.ts': killed } })
    );
    writeFileSync(
        path.join(cwd, 'mutation-baseline.json'),
        JSON.stringify({ files: { 'src/old.ts': 100 } })
    );
    const result = spawnSync(
        path.join(root, 'node_modules/.bin/tsx'),
        [path.join(root, 'scripts/mutation/check-baseline.ts'), ...flags],
        { cwd, encoding: 'utf8' }
    );
    const baseline = readFileSync(path.join(cwd, 'mutation-baseline.json'), 'utf8');
    return { output: `${result.stdout}${result.stderr}`, baseline };
};

describe('check-baseline new-file line', () => {
    it('does not claim a recording on a plain check, and writes nothing', () => {
        const { output, baseline } = runCheck();

        expect(output).not.toContain('new file recorded');
        expect(baseline).not.toContain('src/fresh.ts');
    });

    it('claims the recording under --update, and the file is in the baseline', () => {
        const { output, baseline } = runCheck('--update');

        expect(output).toContain('new file recorded: src/fresh.ts');
        expect(baseline).toContain('src/fresh.ts');
    });
});
