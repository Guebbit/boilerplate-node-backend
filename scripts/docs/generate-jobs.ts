#!/usr/bin/env tsx
/**
 * Everything derived from the jobs the modules declare — `npm run jobs:generate`: the
 * `docker/crontab`, the `npm run reap:*` / `sweep:*` scripts in `package.json`, and the jobs table
 * in `docs/reference/ops.md`. `--check` reports drift instead of writing, which is what `complete`
 * runs.
 *
 * Declared once (`AppModule.jobs`, `src/app/jobs.ts`), written three times: the schedule used to be
 * kept by hand in four places, and the one a person missed was the job that silently never ran.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { resolveJobs } from '@kernel/registry';
import { appJobs } from '../../src/app/jobs';
import { enabledModules } from '../../src/modules';
import { REPO_ROOT as ROOT } from '../modules-on-disk';
import { applyMarkerBlocks } from './marker-block';
import { renderCrontab, renderJobsTable, withJobScripts } from './jobs-render';
import { hasFlag } from '../cli';

/** Report drift instead of rewriting — what `complete` runs. */
const checkOnly = hasFlag('check');

/** Every job in the build: the ones no module owns, then each enabled module's. */
const jobs = [...appJobs, ...resolveJobs(enabledModules)];

/** Files generated whole: path, expected text. */
const WHOLE_FILES: readonly (readonly [string, (current: string) => string])[] = [
    ['docker/crontab', () => renderCrontab(jobs)],
    ['package.json', (current) => withJobScripts(current, jobs)]
];

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
            `${relative} is not what the job declarations generate.\n  Run: npm run jobs:generate`
        );
        return 1;
    }
    writeFileSync(path.join(ROOT, relative), expected, 'utf8');
    console.log(`✓ Generated ${relative}`);
    return 0;
};

/** Run every file and the ops page; resolves the exit code. */
const main = async (): Promise<number> => {
    let code = 0;
    for (const [relative, render] of WHOLE_FILES) {
        const file = path.join(ROOT, relative);
        const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
        code += settle(relative, render(current), current);
    }
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
        driftSubject: 'the job declarations',
        rerunScript: 'jobs:generate'
    });
    return code === 0 ? 0 : 1;
};

void main().then((code) => {
    process.exitCode = code;
});
