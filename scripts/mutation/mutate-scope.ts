/**
 * @module
 * The mutate scope, read off `stryker.json`'s own `mutate` globs — every `.ts` file they cover,
 * with the line count a shard is sized by, plus {@link isMutable} for a caller that already has
 * its own file list (`run-diff.ts`'s changed-files diff) and only needs to know which of them
 * Stryker would actually touch.
 *
 * Read from `stryker.json` rather than mirrored by hand: a hand-copied module list drifts the
 * moment a module is added, which is exactly how `src/infrastructure`, `src/kernel`, `webhooks`,
 * `api-keys` and `antibot` went unmeasured for a month while sitting in `stryker.json`'s own
 * `mutate` list.
 *
 * See: docs/tools/mutation-testing.md#scope-what-is-mutated
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { minimatch } from 'minimatch';

/** The repo root, from this file's own location — never the caller's cwd. */
const REPO_ROOT = path.join(__dirname, '..', '..');

/** `stryker.json`'s own shape, narrowed to the one field this module reads. */
interface StrykerConfig {
    mutate: string[];
}

/** `stryker.json`'s `mutate` globs, read fresh each call — this is a short-lived CLI, not a server. */
const mutatePatterns = (): string[] =>
    (JSON.parse(readFileSync(path.join(REPO_ROOT, 'stryker.json'), 'utf8')) as StrykerConfig)
        .mutate;

/**
 * Whether a repo-root-relative, POSIX-separated path is inside Stryker's own mutate scope.
 *
 * Gitignore-style: a file counts if it matches any plain pattern and no `!`-prefixed one — the
 * same array Stryker itself resolves its scope with (its docs call the negated entries "exclude
 * patterns, applied after the include patterns"), matched here with `minimatch`, Stryker's own
 * matcher, so a path this script calls mutable is one Stryker agrees is mutable.
 *
 * @param file - repo-root-relative, POSIX-separated
 * @param patterns - defaults to `stryker.json`'s own `mutate`; a test supplies its own
 */
export const isMutable = (file: string, patterns: string[] = mutatePatterns()): boolean => {
    const include = patterns.filter((pattern) => !pattern.startsWith('!'));
    const exclude = patterns
        .filter((pattern) => pattern.startsWith('!'))
        .map((pattern) => pattern.slice(1));

    return (
        include.some((pattern) => minimatch(file, pattern)) &&
        !exclude.some((pattern) => minimatch(file, pattern))
    );
};

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
    walk(path.join(REPO_ROOT, 'src'));

    const patterns = mutatePatterns();
    return files
        .map((file) => path.relative(REPO_ROOT, file).split(path.sep).join('/'))
        .filter((file) => isMutable(file, patterns));
};

/** Non-blank source lines — close enough to Stryker's mutable-line notion to size a shard by. */
export const lineCount = (file: string): number =>
    readFileSync(path.join(REPO_ROOT, file), 'utf8')
        .split('\n')
        .filter((line) => line.trim() !== '').length;

/** The whole scope as `packIntoShards` wants it: one `{file, lines}` per mutable file. */
export const scopeWithLines = (): { file: string; lines: number }[] =>
    mutableFiles().map((file) => ({ file, lines: lineCount(file) }));

/**
 * The files a diff touched that are also inside the mutate scope — a plain set intersection, kept
 * pure (no git, no filesystem) so `run-diff.ts`'s entrypoint can stay a thin wrapper around it and
 * a test can drive it with two plain arrays.
 *
 * Not `stryker.json`'s globs re-applied to the diff: {@link mutableFiles} already IS that scope,
 * walked off the tree Stryker itself would see, so a file this intersection keeps is one Stryker
 * measures — no second glob evaluation to drift from the first. It also disposes of a file the
 * diff names but the branch later deleted: gone from the tree means absent from `mutableFiles()`,
 * so it drops out here without a separate existence check.
 */
export const changedMutable = (changed: string[], mutable: string[]): string[] => {
    const scope = new Set(mutable);
    return changed.filter((file) => scope.has(file));
};
