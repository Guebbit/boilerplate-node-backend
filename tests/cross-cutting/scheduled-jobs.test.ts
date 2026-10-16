import { readFileSync } from 'node:fs';
import path from 'node:path';
import { resolveJobs } from '@kernel/registry';
import { appJobs } from '../../src/app/jobs';
import { enabledModules } from '../../src/modules';
import { looksLikeCron } from '../../scripts/docs/jobs-render';
import { REPO_ROOT } from '@tests/paths';

/**
 * Guard: every scheduled job is declared once, on a module manifest or in `src/app/jobs.ts`, and
 * is well-formed. `docker/crontab` and the `npm run` scripts are generated from those declarations
 * (`npm run jobs:generate`, held by `npm run check:jobs`), so the old "two files must agree"
 * checks became "the declarations obey the rules the generators assume".
 *
 * See: docs/reference/ops.md#scheduled-jobs
 */

/** Every job in the build, in the order the crontab lists them. */
const JOBS = [...appJobs, ...resolveJobs(enabledModules)];

describe('the declared jobs', () => {
    it('finds the jobs it means to check', () => {
        // A canary: an empty list must mean "the registry moved", not "everything agreed".
        // Exact floor for the foundation alone: the jobs no module owns plus `account`'s and `webhooks`'.
        expect(JOBS.length).toBeGreaterThanOrEqual(8);
    });

    it('names each job once', () => {
        const names = JOBS.map((job) => job.name);

        expect(new Set(names).size).toBe(names.length);
    });

    it.each(JOBS.map((job) => [job.name, job] as const))(
        '%s is a reap: or sweep: job with a five-field schedule and a summary',
        (_name, job) => {
            expect(job.name).toMatch(/^(?:reap|sweep):[\w-]+$/);
            expect(looksLikeCron(job.schedule)).toBe(true);
            expect(job.summary.length).toBeGreaterThan(10);
        }
    );

    it.each(JOBS.filter((job) => job.lease).map((job) => [job.name, job] as const))(
        '%s holds its lease for a positive time',
        (_name, job) => {
            expect(job.lease!.ttlMs).toBeGreaterThan(0);
        }
    );
});

/**
 * The production image copies `scripts/ops/` whole and no other script folder but `scripts/db/`,
 * so the one runner every job goes through has to live there.
 */
describe('every scheduled job ships in the production image', () => {
    const { scripts } = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as {
        scripts: Record<string, string>;
    };

    it.each(JOBS.map((job) => job.name))('%s runs the runner under scripts/ops/', (name) => {
        expect(scripts[name]).toBe(`tsx scripts/ops/run-job.ts ${name}`);
    });
});
