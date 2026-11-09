/**
 * @module
 * Which `mutation-report` artifact `npm run mutation:pull` downloads.
 *
 * Pure: `pull-report.ts` does the GitHub calls and the file writes.
 * See: docs/tools/mutation-testing.md#the-github-sweep
 */

/** The artifact the sweep's merge job uploads: the merged `mutation.json` and its `index.html`. */
export const REPORT_ARTIFACT = 'mutation-report';

/** The branch whose sweeps measure the code this checkout compares against. */
const REPORT_BRANCH = 'main';

/**
 * One artifact, as GitHub's "list artifacts for a repository" endpoint returns it — only the fields
 * read here.
 * https://docs.github.com/en/rest/actions/artifacts#list-artifacts-for-a-repository
 */
export interface GitHubArtifact {
    /** The artifact's name: {@link REPORT_ARTIFACT} for the ones this module wants. */
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

/** Why no report can be downloaded, in the order the walk rules them out. */
export type MissingReason = 'none-uploaded' | 'none-from-main' | 'all-expired';

/** What {@link newestReport} answers: the artifact to download, or the reason there is none. */
export type NewestReport = { artifact: GitHubArtifact } | { missing: MissingReason };

/**
 * The newest report a sweep of {@link REPORT_BRANCH} uploaded that can still be downloaded.
 *
 * A run on another branch is skipped: its report measures that branch's code, not `main`'s.
 * Check order: no artifact with the name, then none from `main`, then every `main` one expired.
 *
 * @param artifacts - every artifact GitHub listed, in any order
 * @returns `{ artifact }` to download, or `{ missing }` naming the first rule that emptied the list
 */
export const newestReport = (artifacts: readonly GitHubArtifact[]): NewestReport => {
    const named = artifacts.filter((artifact) => artifact.name === REPORT_ARTIFACT);
    if (named.length === 0) return { missing: 'none-uploaded' };
    const fromMain = named.filter(
        (artifact) => artifact.workflow_run.head_branch === REPORT_BRANCH
    );
    if (fromMain.length === 0) return { missing: 'none-from-main' };
    const artifact = fromMain
        .filter((candidate) => !candidate.expired)
        .toSorted((a, b) => b.created_at.localeCompare(a.created_at))
        .at(0);
    return artifact ? { artifact } : { missing: 'all-expired' };
};
