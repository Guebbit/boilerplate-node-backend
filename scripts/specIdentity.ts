/**
 * The cross-repo contract check.
 *
 * `openapi.yaml`, `asyncapi.yaml` and `spectral.yaml` exist in BOTH this repo and the paired
 * frontend, byte-for-byte identical, maintained by hand. Codegen on both sides reads them — orval
 * and `gen-asyncapi-types` here, orval and its own generator there — so a one-line edit in one
 * checkout silently forks the contract both sides believe they share. Nothing detected that: each
 * repo's CI lints its own copy and finds it perfectly valid, because a forked spec is still a
 * valid spec.
 *
 * This module is the detector. It is deliberately dumber than a semantic diff: identity, not
 * equivalence. Two specs that mean the same thing but differ in key order or comments are still a
 * fork in the making, because the next person to regenerate from one of them gets a diff nobody
 * asked for. Reordering both copies together is a two-line change; letting them drift is not.
 *
 * It treats the symptom, and should say so: the cure is one source of truth — a package both
 * repos consume, or a third repo — which is a bigger decision than a CI job (see
 * BETTER_TESTS_PLAN.md §11.5). Until that is made, this fails the build on the commit that forks
 * the spec rather than on the release that ships the mismatch.
 *
 * The frontend mirrors this file. The two are separate copies on purpose: a shared package would
 * itself be a cross-repo dependency, which is the problem rather than the fix.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The files that must be identical in both checkouts.
 *
 * `spectral.yaml` is here alongside the two specs because it is the ruleset both `lint:openapi`
 * jobs enforce: if the two repos lint the same document under different rules, one of them passes
 * a spec the other would reject, and the disagreement surfaces as a CI failure on whichever side
 * happens to touch the file next.
 */
export const SHARED_SPEC_FILES = ['openapi.yaml', 'asyncapi.yaml', 'spectral.yaml'] as const;

export type TSpecComparisonStatus = 'match' | 'drift' | 'missing-here' | 'missing-there';

export interface ISpecComparison {
    file: string;
    /** sha256 of this repo's copy, or undefined when the file is absent here. */
    ours?: string;
    /** sha256 of the sibling's copy, or undefined when the file is absent there. */
    theirs?: string;
    status: TSpecComparisonStatus;
}

/**
 * sha256 rather than md5: nothing here is adversarial, but a checksum printed in a failure
 * message gets pasted into issues and commit messages, and a deprecated digest in that position
 * invites the question every time.
 */
export const hashFile = (filePath: string): string =>
    createHash('sha256').update(readFileSync(filePath)).digest('hex');

/**
 * Compare every shared spec against a sibling checkout.
 *
 * Never throws on a missing file: an absent spec is reported as its own status, so the caller can
 * tell "the sibling checkout is not where I looked" (every file `missing-there`) from "someone
 * deleted asyncapi.yaml" (one file). Those want different messages, and a thrown ENOENT gives
 * neither.
 *
 * @param siblingRoot - absolute path to the other repo's checkout
 * @param here - absolute path to this repo's root; defaults to the working directory
 */
export const compareSpecs = (
    siblingRoot: string,
    here: string = process.cwd()
): ISpecComparison[] =>
    SHARED_SPEC_FILES.map((file) => {
        const ourPath = path.join(here, file);
        const theirPath = path.join(siblingRoot, file);

        if (!existsSync(ourPath)) return { file, status: 'missing-here' as const };
        if (!existsSync(theirPath))
            return { file, ours: hashFile(ourPath), status: 'missing-there' as const };

        const ours = hashFile(ourPath);
        const theirs = hashFile(theirPath);
        return {
            file,
            ours,
            theirs,
            status: ours === theirs ? ('match' as const) : ('drift' as const)
        };
    });

/** Every comparison that is not a clean match — i.e. everything worth printing. */
export const specProblems = (comparisons: ISpecComparison[]): ISpecComparison[] =>
    comparisons.filter(({ status }) => status !== 'match');

/**
 * Render the problems as the message a human needs: which file, which side, and what to do.
 * Returns an empty string when there is nothing wrong, so callers can branch on truthiness.
 */
export const formatSpecProblems = (comparisons: ISpecComparison[], siblingRoot: string): string => {
    const problems = specProblems(comparisons);
    if (problems.length === 0) return '';

    const lines = problems.map((problem) => {
        switch (problem.status) {
            case 'drift': {
                return (
                    `  ${problem.file}: FORKED\n` +
                    `    here    ${problem.ours}\n` +
                    `    sibling ${problem.theirs}`
                );
            }
            case 'missing-here': {
                return `  ${problem.file}: absent from this repo, present in the sibling`;
            }
            default: {
                return `  ${problem.file}: absent from ${siblingRoot}`;
            }
        }
    });

    return (
        `Shared contract mismatch against ${siblingRoot}:\n${lines.join('\n')}\n\n` +
        `  Both repos must carry byte-identical copies of: ${SHARED_SPEC_FILES.join(', ')}.\n` +
        `  Decide which side is right, copy it over the other, then regenerate in BOTH repos:\n` +
        `    npm run genapi && npm run genasyncapi`
    );
};
