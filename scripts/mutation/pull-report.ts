#!/usr/bin/env tsx
/**
 * Brings the newest GitHub sweep home — `npm run mutation:pull`.
 *
 * What:   the sweep's merged `mutation.json` and `index.html`, written where a local run writes
 *         them; then `mutation-baseline.json` folded from that report, as the sweep folds it.
 * Why:    the report is the one source. The baseline is derived from it, here as in CI, so the
 *         two can never disagree. Review the baseline's diff, then commit it.
 * Needs:  the GitHub CLI, logged in (`gh auth login`).
 * See:    docs/build/mutation-testing.md#the-github-sweep
 */
import { execFile, spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { REPORT_PATH } from './baseline';
import type { GitHubArtifact, MissingReason } from './github-artifacts';
import { REPORT_ARTIFACT, newestReport } from './github-artifacts';

/** `execFile`, promise-shaped: arguments are passed as a list, never through a shell. */
const run = promisify(execFile);

/** Where a local run writes its report and page — the pulled ones go to the same place. */
const REPORT_DIRECTORY = path.dirname(REPORT_PATH);

/** The two files taken out of the artifact; its `summary.md` is for the run page only. */
const PULLED_FILES = ['mutation.json', 'index.html'];

/**
 * GitHub CLI: list this repository's artifacts by name. `{owner}/{repo}` is filled in by `gh` from
 * the current checkout's remote. 100 is the endpoint's page maximum — months of monthly sweeps.
 * https://cli.github.com/manual/gh_api
 */
const listArtifacts = (): Promise<GitHubArtifact[]> =>
    run('gh', [
        'api',
        `repos/{owner}/{repo}/actions/artifacts?name=${REPORT_ARTIFACT}&per_page=100`
        // `gh api` prints GitHub's artifacts-list JSON; only `artifacts` is read.
    ]).then(({ stdout }) => (JSON.parse(stdout) as { artifacts: GitHubArtifact[] }).artifacts);

/**
 * GitHub CLI: download one named artifact of one run, unzipped into `directory`.
 * https://cli.github.com/manual/gh_run_download
 */
const download = (runId: number, directory: string): Promise<unknown> =>
    run('gh', ['run', 'download', String(runId), '--name', REPORT_ARTIFACT, '--dir', directory]);

/**
 * Downloads `artifact` into a scratch directory, copies the report and page out, and removes the
 * scratch.
 *
 * @param artifact - the artifact {@link newestReport} chose
 */
const install = (artifact: GitHubArtifact): Promise<void> =>
    mkdtemp(path.join(tmpdir(), 'mutation-report-')).then((directory) =>
        download(artifact.workflow_run.id, directory)
            .then(() => mkdir(REPORT_DIRECTORY, { recursive: true }))
            .then(() =>
                Promise.all(
                    PULLED_FILES.map((file) =>
                        copyFile(path.join(directory, file), path.join(REPORT_DIRECTORY, file))
                    )
                )
            )
            .finally(() => rm(directory, { recursive: true, force: true }))
            .then(() => {
                console.log(
                    `[mutation-pull] ${REPORT_DIRECTORY}/ ← run ${String(artifact.workflow_run.id)} ` +
                        `(${artifact.created_at}).`
                );
            })
    );

/**
 * Folds the pulled report into `mutation-baseline.json` — the command the sweep's merge job runs.
 * `--merge`, not `--update`: a file the sweep could not measure keeps its recorded score.
 *
 * @returns the ratchet's exit code: 1 when the sweep measured a file below its baseline
 */
const foldBaseline = (): number =>
    spawnSync(
        'npx',
        ['tsx', 'scripts/mutation/check-baseline.ts', '--merge', `--merge-dir=${REPORT_DIRECTORY}`],
        { stdio: 'inherit' }
    ).status ?? 2;

/**
 * One line per way {@link newestReport} can come up empty, each saying what to do next.
 *
 * @param reason - which rule emptied the list
 * @param artifacts - the listing the reason was drawn from
 * @returns the error text
 */
const missingMessage = (reason: MissingReason, artifacts: readonly GitHubArtifact[]): string => {
    const named = artifacts.filter((artifact) => artifact.name === REPORT_ARTIFACT);
    if (reason === 'none-uploaded')
        return (
            `no ${REPORT_ARTIFACT} artifact exists: no sweep of main has reached its merge job ` +
            '(it runs only after a green preflight). Check `gh workflow list --all` and ' +
            '`gh run list --workflow mutation.yml --branch main`.'
        );
    if (reason === 'none-from-main')
        return (
            `${REPORT_ARTIFACT} artifacts exist only for other branches: ` +
            `${[...new Set(named.map((artifact) => artifact.workflow_run.head_branch))].join(', ')}.`
        );
    const newest =
        named
            .map((artifact) => artifact.created_at)
            .toSorted()
            .at(-1) ?? 'unknown';
    return `every ${REPORT_ARTIFACT} artifact from main has expired (newest ${newest}): re-run the sweep.`;
};

// Exit 1 when no sweep has uploaded a report yet, or GitHub cannot be reached.
listArtifacts()
    .then((artifacts) => {
        const found = newestReport(artifacts);
        if ('missing' in found) throw new Error(missingMessage(found.missing, artifacts));
        return install(found.artifact);
    })
    .then(() => {
        process.exitCode = foldBaseline();
        console.log(
            '[mutation-pull] Review the baseline with `git diff mutation-baseline.json`, then commit it.'
        );
    })
    .catch((error: unknown) => {
        console.error(`[mutation-pull] ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
    });
