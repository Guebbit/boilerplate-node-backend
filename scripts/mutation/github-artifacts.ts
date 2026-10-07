/**
 * @module
 * Which `mutation-baseline` artifact `npm run mutation:pull` downloads.
 *
 * Pure: `pull-baseline.ts` does the GitHub calls and the file write.
 * See: docs/tools/mutation-testing.md#the-github-sweep
 */

/** The artifact the sweep's merge job uploads: the folded `mutation-baseline.json`. */
export const BASELINE_ARTIFACT = 'mutation-baseline';

/** The branch whose sweeps measure the code the baseline belongs to. */
export const BASELINE_BRANCH = 'main';

/**
 * One artifact, as GitHub's "list artifacts for a repository" endpoint returns it — only the fields
 * read here.
 * https://docs.github.com/en/rest/actions/artifacts#list-artifacts-for-a-repository
 */
export interface GitHubArtifact {
    /** The artifact's name: {@link BASELINE_ARTIFACT} for the ones this module wants. */
    name: string;
    /** Past its retention: still listed, no longer downloadable. */
    expired: boolean;
    /** ISO-8601 upload time. */
    created_at: string;
    /** The run that uploaded it. */
    workflow_run: {
        /** The run's id — what `gh run download` takes. */
        id: number;
        /** The branch the run measured. */
        head_branch: string;
    };
}

/**
 * The newest baseline a sweep of {@link BASELINE_BRANCH} uploaded that can still be downloaded.
 *
 * A run on another branch is skipped: its baseline scores that branch's code, not `main`'s.
 *
 * @param artifacts - every artifact GitHub listed, in any order
 * @returns the one to download, or `undefined` when there is none
 */
export const newestBaseline = (artifacts: readonly GitHubArtifact[]): GitHubArtifact | undefined =>
    artifacts
        .filter(
            (artifact) =>
                artifact.name === BASELINE_ARTIFACT &&
                !artifact.expired &&
                artifact.workflow_run.head_branch === BASELINE_BRANCH
        )
        .toSorted((a, b) => b.created_at.localeCompare(a.created_at))
        .at(0);
