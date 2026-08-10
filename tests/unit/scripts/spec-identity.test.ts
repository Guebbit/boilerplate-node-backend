/**
 * `scripts/specIdentity.ts` — the cross-repo contract check.
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
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
    SHARED_SPEC_FILES,
    compareSpecs,
    formatSpecProblems,
    hashFile,
    specProblems
} from '../../../scripts/specIdentity';
import { resolveFrontendPath } from '../../../scripts/frontendPath';

/** Builds a throwaway repo root holding the named files with the given contents. */
const makeRoot = (files: Record<string, string>): string => {
    const root = mkdtempSync(path.join(tmpdir(), 'spec-identity-'));
    for (const [name, contents] of Object.entries(files)) {
        mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
        writeFileSync(path.join(root, name), contents);
    }
    return root;
};

const allSpecs = (suffix = '') =>
    Object.fromEntries(SHARED_SPEC_FILES.map((file) => [file, `${file} contents${suffix}`]));

const roots: string[] = [];
const root = (files: Record<string, string>) => {
    const created = makeRoot(files);
    roots.push(created);
    return created;
};

afterAll(() => {
    for (const created of roots) rmSync(created, { recursive: true, force: true });
});

describe('compareSpecs', () => {
    it('reports every shared file as matching when the two copies are identical', () => {
        const here = root(allSpecs());
        const there = root(allSpecs());

        const comparisons = compareSpecs(there, here);

        expect(comparisons).toHaveLength(SHARED_SPEC_FILES.length);
        expect(comparisons.every(({ status }) => status === 'match')).toBe(true);
        expect(specProblems(comparisons)).toEqual([]);
    });

    it('reports a one-byte difference as a fork', () => {
        // The whole point: a spec that still parses, still lints, and no longer agrees.
        const here = root(allSpecs());
        const there = root({ ...allSpecs(), 'openapi.yaml': 'openapi.yaml contents ' });

        const comparisons = compareSpecs(there, here);
        const drifted = comparisons.filter(({ status }) => status === 'drift');

        expect(drifted.map(({ file }) => file)).toEqual(['openapi.yaml']);
        expect(drifted[0]?.ours).not.toBe(drifted[0]?.theirs);
    });

    it('names spectral.yaml too, not only the two specs', () => {
        // The ruleset is as shared as the documents it lints — see the note in specIdentity.ts.
        const here = root(allSpecs());
        const there = root({ ...allSpecs(), 'spectral.yaml': 'different rules' });

        expect(specProblems(compareSpecs(there, here)).map(({ file }) => file)).toEqual([
            'spectral.yaml'
        ]);
    });

    it('distinguishes a missing sibling checkout from a forked contract', () => {
        // Every file `missing-there` is what an unchecked-out sibling looks like, and it wants a
        // different message from "your specs disagree". Reported, never thrown.
        const here = root(allSpecs());
        const there = root({});

        const comparisons = compareSpecs(there, here);

        expect(comparisons.every(({ status }) => status === 'missing-there')).toBe(true);
        expect(comparisons.every(({ theirs }) => theirs === undefined)).toBe(true);
    });

    it('reports a file deleted on this side', () => {
        const here = root({ 'openapi.yaml': 'a', 'asyncapi.yaml': 'b' });
        const there = root(allSpecs());

        const comparisons = compareSpecs(there, here);

        expect(comparisons.find(({ file }) => file === 'spectral.yaml')?.status).toBe(
            'missing-here'
        );
    });

    it('does not throw when neither side has anything', () => {
        expect(() => compareSpecs(root({}), root({}))).not.toThrow();
    });
});

describe('hashFile', () => {
    it('gives identical contents the same digest and different contents a different one', () => {
        const a = root({ 'openapi.yaml': 'same' });
        const b = root({ 'openapi.yaml': 'same' });
        const c = root({ 'openapi.yaml': 'other' });

        expect(hashFile(path.join(a, 'openapi.yaml'))).toBe(hashFile(path.join(b, 'openapi.yaml')));
        expect(hashFile(path.join(a, 'openapi.yaml'))).not.toBe(
            hashFile(path.join(c, 'openapi.yaml'))
        );
    });
});

describe('formatSpecProblems', () => {
    it('says nothing when there is nothing wrong', () => {
        const here = root(allSpecs());
        const there = root(allSpecs());

        expect(formatSpecProblems(compareSpecs(there, here), there)).toBe('');
    });

    it('names the forked file and both digests', () => {
        const here = root(allSpecs());
        const there = root({ ...allSpecs(), 'asyncapi.yaml': 'forked' });

        const message = formatSpecProblems(compareSpecs(there, here), there);

        expect(message).toContain('asyncapi.yaml');
        expect(message).toContain('FORKED');
        // Both digests, so the message can be pasted into an issue and mean something later.
        expect(message).toContain(hashFile(path.join(here, 'asyncapi.yaml')));
        expect(message).toContain(hashFile(path.join(there, 'asyncapi.yaml')));
    });

    it('tells the reader what to do about it', () => {
        const here = root(allSpecs());
        const there = root({ ...allSpecs(), 'openapi.yaml': 'forked' });

        expect(formatSpecProblems(compareSpecs(there, here), there)).toContain('npm run genapi');
    });
});

/*
 * The live pair. Conditional, and loud about being conditional — see the file header.
 */
const siblingRoot = resolveFrontendPath();
const describeIfSibling = existsSync(siblingRoot) ? describe : describe.skip;

describeIfSibling(`the paired frontend at ${siblingRoot}`, () => {
    it('carries byte-identical copies of every shared contract file', () => {
        const comparisons = compareSpecs(siblingRoot);

        expect(formatSpecProblems(comparisons, siblingRoot)).toBe('');
    });
});
