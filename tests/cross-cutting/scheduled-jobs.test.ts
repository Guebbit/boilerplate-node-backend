import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Guard: `docker/crontab` and `package.json` agree, in both directions.
 *
 * The schedule lives outside the application on purpose (see docs/reference/ops.md#scheduled-jobs)
 * — a `cron` service in compose running the existing `scripts/ops/reap-*`/`sweep:*` entry points — which
 * makes the crontab a second place that has to agree with `package.json`. Nothing else checks that
 * it still does, so this is that check.
 *
 * One direction alone would miss half the drift: a script renamed in `package.json` and forgotten
 * in the crontab leaves a scheduled job that fails every night forever; a script added to
 * `package.json` and never scheduled leaves cleanup that silently never runs — a job that fails
 * silently is worse than no job, and nobody notices either without this test.
 */

const ROOT = path.join(__dirname, '..', '..');

/** Every `npm run <script>` name a crontab line invokes. */
const scriptsInCrontab = (): string[] =>
    readFileSync(path.join(ROOT, 'docker', 'crontab'), 'utf8')
        .split('\n')
        .filter((line) => line.trim() !== '' && !line.trimStart().startsWith('#'))
        .flatMap((line) => [...line.matchAll(/npm run ([\w:-]+)/g)].map(([, name]) => name));

/** Every `package.json` script in the `reap:*`/`sweep:*` family, name to its `npm run` command. */
const scheduledPackageScripts = (): Record<string, string> => {
    const { scripts } = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
        scripts: Record<string, string>;
    };

    return Object.fromEntries(
        Object.entries(scripts).filter(([name]) => /^(?:reap|sweep):/.test(name))
    );
};

describe('docker/crontab and package.json agree on the scheduled jobs', () => {
    it('names no script package.json does not have', () => {
        const { scripts } = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
            scripts: Record<string, string>;
        };

        for (const name of scriptsInCrontab()) expect(scripts).toHaveProperty(name);
    });

    it('schedules every reap:*/sweep:* script package.json declares', () => {
        const scheduled = new Set(scriptsInCrontab());

        for (const name of Object.keys(scheduledPackageScripts()))
            expect(scheduled).toContain(name);
    });

    it('actually reads both sides', () => {
        // A canary: an empty result must mean "the file moved", not "everything agreed".
        expect(scriptsInCrontab().length).toBeGreaterThan(0);
        expect(Object.keys(scheduledPackageScripts()).length).toBeGreaterThan(0);
    });
});

/**
 * The third link in the chain a module removal walks: `tsc` flags a `scripts/ops/` script importing a
 * deleted module, this flags the now-dangling `npm run` entry, and the test above already flags
 * the crontab line naming it. Without this, deleting a module leaves its `reap:*`/`sweep:*` script
 * green — `npm run <name>` still "exists", it just fails the moment cron actually runs it.
 */
describe('every scheduled script names a file that exists', () => {
    const scripts = scheduledPackageScripts();

    it.each(Object.entries(scripts))('%s (%s)', (_name, command) => {
        const [, scriptPath] = /tsx (\S+\.ts)/.exec(command) ?? [];
        expect(scriptPath).toBeDefined();
        expect(existsSync(path.join(ROOT, scriptPath))).toBe(true);
    });
});

/**
 * The production image copies `scripts/ops/` file by file, so a crontab line whose file the
 * Dockerfile forgot is a job that fails every time the `cron` container runs it. Each side is
 * checked against the other: a crontab job has its COPY, and no one-off tool is shipped.
 */
describe('docker/Dockerfile.production ships exactly the scheduled jobs', () => {
    const dockerfile = readFileSync(path.join(ROOT, 'docker', 'Dockerfile.production'), 'utf8');

    /** Every `scripts/ops/<file>.ts` the Dockerfile names. */
    const shipped = [...dockerfile.matchAll(/\/app\/scripts\/ops\/([\w-]+\.ts)/g)].map(
        ([, file]) => file
    );

    /** The file each crontab job runs, read from its `package.json` command. */
    const scheduledFiles = (): string[] => {
        const { scripts } = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
            scripts: Record<string, string>;
        };

        return scriptsInCrontab().map((name) =>
            path.basename(/tsx (\S+\.ts)/.exec(scripts[name])?.[1] ?? '')
        );
    };

    it('copies the file of every job the crontab runs', () => {
        for (const file of scheduledFiles()) expect(shipped).toContain(file);
    });

    it('copies nothing the crontab does not run', () => {
        const scheduled = new Set(scheduledFiles());

        for (const file of shipped) expect(scheduled).toContain(file);
    });

    it('actually reads both sides', () => {
        expect(shipped.length).toBeGreaterThan(0);
        expect(scheduledFiles().length).toBeGreaterThan(0);
    });
});
