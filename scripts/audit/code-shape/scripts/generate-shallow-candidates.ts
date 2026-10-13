#!/usr/bin/env tsx
/**
 * @module
 * Writes the `code-shape` audit's shallow candidates to `tmp/reports/audit/code-shape/shallow.json`.
 *
 * Usage: `npm run audit:shallow -- [path...]` — repo-relative prefixes, `src scripts scenarios` by
 * default. Kept apart from `./shallow-candidates.ts` so its unit test can import the counting
 * without running this.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { REPO_ROOT } from '../../../git-base';
import { findShallowCandidates } from './shallow-candidates';

/** Scanned when no path is given: the code that ships or builds what ships. */
const DEFAULT_SCOPE = ['src', 'scripts', 'scenarios'];

/** Where the report lands — gitignored working evidence, like every audit report. */
const OUTPUT = path.join(REPO_ROOT, 'tmp', 'reports', 'audit', 'code-shape', 'shallow.json');

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
const scope = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_SCOPE;

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
