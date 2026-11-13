/**
 * @module
 * The audit tripwire (`scripts/audit/RULES.md`, rule 6): tells you if an audit wrote anything
 * outside its own report folder.
 *
 * Usage and exit codes: `./run-check-clean.ts`. Kept apart so its unit test can import this
 * without running it.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { gitEnvironment } from '../git-base';

/** What git says about one repo at one moment. Each key is one `git` view, one entry per line. */
export type RepoSnapshot = Record<'head' | 'refs' | 'stash' | 'status' | 'index', string[]>;

/** The git views a snapshot records, as the arguments handed to `git`. */
const VIEWS: Record<keyof RepoSnapshot, string[]> = {
    head: ['rev-parse', 'HEAD'],
    refs: ['for-each-ref'],
    stash: ['stash', 'list'],
    // `--ignored` lists ignored paths too; an ignored folder is one entry, so a change inside is unseen.
    status: ['status', '--porcelain=v2', '--ignored'],
    // `-s` adds the object hash of each staged file, so a restaged edit shows up.
    index: ['ls-files', '-s']
};

/**
 * Runs git in `repo` and returns its non-empty output lines.
 * `GIT_OPTIONAL_LOCKS=0` stops `git status` taking the index lock, so the check writes nothing.
 * https://git-scm.com/docs/git#Documentation/git.txt-codeGIT_OPTIONAL_LOCKScode
 *
 * @param repo - the repo directory
 * @param arguments_ - the `git` arguments
 * @returns the output lines
 */
const git = (repo: string, arguments_: string[]): string[] =>
    execFileSync('git', arguments_, {
        cwd: repo,
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
        env: { ...gitEnvironment(), GIT_OPTIONAL_LOCKS: '0' }
    })
        .split('\n')
        .filter((line) => line !== '');

/**
 * Records every git view of a repo.
 *
 * @param repo - the repo directory
 * @returns the snapshot
 */
export const snapshotRepo = (repo: string): RepoSnapshot => ({
    head: git(repo, VIEWS.head),
    refs: git(repo, VIEWS.refs),
    stash: git(repo, VIEWS.stash),
    status: git(repo, VIEWS.status),
    index: git(repo, VIEWS.index)
});

/**
 * True when a line of git output is about the run folder (the one place an audit may write).
 *
 * @param line - one output line of a snapshot view
 * @param folder - the run folder, relative to the repo root, no trailing slash
 * @returns whether to ignore the line
 */
const isInsideRunFolder = (line: string, folder: string): boolean => {
    const entry = line.split(' ').pop() ?? '';
    const clean = entry.replace(/\/$/, '');
    return clean === folder || folder.startsWith(`${clean}/`) || clean.startsWith(`${folder}/`);
};

/**
 * Lists the lines that appear in only one of the two snapshots, outside the run folder.
 *
 * @param before - the snapshot taken at the start
 * @param after - the snapshot taken at the end
 * @param folder - the run folder, relative to the repo root
 * @returns one `view: line` string per difference
 */
export const diffSnapshots = (
    before: RepoSnapshot,
    after: RepoSnapshot,
    folder: string
): string[] =>
    // `Object.keys` answers `string[]`; `VIEWS` is declared per `RepoSnapshot` key, so each one is.
    (Object.keys(VIEWS) as (keyof RepoSnapshot)[]).flatMap((view) => {
        const was = new Set(before[view]);
        const now = new Set(after[view]);
        return [
            ...before[view].filter((line) => !now.has(line)).map((line) => `- ${view}: ${line}`),
            ...after[view].filter((line) => !was.has(line)).map((line) => `+ ${view}: ${line}`)
        ].filter((row) => !isInsideRunFolder(row, folder));
    });

/**
 * The repo root of a directory, so the run folder can be made relative to it.
 *
 * @param repo - any directory inside the repo
 * @returns the absolute top-level path
 */
const repoRoot = (repo: string): string => git(repo, ['rev-parse', '--show-toplevel'])[0] ?? repo;

/**
 * Where a repo's snapshot is kept: inside the run folder, named by the repo directory.
 *
 * @param runFolder - the run folder
 * @param root - the repo root
 * @returns the snapshot file path
 */
const snapshotFile = (runFolder: string, root: string): string =>
    path.join(runFolder, `.tripwire.${path.basename(root)}.json`);

/**
 * Parses the command line into the mode, run folder and repos.
 *
 * @param argv - `process.argv` without the first two entries
 * @returns the parsed command
 */
const parseArguments = (argv: string[]): { mode: string; runFolder: string; repos: string[] } => {
    const [mode = '', runFolder = '', ...rest] = argv;
    const repos = ['.'];
    for (const [index, argument] of rest.entries()) {
        if (rest[index - 1] === '--repo') repos.push(argument);
    }
    return { mode, runFolder: path.resolve(runFolder), repos: repos.map((r) => path.resolve(r)) };
};

/**
 * Entry point: snapshot or compare every repo, print the differences, set the exit code.
 *
 * @param argv - `process.argv` without the first two entries
 * @returns the exit code
 */
export const main = (argv: string[]): number => {
    const { mode, runFolder, repos } = parseArguments(argv);
    if ((mode !== 'snapshot' && mode !== 'compare') || runFolder === path.resolve('')) {
        console.error('usage: check-clean (snapshot|compare) <run-folder> [--repo <path>...]');
        return 2;
    }
    const roots = repos.map((repo) => repoRoot(repo));
    if (mode === 'snapshot') {
        mkdirSync(runFolder, { recursive: true });
        for (const root of roots) {
            writeFileSync(snapshotFile(runFolder, root), JSON.stringify(snapshotRepo(root)));
        }
        console.log('Tripwire: snapshot taken');
        return 0;
    }
    const changed = roots.flatMap((root) => {
        const file = snapshotFile(runFolder, root);
        if (!existsSync(file)) return [`${root}: no snapshot, run \`snapshot\` first`];
        const before = JSON.parse(readFileSync(file, 'utf8')) as RepoSnapshot; // our own file
        const folder = path.relative(root, runFolder);
        return diffSnapshots(before, snapshotRepo(root), folder).map((row) => `${root}: ${row}`);
    });
    console.log(
        changed.length === 0 ? 'Tripwire: clean' : `Tripwire: CHANGED:\n${changed.join('\n')}`
    );
    return changed.length === 0 ? 0 : 1;
};
