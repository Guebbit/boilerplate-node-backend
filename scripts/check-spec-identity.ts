#!/usr/bin/env tsx
/**
 * CLI for the cross-repo contract check — `npm run check:spec-identity`.
 *
 * Wired into `ci.yml` (which checks out the sibling repo first and passes `FRONTEND_PATH`), into
 * `npm run complete`, and available on its own. The frontend mirrors this file.
 *
 * ── WHERE THE SIBLING PATH COMES FROM ────────────────────────────────────────────────────────────
 * `FRONTEND_PATH`, read from the environment or from `.env` — `process.loadEnvFile()` is Node's own,
 * so a standalone script gets the same variable the app does without a dotenv dependency. Unset, it
 * falls back to the sibling-directory convention `frontendPath.ts` documents.
 *
 * ── EXIT CODES ARE THE INTERFACE ─────────────────────────────────────────────────────────────────
 *   0  the contracts are identical — or the sibling is absent and this is a developer's machine
 *   1  they have forked, or a shared file is missing on one side
 *   2  the sibling checkout could not be found, and we are somewhere that should have one
 *
 * `2` is separated from `1` because it is an environment problem rather than a contract problem: a
 * copy of this boilerplate cloned on its own should say "I cannot see the other repo", not "your
 * specs have drifted".
 *
 * ── WHY A MISSING SIBLING IS NOT FATAL LOCALLY, AND IS IN CI ─────────────────────────────────────
 * This check is part of `npm run complete`, which is the pre-commit gate. Hard-failing there would
 * make the gate unusable for anyone who cloned one half of the pair, so a missing sibling prints
 * what to do and exits 0.
 *
 * That leniency is exactly how a check quietly stops running, which is why it is switched off in
 * CI: `CI` is set by GitHub Actions (and by every other runner), and there a missing sibling means
 * the workflow is misconfigured — `ci.yml` checks the repo out itself before calling this. So the
 * one place where "no sibling" could hide a real fork is the one place it stays fatal.
 */
import { existsSync } from 'node:fs';
import { DEFAULT_FRONTEND_PATH, resolveFrontendPath } from './frontendPath';
import {
    compareSharedFiles,
    formatSharedFileProblems,
    SHARED_FILES,
    THIS_REPO
} from './specIdentity';

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
