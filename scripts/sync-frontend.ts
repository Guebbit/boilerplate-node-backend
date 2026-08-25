#!/usr/bin/env tsx
/**
 * Copy every backend-owned shared file into the paired frontend — `npm run sync:frontend`.
 *
 * Three files are produced here and held byte-identical over there, one of them named differently
 * on the other side. The list and the per-side paths both come from `SHARED_FILES`, so a file added
 * there is synced without touching this script.
 *
 * Every shared file is backend-owned, which is why this script may write at all: the frontend's
 * copy is an output, so a difference has one correct resolution. Files the two repos merely keep
 * identical for convenience are not on the list and are nobody's to overwrite.
 *
 * See: docs/tools/pairing-and-ports.md#the-shared-file-list-and-what-earns-a-place-on-it
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { SHARED_FILES, hashFile, THIS_REPO } from './spec-identity';
import { resolveFrontendPath, DEFAULT_FRONTEND_PATH } from './frontend-path';

const dryRun = process.argv.includes('--dry');
const forcedRun = process.argv.includes('--forced');
/* Ignored under `--dry`, which promises to write nothing — over there least of all. */
const regenerate = process.argv.includes('--regen') && !dryRun;

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
    state: 'copied' | 'already-identical' | 'would-copy' | 'missing-here';
}

const outcomes: Outcome[] = SHARED_FILES.map((shared) => {
    const from = path.resolve(process.cwd(), shared[THIS_REPO]);
    const to = path.join(frontendRoot, shared.frontend);

    if (!existsSync(from))
        return { from: shared.backend, to: shared.frontend, state: 'missing-here' };

    if (!forcedRun && existsSync(to) && hashFile(from) === hashFile(to))
        return { from: shared.backend, to: shared.frontend, state: 'already-identical' };

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

console.info(
    moved.length === 0
        ? `[sync] Every backend-owned file already matches ${frontendRoot}.`
        : `[sync] ${dryRun ? 'Would copy' : 'Copied'} ${moved.length} file(s) to ${frontendRoot}:\n${list(moved)}`
);

/*
 * Both repos generate typed clients FROM the files just copied, and those outputs live only in
 * their own repo — so the frontend is not in sync until it has regenerated. Left undone, it ships a
 * client for the previous contract, which type-checks over there and announces nothing.
 *
 * `--regen` does it; without the flag the commands are named, because leaving it to memory is how
 * the gap opens in the first place.
 */
if (moved.length > 0 && regenerate) {
    console.info(`\n[sync] Regenerating in ${frontendRoot} — npm run regenerate`);
    try {
        /*
         * Inherited stdio, deliberately: this is another repo's build talking, and summarising it
         * would hide the one thing a reader needs — which of ITS steps failed. `cwd` is the only
         * thing that makes this the frontend's npm rather than this repo's.
         */
        execFileSync('npm', ['run', 'regenerate'], { cwd: frontendRoot, stdio: 'inherit' });
    } catch {
        fail(
            `\n[sync] The files were copied, but ${frontendRoot} failed to regenerate.\n` +
                `  That repo's build, not this one's — check its dependencies are installed.\n` +
                `  The copy stands; finish by hand over there:\n` +
                `    cd ${frontendRoot}\n` +
                `    npm run regenerate\n` +
                `    npm run check:spec-identity`
        );
    }
} else if (moved.length > 0 && !dryRun)
    console.info(
        `\n[sync] Now regenerate over there, or the frontend ships a client for the old contract:\n` +
            `    cd ${frontendRoot}\n` +
            `    npm run regenerate       # orval + asyncapi types, from the files just copied\n` +
            `    npm run check:spec-identity\n` +
            `  Or re-run this with --regen to have it done for you.`
    );

/*
 * A copied file that still hashes differently means something rewrote it mid-run.
 *
 * Placed AFTER the regeneration step on purpose, so it covers that too: the frontend's `regenerate`
 * ends in `prettier:fix`, and a shared document reformatted by it would fork the two repos while
 * every check on this side still passed. Its `.prettierignore` excludes the REST contract for
 * exactly that reason — this is what would notice if that ever stopped being true.
 */
if (!dryRun)
    for (const shared of SHARED_FILES) {
        const from = path.resolve(process.cwd(), shared[THIS_REPO]);
        const to = path.join(frontendRoot, shared.frontend);
        if (readFileSync(from).equals(readFileSync(to))) continue;
        fail(
            `[sync] ${shared.frontend} still differs after copying.\n` +
                (regenerate
                    ? `  Nothing but the regeneration ran in between — check that repo's` +
                      ` .prettierignore still excludes it.`
                    : `  Nothing else should write it.`)
        );
    }
