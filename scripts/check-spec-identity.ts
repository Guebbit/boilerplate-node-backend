#!/usr/bin/env tsx
/**
 * CLI for the cross-repo contract check — `npm run check:spec-identity`.
 *
 * Wired into `ci.yml` (which checks out the sibling repo first) and available locally, where the
 * sibling is the neighbouring directory the paired setup already assumes.
 *
 * Exit codes are the interface: 0 when the contracts are identical, 1 when they have forked or a
 * file is missing, 2 when the sibling checkout could not be found at all. The last one is
 * separated because it is an environment problem rather than a contract problem, and a copy of
 * this boilerplate cloned on its own should say "I cannot see the other repo", not "your specs
 * have drifted".
 */
import { existsSync } from 'node:fs';
import { DEFAULT_FRONTEND_PATH, resolveFrontendPath } from './frontendPath';
import {
    compareSharedFiles,
    formatSharedFileProblems,
    SHARED_FILES,
    THIS_REPO
} from './specIdentity';

const siblingRoot = resolveFrontendPath();

if (!existsSync(siblingRoot)) {
    console.error(
        `\n[spec-identity] No checkout found at ${siblingRoot}.\n` +
            `  This check compares ${SHARED_FILES.length} shared files against the paired frontend.\n` +
            `  Clone it beside this repo as ${DEFAULT_FRONTEND_PATH}, or point FRONTEND_PATH at it.\n`
    );
    process.exit(2);
}

const comparisons = compareSharedFiles(siblingRoot);
const problems = formatSharedFileProblems(comparisons, siblingRoot);

if (problems) {
    console.error(`\n[spec-identity] ${problems}\n`);
    process.exit(1);
}

console.log(
    `[spec-identity] ${SHARED_FILES.length} shared files identical to ${siblingRoot} (as ${THIS_REPO}).`
);
