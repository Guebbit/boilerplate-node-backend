#!/usr/bin/env tsx
/**
 * Prints tonight's `mutation-deep` matrix as GitHub Actions job outputs.
 *
 *   npx tsx scripts/mutation/shard-plan.ts [--full] >> "$GITHUB_OUTPUT"
 *
 * Emits two lines: `shards=<json>` (an array of `{name, mutate}`, consumed as
 * `strategy.matrix.include`) and `force=<true|false>` (whether Stryker should discard the
 * incremental cache). `--full` forces the weekly pass outside its Sunday schedule, e.g. from
 * `workflow_dispatch`.
 *
 * Pure planning logic lives in `scripts/mutation/sharding.ts`, tested directly against synthetic
 * file lists; this file's only job is reading the real tree and the real clock.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { packIntoShards, rotationPlan } from './sharding';

const REPO_ROOT = path.join(__dirname, '..', '..');

/** Mirrors `stryker.deep.json`'s `mutate` roots — see that file for why each exclusion exists. */
const MUTATE_ROOTS = ['src/infrastructure', 'src/kernel', 'src/modules'];
const EXCLUDE = [/^src\/modules\/[^/]+\/index\.ts$/, /^src\/modules\/[^/]+\/tests\//];

/** Every mutable `.ts` file in the deep scope, repo-root-relative, POSIX-separated. */
const mutableFiles = (): string[] => {
    const files: string[] = [];
    const walk = (directory: string): void => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            const full = path.join(directory, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(full);
        }
    };
    for (const root of MUTATE_ROOTS) walk(path.join(REPO_ROOT, root));

    return files
        .map((file) => path.relative(REPO_ROOT, file).split(path.sep).join('/'))
        .filter((file) => !EXCLUDE.some((pattern) => pattern.test(file)));
};

/** Non-blank source lines — close enough to Stryker's mutable-line notion to size a shard by. */
const lineCount = (file: string): number =>
    readFileSync(path.join(REPO_ROOT, file), 'utf8')
        .split('\n')
        .filter((line) => line.trim() !== '').length;

const files = mutableFiles().map((file) => ({ file, lines: lineCount(file) }));
const allShards = packIntoShards(files);

const full = process.argv.includes('--full') || new Date().getUTCDay() === 0;
const epochDay = Math.floor(Date.now() / 86_400_000);
const { shards } = rotationPlan(allShards, { full, epochDay });

console.log(`shards=${JSON.stringify(shards.map(({ name, mutate }) => ({ name, mutate })))}`);
console.log(`force=${full}`);
