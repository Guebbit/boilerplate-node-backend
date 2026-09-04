/**
 * The cross-repo contract check.
 *
 * A set of files exists in BOTH this repo and the paired frontend, byte-for-byte identical.
 * Codegen on both sides reads the specs among them, so a one-line edit in one checkout silently
 * forks what both sides believe they share — and neither CI notices, because a forked spec is
 * still a valid spec.
 *
 * Deliberately dumber than a semantic diff: IDENTITY, not equivalence. Two specs that mean the same
 * thing but differ in key order are still a fork in the making.
 *
 * The frontend mirrors this file; only `THIS_REPO` differs, so a file added on one side is a
 * one-line copy on the other.
 *
 * See: docs/tools/pairing-and-ports.md#the-shared-file-list-and-what-earns-a-place-on-it
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Which of the paired repos a checkout is. */
export type RepoRole = 'backend' | 'frontend';

/**
 * One shared file, named on both sides.
 *
 * Two paths rather than one because identity does not imply a shared location: `asyncapi.yaml` is
 * published here in full and lands there as its public half. A single-path list could not express
 * that, which is why it went unguarded.
 */
export interface SharedFile {
    backend: string;
    frontend: string;
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
 * EVERY ENTRY IS PRODUCED IN THIS REPO and copied to the frontend, which is what makes a fork
 * answerable: the frontend's copy is an OUTPUT, so "which side is right" has one answer, and
 * `sync:frontend` applies it. Editing the copy is the failure this list is worst at describing and
 * best at catching — the next regeneration reverts it, and the diff looks like the backend broke
 * something. `asyncapi.public.yaml` is the one whose name differs on arrival: it lands as the
 * frontend's `asyncapi.yaml`, because the shared subset is the whole of the async contract as far
 * as that repo is concerned.
 *
 * That is the whole membership rule, and it is narrower than it once was. Files the two repos keep
 * identical FOR CONVENIENCE used to be here under an `owner: 'mirror'` flag — `spectral.yaml` and
 * three shared scripts — hand-maintained on both sides, so a fork was a question no script could
 * answer and the gate could only report it. Convenience is not necessity: nothing silently breaks
 * when two repos lint under rulesets that have drifted apart, or when one holds a newer test
 * reporter. They were removed rather than kept as a flag with one member, and the flag with them.
 *
 * Also deliberately absent, for the same reason: `public/favicon/*`, `.prettierrc`,
 * `.dockerignore`, `.husky/*`, `.docker/nginx.docs.conf` and `docs/.vitepress/theme/*`. Identical
 * by convention, and a gate that fails on an icon trains people to ignore it.
 *
 * Nothing either repo can REGENERATE from a file already here belongs here either. Such a copy
 * carries no fact the list does not already compare, and every entry costs a manual step per
 * contract change. The generated realtime types and the `contract.<tool>.*` collections are out for
 * that reason; each is guarded by a freshness check inside its own repo.
 */
export const SHARED_FILES: readonly SharedFile[] = [
    /* The contract itself. */
    { backend: 'openapi.yaml', frontend: 'openapi.yaml' },
    /*
     * The async contract, in its SHARED half only. `asyncapi.yaml` here holds every channel this
     * service has, queues included; `asyncapi.public.yaml` is the same document minus the sections
     * an API client cannot reach, and it is that subset the frontend receives as its own
     * `asyncapi.yaml`. Both come out of one set of section documents, so the two bundles cannot
     * describe a shared channel differently — see `scripts/contracts/asyncapi-bundles.ts`.
     */
    { backend: 'asyncapi.public.yaml', frontend: 'asyncapi.yaml' }
    /*
     * `src/types/asyncapi.generated.ts` is deliberately absent: an OUTPUT whose every input is
     * already compared, and the two are not meant to match — this repo's carries the queue
     * payloads. It is also gitignored and never committed — postinstall and the pre-commit hook
     * both regenerate it before anything else runs, so there is nothing left to go stale for a
     * check to catch.
     */

    /*
     * The `contract.<tool>.*` collections are deliberately absent: generated from `openapi.yaml`,
     * which is compared above, so the frontend holds no copy at all.
     */
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
        `  Both repos carry byte-identical copies of ${SHARED_FILES.length} files, and EVERY ONE\n` +
        `  is produced in the backend from per-module sources — so this never needs a decision\n` +
        `  about which copy is right. The frontend's is an output. Rebuild it and hand it over:\n` +
        `    cd <backend> && npm run contracts:bundle   # the shared specs\n` +
        `    cd <backend> && npm run sync:frontend      # copies them across\n` +
        `  Then regenerate each repo's OWN outputs, which are not shared and not copied:\n` +
        `    npm run gen:api && npm run gen:asyncapi`
    );
};
