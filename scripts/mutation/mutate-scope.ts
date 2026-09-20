/**
 * @module
 * The mutate scope, read off the real tree — every `.ts` file `stryker.json` declares mutable,
 * with the line count a shard is sized by.
 *
 * Walked rather than listed: a hand-copied module list drifts the moment a module is added, which
 * is exactly how `src/infrastructure`, `src/kernel`, `webhooks`, `api-keys` and `antibot` went
 * unmeasured for a month while sitting in `stryker.json`'s own `mutate` list.
 *
 * See: docs/tools/mutation-testing.md#scope-what-is-mutated
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/** The repo root, from this file's own location — never the caller's cwd. */
const REPO_ROOT = path.join(__dirname, '..', '..');

/** Mirrors `stryker.json`'s `mutate` roots — see that file for why each exclusion exists. */
const MUTATE_ROOTS = ['src/infrastructure', 'src/kernel', 'src/modules'];
const EXCLUDE = [/^src\/modules\/[^/]+\/index\.ts$/, /^src\/modules\/[^/]+\/tests\//];

/** Every mutable `.ts` file in the scope, repo-root-relative, POSIX-separated. */
export const mutableFiles = (): string[] => {
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
export const lineCount = (file: string): number =>
    readFileSync(path.join(REPO_ROOT, file), 'utf8')
        .split('\n')
        .filter((line) => line.trim() !== '').length;

/** The whole scope as `packIntoShards` wants it: one `{file, lines}` per mutable file. */
export const scopeWithLines = (): { file: string; lines: number }[] =>
    mutableFiles().map((file) => ({ file, lines: lineCount(file) }));
