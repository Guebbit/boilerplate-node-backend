#!/usr/bin/env tsx
/**
 * Every variable the app reads must be documented — `npm run check:environment-keys`.
 *
 * `.env-example` is the only enumeration of what a deployment may set, and nothing kept it honest:
 * a variable added to the code and not to the file is invisible to whoever deploys this, and the
 * failure is silent — the feature simply never turns on. Two keys had already drifted that way.
 *
 * A grep rather than a runtime registry, deliberately. Readers stay where they are used and stay
 * lazy (see `@infrastructure/runtime/environment`); what is verified here is that each one is
 * WRITTEN DOWN, which is a fact about the two files and needs no layer between them.
 *
 * Only one direction is enforced. `.env-example` also documents variables the app never reads —
 * docker-compose services, Umami, the mutation/jest knobs — and those are legitimately there for a
 * human, so an unread key is not an error.
 *
 * Exit codes: 0 every read key is documented, 1 at least one is not.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..');
const SOURCE_ROOT = path.join(REPO_ROOT, 'src');
const ENV_EXAMPLE = path.join(REPO_ROOT, '.env-example');

/**
 * `process.env.KEY` and the string literal handed to `environmentNumber`/`environmentFlag`, which is how a
 * variable reaches the code once it goes through a shared coercion instead of being read raw.
 */
const READ_PATTERNS = [
    /process\.env\.([A-Z][\dA-Z_]*)/g,
    /\benvironment(?:Number|Flag)\(\s*'([A-Z][\dA-Z_]*)'/g
];

/** `KEY=`, commented out or not — being commented out is how an optional default is documented. */
const DOCUMENTED_PATTERN = /^\s*#?\s*([A-Z][\dA-Z_]*)\s*=/gm;

/**
 * Comments out, so prose ABOUT a variable is not mistaken for a read of one — this script's own
 * docblock names `process.env.X`, and a docblock explaining a key is not a use of it.
 *
 * Block comments and whole-line `//` comments only. A trailing `//` after code is left alone: a
 * URL in a string literal would otherwise swallow the rest of the line and hide a real read.
 */
const withoutComments = (contents: string): string =>
    contents.replaceAll(/\/\*[\S\s]*?\*\//g, '').replaceAll(/^[^\S\n]*\/\/.*$/gm, '');

/** Every `.ts` under `src/`, tests excluded: a test setting a variable does not document one. */
const sourceFiles = (directory: string): string[] =>
    readdirSync(directory).flatMap((entry) => {
        const full = path.join(directory, entry);
        if (statSync(full).isDirectory()) return entry === 'tests' ? [] : sourceFiles(full);
        return entry.endsWith('.ts') && !entry.endsWith('.test.ts') ? [full] : [];
    });

const readKeys = new Map<string, string>();
for (const file of sourceFiles(SOURCE_ROOT)) {
    const contents = withoutComments(readFileSync(file, 'utf8'));
    for (const pattern of READ_PATTERNS)
        for (const [, key] of contents.matchAll(pattern))
            if (!readKeys.has(key)) readKeys.set(key, path.relative(REPO_ROOT, file));
}

const documented = new Set(
    [...readFileSync(ENV_EXAMPLE, 'utf8').matchAll(DOCUMENTED_PATTERN)].map(([, key]) => key)
);

const undocumented = [...readKeys].filter(([key]) => !documented.has(key)).toSorted();

// A canary: an empty sweep must mean "nothing is read", not "the grep broke".
if (readKeys.size === 0) {
    console.error('[environment-keys] Found no environment reads at all — the scan is broken.');
    process.exit(1);
}

if (undocumented.length > 0) {
    console.error(
        `\n[environment-keys] ${undocumented.length} variable(s) read by the app but absent from .env-example:\n`
    );
    for (const [key, file] of undocumented) console.error(`  ${key}  — first read in ${file}`);
    console.error(
        '\n  Add each one to .env-example, commented out if it has a working default.\n' +
            '  That file is the only list a deployment has.\n'
    );
    process.exit(1);
}

console.log(`[environment-keys] ${readKeys.size} variables read, all documented in .env-example.`);
