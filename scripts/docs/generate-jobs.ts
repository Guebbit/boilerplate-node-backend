#!/usr/bin/env tsx
/**
 * Everything derived from the jobs the modules declare — a step of `npm run regenerate`: the
 * `docker/crontab` and the jobs table in `docs/reference/ops.md`. `--check` reports drift instead
 * of writing, which is what `npm run check` runs.
 *
 * Declared once (`AppModule.jobs`, `src/app/jobs.ts`), written twice: a schedule kept by hand in
 * several places is one a person misses, and that is the job that silently never runs.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { resolveJobs } from '@kernel/registry';
import { appJobs } from '../../src/app/jobs';
import { enabledModules } from '../../src/modules';
import { REPO_ROOT as ROOT } from '../modules-on-disk';
import { applyMarkerBlocks } from './marker-block';
import { renderCrontab, renderJobsTable } from './jobs-render';
import { hasFlag } from '../cli';

/** Report drift instead of rewriting — what `npm run check` runs. */
const checkOnly = hasFlag('check');

/** Every job in the build: the ones no module owns, then each enabled module's. */
const jobs = [...appJobs, ...resolveJobs(enabledModules)];

/** The crontab, generated whole. */
const CRONTAB = 'docker/crontab';

/**
 * Write one whole file, or report that it differs. Returns the exit-code contribution.
 *
 * @param relative - repo-relative path
 * @param expected - what the file should hold given the current declarations
 * @param current - what it holds
 */
const settle = (relative: string, expected: string, current: string): number => {
    if (expected === current) return 0;
    if (checkOnly) {
        console.error(
            `${relative} is not what the job declarations generate.\n  Run: npm run regenerate`
        );
        return 1;
    }
    writeFileSync(path.join(ROOT, relative), expected, 'utf8');
    console.log(`✓ Generated ${relative}`);
    return 0;
};

/** Settle the crontab and the ops page; resolves the exit code. */
const main = async (): Promise<number> => {
    const file = path.join(ROOT, CRONTAB);
    const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
    let code = settle(CRONTAB, renderCrontab(jobs), current);
    code += await applyMarkerBlocks({
        file: path.join(ROOT, 'docs/reference/ops.md'),
        root: ROOT,
        blocks: [
            {
                start: '<!-- jobs:start -->',
                end: '<!-- jobs:end -->',
                body: renderJobsTable(jobs)
            }
        ],
        label: 'jobs',
        checkOnly,
        driftSubject: 'the job declarations'
    });
    return code === 0 ? 0 : 1;
};

void main().then((code) => {
    process.exitCode = code;
});
