#!/usr/bin/env tsx
/**
 * Fails when `.env-example` and the configuration slices disagree about which variables exist.
 * `npm run check:env-example`, part of `complete`.
 *
 * Two ways to drift:
 *   - a slice declares a variable the file never shows, so an operator cannot find it;
 *   - the file shows a variable nothing reads any more (see `lingeringInExample`).
 *
 * The file is hand-written and is not generated: its sections, prose and invented values are
 * the point of it, and a slice carries none of them (docs/tools/configuration.md#env-example).
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { allConfigSlices } from '../../src/app/config';
import { enabledModules } from '../../src/modules';
import { demoSinkConfig, seedPasswordsConfig } from '../../scenarios/config';
import { fileFormOf } from '@infrastructure/config/secret-files';
import { REPO_ROOT } from '../git-base';
import {
    lingeringInExample,
    missingFromExample,
    parseEnvironmentExample,
    type DeclaredVariable,
    type EnvironmentExampleEntry
} from './environment-example';

/** Every variable any slice declares, the seeder's own included (the app never boots with it). */
const declaredVariables = (): DeclaredVariable[] =>
    [...allConfigSlices(enabledModules), seedPasswordsConfig.slice, demoSinkConfig.slice].flatMap(
        (slice) =>
            slice.fields.map(({ name, doc, sensitive }) => ({
                name,
                setBy: doc.setBy,
                fileForm: sensitive ? fileFormOf(name) : undefined
            }))
    );

/**
 * Which of `names` appear, as whole words, in a tracked or untracked-but-not-ignored file other
 * than `.env-example` and the documentation.
 *
 * @param names - the candidates
 * @returns the ones found
 */
const readElsewhere = (names: readonly string[]): Set<string> => {
    if (names.length === 0) return new Set();
    // git grep: -h no file names, -o only the match, -w whole words, -F literal patterns.
    // `--untracked` also reads files not yet added. https://git-scm.com/docs/git-grep
    const result = spawnSync(
        'git',
        [
            'grep',
            '-h',
            '-o',
            '-w',
            '-F',
            '--untracked',
            ...names.flatMap((name) => ['-e', name]),
            '--',
            '.',
            ':!.env-example',
            ':!docs',
            ':!*.md'
        ],
        { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    );
    // Exit 1 is git grep's "no match", not a failure.
    if (result.status !== 0 && result.status !== 1) {
        throw new Error(`git grep failed: ${result.stderr}`);
    }
    return new Set(result.stdout.split('\n').filter(Boolean));
};

/** One line per problem, empty when the file and the slices agree. */
const problems = (): string[] => {
    const declared = declaredVariables();
    const entries = parseEnvironmentExample(
        readFileSync(path.join(REPO_ROOT, '.env-example'), 'utf8')
    );
    const declaredNames = new Set(declared.map(({ name }) => name));
    const unknown = entries.map(({ name }) => name).filter((name) => !declaredNames.has(name));
    const lingering: EnvironmentExampleEntry[] = lingeringInExample(
        entries,
        declared,
        readElsewhere(unknown)
    );

    return [
        ...missingFromExample(entries, declared).map(
            (name) => `${name}: declared by a config slice, absent from .env-example`
        ),
        ...lingering.map(
            ({ name, line }) =>
                `${name} (.env-example:${String(line)}): no slice declares it and no file outside docs/ reads it`
        )
    ];
};

const found = problems();
if (found.length > 0) {
    console.error(
        `[env-example] .env-example has drifted from the config slices:\n  ${found.join('\n  ')}`
    );
    process.exitCode = 1;
} else {
    console.log('[env-example] .env-example is in step with the config slices.');
}
