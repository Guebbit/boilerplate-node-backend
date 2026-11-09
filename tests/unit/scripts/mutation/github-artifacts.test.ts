/**
 * `scripts/mutation/github-artifacts.ts` — which uploaded report `npm run mutation:pull` takes.
 *
 * Driven against synthetic artifact lists, never GitHub: the download half
 * (`scripts/mutation/pull-report.ts`) is a thin wrapper over the GitHub CLI.
 */
import type { GitHubArtifact } from '../../../../scripts/mutation/github-artifacts';
import { REPORT_ARTIFACT, newestReport } from '../../../../scripts/mutation/github-artifacts';

/**
 * A report artifact uploaded by a sweep of `main`, with whatever the case changes.
 *
 * @param runId - the uploading run, which is also what tells the cases apart
 * @param createdAt - ISO-8601 upload time
 * @param overrides - the fields the case is about
 * @returns one artifact as GitHub lists it
 */
const artifact = (
    runId: number,
    createdAt: string,
    overrides: Partial<Omit<GitHubArtifact, 'workflow_run'>> & { branch?: string } = {}
): GitHubArtifact => ({
    name: overrides.name ?? REPORT_ARTIFACT,
    expired: overrides.expired ?? false,
    created_at: createdAt,
    workflow_run: { id: runId, head_branch: overrides.branch ?? 'main' }
});

describe('newestReport', () => {
    it('takes the newest upload, whatever order GitHub lists them in', () => {
        const chosen = newestReport([
            artifact(1, '2026-09-01T03:00:00Z'),
            artifact(3, '2026-11-01T03:00:00Z'),
            artifact(2, '2026-10-01T03:00:00Z')
        ]);

        expect(chosen).toHaveProperty('artifact.workflow_run.id', 3);
    });

    it('skips an artifact past its retention, which can no longer be downloaded', () => {
        const chosen = newestReport([
            artifact(1, '2026-09-01T03:00:00Z'),
            artifact(2, '2026-10-01T03:00:00Z', { expired: true })
        ]);

        expect(chosen).toHaveProperty('artifact.workflow_run.id', 1);
    });

    it('skips a run of another branch, whose scores belong to that branch’s code', () => {
        const chosen = newestReport([
            artifact(1, '2026-09-01T03:00:00Z'),
            artifact(2, '2026-10-01T03:00:00Z', { branch: 'feature' })
        ]);

        expect(chosen).toHaveProperty('artifact.workflow_run.id', 1);
    });

    it("skips another artifact, such as the diff job's partial report", () => {
        const chosen = newestReport([
            artifact(1, '2026-09-01T03:00:00Z'),
            artifact(2, '2026-10-01T03:00:00Z', { name: 'mutation-diff' })
        ]);

        expect(chosen).toHaveProperty('artifact.workflow_run.id', 1);
    });

    it('names none-uploaded when no sweep has uploaded one yet', () => {
        expect(newestReport([])).toEqual({ missing: 'none-uploaded' });
    });

    it('names none-uploaded when only other artifacts exist', () => {
        expect(
            newestReport([artifact(1, '2026-09-01T03:00:00Z', { name: 'mutation-diff' })])
        ).toEqual({
            missing: 'none-uploaded'
        });
    });

    it('names none-from-main when every report is from another branch', () => {
        expect(newestReport([artifact(1, '2026-09-01T03:00:00Z', { branch: 'feature' })])).toEqual({
            missing: 'none-from-main'
        });
    });

    it('names all-expired when every report from main is past its retention', () => {
        expect(newestReport([artifact(1, '2026-09-01T03:00:00Z', { expired: true })])).toEqual({
            missing: 'all-expired'
        });
    });

    it('names all-expired, not none-from-main, for an expired main report beside a fresh feature one', () => {
        expect(
            newestReport([
                artifact(1, '2026-09-01T03:00:00Z', { expired: true }),
                artifact(2, '2026-10-01T03:00:00Z', { branch: 'feature' })
            ])
        ).toEqual({ missing: 'all-expired' });
    });
});
