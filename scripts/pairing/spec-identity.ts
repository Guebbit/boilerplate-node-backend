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
 * The frontend carries the same list and the same comparison, so a file added on one side is a
 * one-line copy on the other. It is not the same file: `THIS_REPO` differs, and it exports a
 * `fingerprint` this repo has no use for — it pairs with either backend twin, which do not
 * serialise YAML identically.
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
 * Membership rule:  NECESSITY — a fork of the file would break something silently.
 * Every entry:      PRODUCED in this repo and copied to the frontend, so "which side is right"
 *                   has one answer, and `sync:frontend` applies it.
 * Not members:      files both repos merely keep identical for convenience, and anything either
 *                   repo can regenerate from a file already listed.
 *
 * The reasoning and the excluded files: docs/tools/pairing-and-ports.md#the-shared-file-list-and-what-earns-a-place-on-it
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
    { backend: 'asyncapi.public.yaml', frontend: 'asyncapi.yaml' },
    /*
     * The authorization keys, read here only for `actions:` — `gen:api` turns that list into
     * `<frontend>/contracts/permission-actions.ts`, so the frontend's `PermissionAction` cannot drift from the
     * vocabulary the backend enforces.
     */
    { backend: 'shared/authorization-keys.yaml', frontend: 'contracts/authorization-keys.yaml' },
    /*
     * The demo webhook sink's TLS pair. The backend trusts the CA (the dev preload), the
     * frontend's Cypress sink serves the leaf and its key: a fork between them fails every demo
     * delivery at the handshake, and nothing in either suite would say why.
     */
    {
        backend: 'scenarios/support/tls/webhook-sink-ca.pem',
        frontend: 'scripts/e2e/tls/webhook-sink-ca.pem'
    },
    {
        backend: 'scenarios/support/tls/webhook-sink-cert.pem',
        frontend: 'scripts/e2e/tls/webhook-sink-cert.pem'
    },
    {
        backend: 'scenarios/support/tls/webhook-sink-key.pem',
        frontend: 'scripts/e2e/tls/webhook-sink-key.pem'
    }
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

/** What comparing one shared file found. */
export type SpecComparisonStatus = 'match' | 'drift' | 'missing-here' | 'missing-there';

/** The result of comparing one shared file here and in the paired frontend. */
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
