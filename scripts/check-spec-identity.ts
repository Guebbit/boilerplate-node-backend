#!/usr/bin/env tsx
/**
 * CLI for the cross-repo contract check — `npm run check:spec-identity`.
 *
 * Wired into `ci.yml` (which checks the sibling out first and passes `FRONTEND_PATH`) and into
 * `npm run complete`. The frontend mirrors this file.
 *
 * Exit codes are the interface:
 *   0  identical — or the sibling is absent and this is a developer's machine
 *   1  the contracts have forked, or a shared file is missing on one side
 *   2  the sibling checkout could not be found and we are somewhere that should have one
 *
 * `2` is separate from `1` because it is an environment problem, not a contract problem. A missing
 * sibling is lenient locally and fatal under `CI` — the one place leniency could hide a real fork.
 *
 * See: docs/tools/pairing-and-ports.md#keeping-the-pair-in-step
 */
import { existsSync } from 'node:fs';
import { DEFAULT_FRONTEND_PATH, resolveFrontendPath } from './frontend-path';
import {
    compareSharedFiles,
    formatSharedFileProblems,
    SHARED_FILES,
    THIS_REPO
} from './spec-identity';

// Before `resolveFrontendPath()` reads it. Absent or unreadable `.env` is not an error: the
// variable may come from the real environment, as it does in CI.
try {
    process.loadEnvFile();
} catch {
    /* no .env in this checkout */
}

const siblingRoot = resolveFrontendPath();

if (!existsSync(siblingRoot)) {
    const message =
        `\n[spec-identity] No checkout found at ${siblingRoot}.\n` +
        `  This check compares ${SHARED_FILES.length} shared files against the paired frontend.\n` +
        `  Clone it beside this repo as ${DEFAULT_FRONTEND_PATH}, or set FRONTEND_PATH in .env.\n`;

    if (process.env.CI) {
        console.error(
            `${message}  CI is set, so this is a misconfigured workflow rather than a\n` +
                `  half-cloned pair: ci.yml checks the sibling out itself and passes FRONTEND_PATH.\n`
        );
        process.exit(2);
    }

    console.warn(`${message}  SKIPPED — the shared contract files were not compared.\n`);
    process.exit(0);
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
