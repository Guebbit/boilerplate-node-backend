/**
 * `scripts/spec-identity.ts` — the cross-repo contract check.
 *
 * Two separate things are worth testing here, and only one of them is the comparison logic:
 *
 *  1. **The logic**, against fixtures on a temp directory. It has to work when the sibling
 *     checkout is absent, which is the state of every CI runner that has not checked it out and
 *     of every copy of this boilerplate cloned on its own — so it is driven against synthetic
 *     roots rather than the real neighbouring repo. A test that needed the sibling present would
 *     be the one thing that cannot run where the check matters most.
 *
 *  2. **The real pair**, when the sibling actually is beside this checkout. That case is
 *     conditional on purpose: it is the live assertion that the two repos agree today, and it is
 *     the only one that would notice a fork introduced by hand. Where the sibling is missing it
 *     reports as skipped rather than passing quietly, because a check that silently evaporates is
 *     worse than one that is visibly absent.
 *
 * The fixtures are built from `SHARED_FILES` rather than from a hardcoded list, so a file added
 * to the check is covered by every case below without touching this file — and, more to the
 * point, cannot be added *without* being covered.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
    SHARED_FILES,
    THIS_REPO,
    siblingRole,
    compareSharedFiles,
    formatSharedFileProblems,
    hashFile,
    sharedFileProblems,
    type RepoRole
} from '../../../scripts/spec-identity';
import { resolveFrontendPath } from '../../../scripts/frontend-path';

/** Builds a throwaway repo root holding the named files with the given contents. */
const makeRoot = (files: Record<string, string>): string => {
    const root = mkdtempSync(path.join(tmpdir(), 'spec-identity-'));
    for (const [name, contents] of Object.entries(files)) {
        mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
        writeFileSync(path.join(root, name), contents);
    }
    return root;
};

/**
 * Every shared file as one side spells it, with contents keyed by the pair's *index*.
 *
 * Indexed rather than named because the two sides do not agree on names: the seed identities live
 * at different paths, so contents keyed by path would differ between the repos and every pair
 * would read as forked. What must match is the bytes, not the filename.
 */
const sharedFiles = (role: RepoRole, suffix = ''): Record<string, string> =>
    Object.fromEntries(
        SHARED_FILES.map((shared, index) => [shared[role], `shared-${index} contents${suffix}`])
    );

/**
 * The three contract files, as named constants, spelled the way THIS repo spells them.
 *
 * Declared rather than written inline because a filename is not an identifier: `'openapi.yaml'` as
 * a literal object key trips the naming-convention lint rule in every fixture, while a computed
 * key built from a variable does not. `sharedFilesWith` and `withoutFile` exist for the same
 * reason — they are the only two shapes a fixture needs.
 *
 * Only two of them are same-path: the async contract is `asyncapi.public.yaml` here and
 * `asyncapi.yaml` in the frontend, so it can key a fixture on THIS side only. Fixtures that need
 * to write the sibling's copy use `CROSS_PATH` instead.
 */
const OPENAPI = 'openapi.yaml';
const ASYNCAPI = 'asyncapi.public.yaml';
const SPECTRAL = 'spectral.yaml';

/** `sharedFiles(role)` with one entry replaced. */
const sharedFilesWith = (
    role: RepoRole,
    file: string,
    contents: string
): Record<string, string> => ({ ...sharedFiles(role), [file]: contents });

/** `sharedFiles(role)` with one entry removed. */
const withoutFile = (role: RepoRole, file: string): Record<string, string> => {
    const files = sharedFiles(role);
    delete files[file];
    return files;
};

const HERE: RepoRole = 'backend';
const THERE: RepoRole = 'frontend';

/** A pair whose paths differ between the repos — the case a same-path check could not express. */
const CROSS_PATH = SHARED_FILES.find(({ backend, frontend }) => backend !== frontend)!;

const roots: string[] = [];
const root = (files: Record<string, string>) => {
    const created = makeRoot(files);
    roots.push(created);
    return created;
};

afterAll(() => {
    for (const created of roots) rmSync(created, { recursive: true, force: true });
});

describe('SHARED_FILES', () => {
    it('names this repo as the backend', () => {
        // The one value that differs from the frontend's copy of the module. If it were wrong,
        // every cross-path pair would be compared against the wrong filename and report missing.
        expect(THIS_REPO).toBe('backend');
        expect(siblingRole(THIS_REPO)).toBe('frontend');
    });

    it('covers the contract, the demo dataset and the analytics names', () => {
        const backendPaths = new Set(SHARED_FILES.map(({ backend }) => backend));

        expect(backendPaths).toContain(OPENAPI);
        expect(backendPaths).toContain(ASYNCAPI);
        expect(backendPaths).toContain(SPECTRAL);
        // The two that went unguarded until the list could hold differing paths.
        expect(backendPaths).toContain('db/demo/demo-data.json');
        expect(backendPaths).toContain(
            'src/infrastructure/observability/analytics-events.frontend.ts'
        );
    });

    it('excludes anything either repo regenerates from a file already in the list', () => {
        // A generated output carries no fact the list does not compare already: the shared half of
        // the spec is compared, and so is the generator that reads it. Listing an output buys
        // nothing and costs a manual copy per contract change, so `check:asyncapi-types` guards it
        // inside each repo instead — which is also the only workable answer now that the two
        // outputs legitimately differ, this repo's carrying the queue payloads the frontend's does
        // not.
        const backendPaths = new Set(SHARED_FILES.map(({ backend }) => backend));

        expect(backendPaths).not.toContain('src/types/asyncapi.generated.ts');
    });

    it('holds at least one pair whose paths differ between the repos', () => {
        // Guards the reason the list is pairs at all: if this ever became empty, the structure
        // could quietly collapse back to single names and the demo dataset would fall out.
        expect(CROSS_PATH).toBeDefined();
        expect(CROSS_PATH.backend).not.toBe(CROSS_PATH.frontend);
    });

    it('lists no file twice on either side', () => {
        const backendPaths = SHARED_FILES.map(({ backend }) => backend);
        const frontendPaths = SHARED_FILES.map(({ frontend }) => frontend);

        expect(new Set(backendPaths).size).toBe(backendPaths.length);
        expect(new Set(frontendPaths).size).toBe(frontendPaths.length);
    });
});

describe('compareSharedFiles', () => {
    it('reports every shared file as matching when the two copies are identical', () => {
        // Note the two roots are built with DIFFERENT path sets — backend spelling here, frontend
        // spelling there — which is the whole point of the pair structure.
        const here = root(sharedFiles(HERE));
        const there = root(sharedFiles(THERE));

        const comparisons = compareSharedFiles(there, here, HERE);

        expect(comparisons).toHaveLength(SHARED_FILES.length);
        expect(comparisons.every(({ status }) => status === 'match')).toBe(true);
        expect(sharedFileProblems(comparisons)).toEqual([]);
    });

    it('matches a cross-path pair across its two different names', () => {
        // `asyncapi.public.yaml` here, `asyncapi.yaml` there; `db/demo/demo-data.json` here,
        // `tests/support/mocks/demo-data.json` there.
        const here = root(sharedFiles(HERE));
        const there = root(sharedFiles(THERE));

        const comparison = compareSharedFiles(there, here, HERE).find(
            ({ file }) => file === CROSS_PATH.backend
        );

        expect(comparison?.status).toBe('match');
        expect(comparison?.siblingFile).toBe(CROSS_PATH.frontend);
    });

    it('reports a cross-path pair as forked when only one side changed', () => {
        // The bug these pairs exist to catch: a contract or a seed fixture edited in one repo only.
        // Both suites stay green — each is consistent with its own copy — and only this notices.
        const here = root(sharedFiles(HERE));
        const there = root({
            ...sharedFiles(THERE),
            [CROSS_PATH.frontend]: 'edited on one side only'
        });

        const drifted = compareSharedFiles(there, here, HERE).filter(
            ({ status }) => status === 'drift'
        );

        expect(drifted.map(({ file }) => file)).toEqual([CROSS_PATH.backend]);
    });

    it('reports a one-byte difference as a fork', () => {
        // The whole point: a spec that still parses, still lints, and no longer agrees.
        const here = root(sharedFiles(HERE));
        const there = root(sharedFilesWith(THERE, OPENAPI, 'shared-0 contents '));

        const drifted = compareSharedFiles(there, here, HERE).filter(
            ({ status }) => status === 'drift'
        );

        expect(drifted.map(({ file }) => file)).toEqual([OPENAPI]);
        expect(drifted[0]?.ours).not.toBe(drifted[0]?.theirs);
    });

    it('names spectral.yaml too, not only the two specs', () => {
        // The ruleset is as shared as the documents it lints — see the note in spec-identity.ts.
        const here = root(sharedFiles(HERE));
        const there = root(sharedFilesWith(THERE, SPECTRAL, 'different rules'));

        expect(
            sharedFileProblems(compareSharedFiles(there, here, HERE)).map(({ file }) => file)
        ).toEqual([SPECTRAL]);
    });

    it('distinguishes a missing sibling checkout from a forked contract', () => {
        // Every file `missing-there` is what an unchecked-out sibling looks like, and it wants a
        // different message from "your specs disagree". Reported, never thrown.
        const here = root(sharedFiles(HERE));
        const there = root({});

        const comparisons = compareSharedFiles(there, here, HERE);

        expect(comparisons.every(({ status }) => status === 'missing-there')).toBe(true);
        expect(comparisons.every(({ theirs }) => theirs === undefined)).toBe(true);
    });

    it('reports a file deleted on this side', () => {
        const here = root(withoutFile(HERE, SPECTRAL));
        const there = root(sharedFiles(THERE));

        const comparisons = compareSharedFiles(there, here, HERE);

        expect(comparisons.find(({ file }) => file === SPECTRAL)?.status).toBe('missing-here');
    });

    it('does not throw when neither side has anything', () => {
        expect(() => compareSharedFiles(root({}), root({}), HERE)).not.toThrow();
    });
});

describe('hashFile', () => {
    it('gives identical contents the same digest and different contents a different one', () => {
        const a = root({ [OPENAPI]: 'same' });
        const b = root({ [OPENAPI]: 'same' });
        const c = root({ [OPENAPI]: 'other' });

        expect(hashFile(path.join(a, OPENAPI))).toBe(hashFile(path.join(b, OPENAPI)));
        expect(hashFile(path.join(a, OPENAPI))).not.toBe(hashFile(path.join(c, OPENAPI)));
    });
});

describe('formatSharedFileProblems', () => {
    it('says nothing when there is nothing wrong', () => {
        const here = root(sharedFiles(HERE));
        const there = root(sharedFiles(THERE));

        expect(formatSharedFileProblems(compareSharedFiles(there, here, HERE), there)).toBe('');
    });

    it('names the forked file and both digests', () => {
        // A same-path pair, so one constant names the file in both roots. The cross-path case has
        // its own test below.
        const here = root(sharedFiles(HERE));
        const there = root(sharedFilesWith(THERE, OPENAPI, 'forked'));

        const message = formatSharedFileProblems(compareSharedFiles(there, here, HERE), there);

        expect(message).toContain(OPENAPI);
        expect(message).toContain('FORKED');
        // Both digests, so the message can be pasted into an issue and mean something later.
        expect(message).toContain(hashFile(path.join(here, OPENAPI)));
        expect(message).toContain(hashFile(path.join(there, OPENAPI)));
    });

    it('names both paths when a cross-path pair forks', () => {
        // "demo-data.json is forked" would send the reader to one of two files with no way to
        // tell which repo the other one is in.
        const here = root(sharedFiles(HERE));
        const there = root({ ...sharedFiles(THERE), [CROSS_PATH.frontend]: 'forked' });

        const message = formatSharedFileProblems(compareSharedFiles(there, here, HERE), there);

        expect(message).toContain(CROSS_PATH.backend);
        expect(message).toContain(CROSS_PATH.frontend);
    });

    it('tells the reader what to do about it', () => {
        const here = root(sharedFiles(HERE));
        const there = root(sharedFilesWith(THERE, OPENAPI, 'forked'));
        const message = formatSharedFileProblems(compareSharedFiles(there, here, HERE), there);

        expect(message).toContain('npm run gen:api');
        // Four of the eight are assembled from per-module fragments in the backend, so "copy
        // whichever side is right" is the wrong instruction for them: the fix is to re-bundle
        // there and copy the result. A message that omitted that invites a hand-edit the next
        // `contracts:bundle` silently reverts.
        expect(message).toContain('npm run contracts:bundle');
    });
});

/*
 * The live pair.
 *
 * Conditional on the sibling being checked out, because a clone with only this repo is a normal
 * way to work — but NOT silently. A `describe.skip` reads as green, and the one guard that would
 * have caught a forked contract is exactly the guard nobody notices going missing.
 *
 * So the absence is asserted rather than assumed: locally it says so out loud, and under `CI` it
 * fails, because a pipeline that checks out one half of a pair and reports success on the shared
 * contract is reporting something it did not check.
 */
const siblingRoot = resolveFrontendPath();
const siblingPresent = existsSync(siblingRoot);

describe(`the paired frontend at ${siblingRoot}`, () => {
    it('is checked out, or this suite is knowingly incomplete', () => {
        if (siblingPresent) return;

        const message = `Shared-contract checks skipped: no sibling repo at ${siblingRoot}.`;
        // eslint-disable-next-line no-console -- the skip warning must reach a terminal that has no logger configured
        if (!process.env.CI) console.warn(`⚠️  ${message}`);
        expect(process.env.CI ? message : '').toBe('');
    });

    (siblingPresent ? it : it.skip)('carries byte-identical copies of every shared file', () => {
        const comparisons = compareSharedFiles(siblingRoot);

        expect(formatSharedFileProblems(comparisons, siblingRoot)).toBe('');
    });
});
