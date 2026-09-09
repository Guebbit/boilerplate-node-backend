import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Guard: `docker/crontab` and `package.json` agree, in both directions.
 *
 * The schedule lives outside the application on purpose (see docs/reference/ops.md#scheduled-jobs)
 * — a `cron` service in compose running the existing `ops/reap-*`/`sweep:*` entry points — which
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
        .filter((line) => line.trim() !== '' && !line.trim().startsWith('#'))
        .flatMap((line) => [...line.matchAll(/npm run ([\w:-]+)/g)].map(([, name]) => name));

/** Every `package.json` script name in the `reap:*`/`sweep:*` family the crontab is meant to run. */
const scheduledPackageScripts = (): string[] => {
    const { scripts } = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
        scripts: Record<string, string>;
    };

    return Object.keys(scripts).filter((name) => /^(?:reap|sweep):/.test(name));
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

        for (const name of scheduledPackageScripts()) expect(scheduled).toContain(name);
    });

    it('actually reads both sides', () => {
        // A canary: an empty result must mean "the file moved", not "everything agreed".
        expect(scriptsInCrontab().length).toBeGreaterThan(0);
        expect(scheduledPackageScripts().length).toBeGreaterThan(0);
    });
});
