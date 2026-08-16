#!/usr/bin/env tsx
/**
 * Copy every backend-owned shared file into the paired frontend — `npm run sync:frontend`.
 *
 * ## What this replaces
 *
 * Four files are produced here and held byte-identical over there. Moving them was a manual
 * copy-paste of four paths, two of which are named differently on the other side — which is exactly
 * the kind of chore that gets done four times out of five. `npm run check:spec-identity` then fails
 * on the fifth, usually a day later, and reads like the contract broke.
 *
 * This does not make the copies safer to skip; it makes them impossible to get wrong. The list, the
 * per-side paths and the ownership all come from `SHARED_FILES`, so a file added there is synced
 * without touching this script.
 *
 * ## Why it refuses to run on stale sources
 *
 * Copying a stale bundle is worse than not copying: both repos then agree on a document neither
 * one's sources produce, and `check:contracts-bundle` fails HERE while `check:spec-identity` passes.
 * So the staleness gates run first and a failure stops the sync with the command that fixes it.
 *
 * ## Why `mirror` files are reported and never written
 *
 * `spectral.yaml` and the two shared scripts are maintained by hand on BOTH sides. A fork in one of
 * those is a question — which copy is right — and answering it by overwriting whichever direction a
 * script happens to run in is how work gets silently reverted. They are listed as differing and left
 * alone.
 *
 * Usage:
 *   npm run sync:frontend            # copy what changed, report what needs a decision
 *   npm run sync:frontend -- --dry   # say what would be copied, write nothing
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { SHARED_FILES, hashFile, THIS_REPO } from './specIdentity';
import { resolveFrontendPath, DEFAULT_FRONTEND_PATH } from './frontendPath';

const dryRun = process.argv.includes('--dry');

const fail = (message: string): never => {
    console.error(message);
    process.exit(1);
};

/* ── The sibling checkout ─────────────────────────────────────────────────────────────────────── */

const frontendRoot = resolveFrontendPath();

if (!existsSync(frontendRoot))
    fail(
        `[sync] No checkout found at ${frontendRoot}.\n` +
            `  Expected the frontend beside this repo (${DEFAULT_FRONTEND_PATH}), or FRONTEND_PATH set in .env.`
    );

/* ── Never copy something this repo has not rebuilt ───────────────────────────────────────────── */

/**
 * The gates that prove every backend-owned file matches the sources it is built from.
 *
 * Run before a single byte moves, because the whole point of the copy is that the frontend receives
 * what this repo's sources say — not what was left on disk after someone edited a module and did
 * not re-bundle.
 */
const STALENESS_GATES = [
    { label: 'the contract bundles', argv: ['scripts/bundle-contracts.ts', '--check'] },
    { label: 'the demo dataset', argv: ['scripts/export-seed.ts', '--check'] }
] as const;

for (const gate of STALENESS_GATES) {
    try {
        execFileSync('npx', ['tsx', ...gate.argv], { stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (error) {
        const details = (error as { stderr?: Buffer; stdout?: Buffer }).stderr?.toString() ?? '';
        fail(
            `[sync] Refusing to copy: ${gate.label} do not match their sources.\n` +
                details.trimEnd() +
                `\n  Nothing was written. Rebuild first, then run this again.`
        );
    }
}

/* ── The copy ─────────────────────────────────────────────────────────────────────────────────── */

interface Outcome {
    from: string;
    to: string;
    state: 'copied' | 'already-identical' | 'would-copy' | 'missing-here' | 'needs-a-decision';
}

const outcomes: Outcome[] = SHARED_FILES.map((shared) => {
    const from = path.resolve(process.cwd(), shared[THIS_REPO]);
    const to = path.join(frontendRoot, shared.frontend);

    if (!existsSync(from))
        return { from: shared.backend, to: shared.frontend, state: 'missing-here' };

    const identical = existsSync(to) && hashFile(from) === hashFile(to);
    if (identical) return { from: shared.backend, to: shared.frontend, state: 'already-identical' };

    // A hand-maintained mirror that differs is a question, not a chore. Say so; write nothing.
    if (shared.owner === 'mirror')
        return { from: shared.backend, to: shared.frontend, state: 'needs-a-decision' };

    if (dryRun) return { from: shared.backend, to: shared.frontend, state: 'would-copy' };

    mkdirSync(path.dirname(to), { recursive: true });
    copyFileSync(from, to);
    return { from: shared.backend, to: shared.frontend, state: 'copied' };
});

/* ── The report ───────────────────────────────────────────────────────────────────────────────── */

const of = (state: Outcome['state']): Outcome[] => outcomes.filter((item) => item.state === state);

const list = (items: Outcome[]): string =>
    items.map(({ from, to }) => `    ${from}\n      -> ${to}`).join('\n');

const missing = of('missing-here');
if (missing.length > 0)
    fail(
        `[sync] These are declared shared but do not exist here:\n${list(missing)}\n` +
            `  Either build them or remove them from SHARED_FILES.`
    );

const moved = [...of('copied'), ...of('would-copy')];
const decisions = of('needs-a-decision');

console.info(
    moved.length === 0
        ? `[sync] Every backend-owned file already matches ${frontendRoot}.`
        : `[sync] ${dryRun ? 'Would copy' : 'Copied'} ${moved.length} file(s) to ${frontendRoot}:\n${list(moved)}`
);

if (decisions.length > 0)
    console.info(
        `\n[sync] ${decisions.length} hand-maintained file(s) differ and were NOT touched:\n` +
            list(decisions) +
            `\n  Both repos maintain these. Decide which copy is right and move it yourself.`
    );

/*
 * The one thing this cannot do for you. Both repos generate typed clients FROM the files just
 * copied, and those outputs live only in their own repo — so the frontend is not in sync until it
 * has regenerated. Naming the commands beats leaving it to memory.
 */
if (moved.length > 0 && !dryRun)
    console.info(
        `\n[sync] Now regenerate over there, or the frontend ships a client for the old contract:\n` +
            `    cd ${frontendRoot}\n` +
            `    npm run gen:api          # orval, from openapi.yaml\n` +
            `    npm run check:spec-identity`
    );

/* A copied file that still hashes differently means something rewrote it mid-run. */
if (!dryRun)
    for (const shared of SHARED_FILES.filter((item) => item.owner === 'backend')) {
        const from = path.resolve(process.cwd(), shared[THIS_REPO]);
        const to = path.join(frontendRoot, shared.frontend);
        if (readFileSync(from).equals(readFileSync(to))) continue;
        fail(
            `[sync] ${shared.frontend} still differs after copying. Nothing else should write it.`
        );
    }
