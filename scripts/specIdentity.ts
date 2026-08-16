/**
 * The cross-repo contract check.
 *
 * A set of files exists in BOTH this repo and the paired frontend, byte-for-byte identical,
 * maintained by hand. Codegen on both sides reads the specs among them — orval and
 * `gen-asyncapi-types` here, orval and its own generator there — so a one-line edit in one
 * checkout silently forks what both sides believe they share. Nothing detected that: each repo's
 * CI lints its own copy and finds it perfectly valid, because a forked spec is still a valid spec.
 *
 * This module is the detector. It is deliberately dumber than a semantic diff: identity, not
 * equivalence. Two specs that mean the same thing but differ in key order or comments are still a
 * fork in the making, because the next person to regenerate from one of them gets a diff nobody
 * asked for. Reordering both copies together is a two-line change; letting them drift is not.
 *
 * It treats the symptom, and should say so: the cure is one source of truth — a package both
 * repos consume, or a third repo — which is a bigger decision than a CI job (see
 * BETTER_TESTS_PLAN.md §11.5). Until that is made, this fails the build on the commit that forks
 * a shared file rather than on the release that ships the mismatch.
 *
 * The frontend mirrors this file. The two are separate copies on purpose: a shared package would
 * itself be a cross-repo dependency, which is the problem rather than the fix. Only `THIS_REPO`
 * differs between them — the file list is identical, so a file added on one side is a one-line
 * copy on the other rather than a translation.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Which of the paired repos a checkout is. */
export type RepoRole = 'backend' | 'frontend';

/**
 * One shared file, named on both sides.
 *
 * Two paths rather than one because identity does not imply a shared location: the seed fixtures
 * are production data here and test scaffolding there, and the generated realtime types are named
 * for their generator here and for their consumer there. A single-path list could not express
 * either, which is why they went unguarded.
 */
export interface SharedFile {
    backend: string;
    frontend: string;
    /**
     * Which side decides what this file says.
     *
     * `backend` means the frontend's copy is an OUTPUT: it is produced here from per-module sources
     * and copied over, so a fork has one correct resolution and `npm run sync:frontend` can apply it
     * without asking. `mirror` means both sides maintain it by hand, so a fork is a question — which
     * copy is right — that no script may answer on its own.
     *
     * Recorded here rather than inferred from the path because it is the difference between a
     * one-command fix and a decision, and getting it wrong overwrites work in the wrong direction.
     */
    owner: 'backend' | 'mirror';
}

/** Which side this checkout is. The one value that differs from the frontend's copy. */
export const THIS_REPO: RepoRole = 'backend';

/** The other side, whichever this one is. */
export const siblingRole = (role: RepoRole): RepoRole =>
    role === 'backend' ? 'frontend' : 'backend';

/**
 * The files that must be identical in both checkouts.
 *
 * The test is not "are these the same today" — a dozen more files happen to match, from favicons
 * to `.prettierrc` — but "does a fork cause a silent bug". Everything here fails quietly: the two
 * sides keep building, keep passing their own suites, and disagree only in production or in a
 * live-API run.
 *
 * `spectral.yaml` is here alongside the specs because it is the ruleset both `lint:openapi` jobs
 * enforce: if the two repos lint the same document under different rules, one of them passes a
 * spec the other would reject.
 *
 * Deliberately NOT here: `public/favicon/*`, `.prettierrc`, `.dockerignore`, `.husky/*`,
 * `.docker/nginx.docs.conf` and `docs/.vitepress/theme/*`. They are identical by convention, not
 * by requirement — either repo may legitimately change its own icon or formatting width, and a
 * gate that fails on that trains people to ignore it.
 *
 * FOUR OF THESE ARE PRODUCED IN THE BACKEND and copied here — the two specs, the demo dataset and
 * the analytics names. Every one of them covers every domain, so every one is produced there from
 * per-module sources: the specs and the analytics names by assembling fragments
 * (`npm run contracts:bundle`), the dataset by seeding a database and reading it back
 * (`npm run seed:export`). For those, "decide which side is right" has one answer: the backend's,
 * because the frontend's copy is an output. Editing the copy is the failure this list is worst at
 * describing and best at catching — the next regeneration reverts it, and the diff looks like the
 * backend broke something.
 */
export const SHARED_FILES: readonly SharedFile[] = [
    /* The contract itself, and the ruleset both sides lint it under. */
    { backend: 'openapi.yaml', frontend: 'openapi.yaml', owner: 'backend' },
    { backend: 'asyncapi.yaml', frontend: 'asyncapi.yaml', owner: 'backend' },
    { backend: 'spectral.yaml', frontend: 'spectral.yaml', owner: 'mirror' },

    /*
     * The realtime types, generated from `asyncapi.yaml` by the shared generator below. Identity
     * here is what proves both sides regenerated after the last spec change: the spec matching
     * while its output does not means one repo is shipping types for a contract it no longer has.
     */
    {
        backend: 'src/types/asyncapi.generated.ts',
        frontend: 'src/types/realtime.generated.ts',
        owner: 'backend'
    },

    /*
     * The demo dataset, as the API actually serves it. `npm run seed:export` seeds a throwaway
     * database with the real seeders and records every row through the real serializers; the
     * frontend's MSW mocks load the result instead of rebuilding it.
     *
     * A fork here is the worst kind: both suites stay green, because each is consistent with its
     * own copy, and the disagreement surfaces only when the real app meets the real API. Different
     * paths on each side (published seed data vs test scaffolding), which is why a same-path check
     * could never have covered it.
     *
     * This used to compare `db/seeds/seed-identities.ts` — a shared file of plain FACTS that each
     * repo then mapped into its own shape. Identical facts could not stop the two MAPPERS from
     * disagreeing, and they did: the frontend's mock hand-wrote `active: true` and `verified: true`
     * to mirror backend schema defaults, and carried no `locale` at all. Comparing the output
     * closes that gap, because there is now only one mapper and it is the API's.
     */
    {
        backend: 'db/seeds/dataset.json',
        frontend: 'tests/support/mocks/dataset.json',
        owner: 'backend'
    },

    /*
     * The three API client collections (`contract.<tool>.*` at the backend's root) are deliberately NOT here.
     * They earned a place in this list when they were written by hand — a hand-maintained
     * restatement of the contract forks the moment an endpoint lands on one side only. They are
     * generated from `openapi.yaml` now, pinned to a fresh generation by the backend's
     * contract-bundles test, and `openapi.yaml` itself is compared above: identical spec plus
     * deterministic generator means a frontend copy could never disagree without the spec
     * disagreeing first. So the frontend holds no copy at all, and the collections live only
     * where they are produced.
     */

    /*
     * The analytics event names both sides emit. The backend sends them to PostHog and this app
     * sends them to its own tracker, and funnels are built ACROSS the two — so a name that exists
     * on one side only, or is spelled differently on each, silently produces two half-events that
     * no dashboard adds up. Nothing else compares them: each repo's suite asserts its own copy and
     * passes. Different paths because the two lint configs disagree on filename case.
     */
    {
        backend: 'src/infrastructure/observability/analytics-events.ts',
        frontend: 'src/infrastructure/analyticsEvents.ts',
        owner: 'backend'
    },

    /*
     * Shared tooling, duplicated rather than packaged for the reason in this file's header. Both
     * are read by CI on both sides, so a fix applied to one copy and not the other is a CI job
     * that behaves differently per repo while claiming to be the same gate.
     *
     * `specIdentity.ts` and `mutationBaseline.ts` are NOT here: they carry per-repo prose (this
     * file names the frontend as its sibling; the frontend's names the backend), so they are
     * mirrors rather than copies.
     */
    {
        backend: 'scripts/check-mutation-baseline.ts',
        frontend: 'scripts/check-mutation-baseline.ts',
        owner: 'mirror'
    },
    {
        backend: 'scripts/gen-asyncapi-types.ts',
        frontend: 'scripts/gen-asyncapi-types.ts',
        owner: 'mirror'
    }
] as const;

export type SpecComparisonStatus = 'match' | 'drift' | 'missing-here' | 'missing-there';

export interface SpecComparison {
    /** This repo's path for the file — what a reader of the failure message has to go open. */
    file: string;
    /** The sibling's path. Equal to `file` for everything but the cross-path pairs. */
    siblingFile: string;
    /** sha256 of this repo's copy, or undefined when the file is absent here. */
    ours?: string;
    /** sha256 of the sibling's copy, or undefined when the file is absent there. */
    theirs?: string;
    status: SpecComparisonStatus;
}

/**
 * sha256 rather than md5: nothing here is adversarial, but a checksum printed in a failure
 * message gets pasted into issues and commit messages, and a deprecated digest in that position
 * invites the question every time.
 */
export const hashFile = (filePath: string): string =>
    createHash('sha256').update(readFileSync(filePath)).digest('hex');

/**
 * Compare every shared file against a sibling checkout.
 *
 * Never throws on a missing file: an absent file is reported as its own status, so the caller can
 * tell "the sibling checkout is not where I looked" (everything `missing-there`) from "someone
 * deleted asyncapi.yaml" (one entry). Those want different messages, and a thrown ENOENT gives
 * neither.
 *
 * @param siblingRoot - absolute path to the other repo's checkout
 * @param here - absolute path to this repo's root; defaults to the working directory
 * @param role - which side `here` is; defaults to this repo's own role
 */
export const compareSharedFiles = (
    siblingRoot: string,
    here: string = process.cwd(),
    role: RepoRole = THIS_REPO
): SpecComparison[] =>
    SHARED_FILES.map((shared) => {
        const file = shared[role];
        const siblingFile = shared[siblingRole(role)];
        const ourPath = path.join(here, file);
        const theirPath = path.join(siblingRoot, siblingFile);

        if (!existsSync(ourPath)) return { file, siblingFile, status: 'missing-here' as const };
        if (!existsSync(theirPath))
            return {
                file,
                siblingFile,
                ours: hashFile(ourPath),
                status: 'missing-there' as const
            };

        const ours = hashFile(ourPath);
        const theirs = hashFile(theirPath);
        return {
            file,
            siblingFile,
            ours,
            theirs,
            status: ours === theirs ? ('match' as const) : ('drift' as const)
        };
    });

/** Every comparison that is not a clean match — i.e. everything worth printing. */
export const sharedFileProblems = (comparisons: SpecComparison[]): SpecComparison[] =>
    comparisons.filter(({ status }) => status !== 'match');

/** How a pair is named in a message: one path, or both when they differ between the repos. */
const describe = ({ file, siblingFile }: SpecComparison): string =>
    file === siblingFile ? file : `${file} ↔ ${siblingFile}`;

/**
 * Render the problems as the message a human needs: which file, which side, and what to do.
 * Returns an empty string when there is nothing wrong, so callers can branch on truthiness.
 */
export const formatSharedFileProblems = (
    comparisons: SpecComparison[],
    siblingRoot: string
): string => {
    const problems = sharedFileProblems(comparisons);
    if (problems.length === 0) return '';

    const lines = problems.map((problem) => {
        switch (problem.status) {
            case 'drift': {
                return (
                    `  ${describe(problem)}: FORKED\n` +
                    `    here    ${problem.ours}\n` +
                    `    sibling ${problem.theirs}`
                );
            }
            case 'missing-here': {
                return `  ${problem.file}: absent from this repo, present in the sibling`;
            }
            default: {
                return `  ${problem.siblingFile}: absent from ${siblingRoot}`;
            }
        }
    });

    return (
        `Shared contract mismatch against ${siblingRoot}:\n${lines.join('\n')}\n\n` +
        `  Both repos must carry byte-identical copies of ${SHARED_FILES.length} files.\n` +
        `  Four of them are PRODUCED IN THE BACKEND from per-module sources:\n` +
        `    cd <backend> && npm run contracts:bundle   # the two specs and the analytics names\n` +
        `    cd <backend> && npm run seed:export        # the demo dataset\n` +
        `  then copy each result to the frontend.\n` +
        `  The rest are hand-maintained on both sides: decide which copy is right and copy it\n` +
        `  over the other. Either way, regenerate in BOTH repos afterwards:\n` +
        `    npm run gen:api && npm run gen:asyncapi`
    );
};
