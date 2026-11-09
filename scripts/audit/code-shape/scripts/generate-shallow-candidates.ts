#!/usr/bin/env tsx
/**
 * @module
 * Writes the `code-shape` audit's shallow candidates to `<out>/shallow.json`, `<out>` being this
 * run's report folder (`scripts/audit/RULES.md` rule 4).
 *
 * Usage: `npm run audit:shallow -- --out <dir> [path...]` — repo-relative prefixes, `src scripts
 * scenarios tests/support` by default. Kept apart from `./shallow-candidates.ts` so its unit test can import the counting
 * without running this.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { findShallowCandidates } from './shallow-candidates';
import { REPO_ROOT } from '../../../modules-on-disk';

/** Scanned when no path is given: the code that ships, builds what ships, or every suite shares. */
const DEFAULT_SCOPE = ['src', 'scripts', 'scenarios', 'tests/support'];

/** Position of `--out` on the command line, or -1. */
const outIndex = process.argv.indexOf('--out');

/** The report folder, from `--out <dir>`: the audit writes nowhere else (RULES.md rule 1). */
const outDirectory: string | undefined = outIndex === -1 ? undefined : process.argv[outIndex + 1];

if (outDirectory === undefined) {
    throw new Error('usage: npm run audit:shallow -- --out <report-folder> [path...]');
}

/** The arguments with `--out <dir>` taken out: what is left is the scope paths. */
const scopeArguments = process.argv
    .slice(2)
    .filter((_, index) => index + 2 !== outIndex && index + 2 !== outIndex + 1);

/** Where the report lands. */
const OUTPUT = path.resolve(REPO_ROOT, outDirectory, 'shallow.json');

/**
 * TypeScript: reads `tsconfig.json` and expands its `include` globs into the file list a program
 * is built from. https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API
 */
const rawConfig: unknown = ts.readConfigFile(path.join(REPO_ROOT, 'tsconfig.json'), (file) =>
    ts.sys.readFile(file)
).config;

/** The parsed compiler options and file list, resolved against the repo root. */
const parsed = ts.parseJsonConfigFileContent(rawConfig, ts.sys, REPO_ROOT);

/** TypeScript: the whole project as one program, so the checker can resolve every import. */
const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });

/** The scope asked for on the command line, or the default. */
const scope = scopeArguments.length > 0 ? scopeArguments : DEFAULT_SCOPE;

/** The candidate lists. */
const report = findShallowCandidates(program, REPO_ROOT, scope);

mkdirSync(path.dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, `${JSON.stringify({ scope, ...report }, undefined, 2)}\n`);
console.log(
    `shallow candidates in ${scope.join(', ')}: ` +
        `smallAndRare ${String(report.smallAndRare.length)}, ` +
        `passThroughs ${String(report.passThroughs.length)}, ` +
        `optionalNeverPassed ${String(report.optionalNeverPassed.length)}, ` +
        `lazyFiles ${String(report.lazyFiles.length)}\n` +
        `→ ${path.relative(REPO_ROOT, OUTPUT)}`
);
