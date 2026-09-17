/**
 * @module
 * Where the code under test writes files: a directory per test file, never the repository's own.
 *
 * Why:      uploads, quarantine and staging default to `public/`, `quarantine/` and the system
 *           temp directory — a test left alone writes onto the developer's machine.
 * Lifetime: the jest instance's root is created by `global-setup.ts` and deleted by
 *           `global-teardown.ts`; a killed instance's root is swept by the next run.
 * Rule:     a test removes every file it causes. Teardown fails the run, naming the test file,
 *           when one did not.
 *
 * Relative imports only: `globalSetup` and `globalTeardown` load this outside `moduleNameMapper`.
 */

import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

/** The variable `global-setup.ts` hands this jest instance's sandbox root through to the workers. */
export const FILE_SANDBOX_ROOT_VARIABLE = 'NODE_TEST_FILES_ROOT';

/** The repository root, which test paths are named relative to. */
const REPO_ROOT = path.join(__dirname, '..', '..');

/**
 * The application settings a sandbox redirects, each to its own subdirectory.
 *
 * Every one is read at call time by the code under test, which is what lets a per-file value set
 * before the test file loads take effect.
 */
const SANDBOXED_VARIABLES = {
    NODE_PUBLIC_PATH: 'public',
    NODE_QUARANTINE_PATH: 'quarantine',
    NODE_UPLOAD_STAGING_PATH: 'uploads'
} as const;

/**
 * One test file's leftovers, as teardown reports them.
 */
export interface SandboxLeftovers {
    /** The sandbox directory's name — the test file's repo-relative path, separators flattened. */
    sandbox: string;
    /** Every file still inside it, relative to the sandbox directory. */
    files: string[];
}

/**
 * The sandbox directory belonging to one test file.
 *
 * Named after the file itself, so a leftover found at teardown already says who left it.
 *
 * @param root - this jest instance's sandbox root
 * @param testPath - the absolute path of the test file
 * @returns the directory that test file's writes are redirected into
 */
export const sandboxDirectory = (root: string, testPath: string): string =>
    path.join(root, path.relative(REPO_ROOT, testPath).split(path.sep).join('__'));

/**
 * Reads the sandbox root `global-setup.ts` published.
 *
 * @returns the root directory
 * @throws {Error} when no `globalSetup` ran — falling back to the real directories is the
 *   pollution this module exists to prevent
 */
const sandboxRoot = (): string => {
    const root = process.env[FILE_SANDBOX_ROOT_VARIABLE];
    if (!root)
        throw new Error(`${FILE_SANDBOX_ROOT_VARIABLE} is unset: run jest with its globalSetup`);
    return root;
};

/**
 * Points every file-writing setting of the application at this test file's sandbox.
 *
 * Assigned, not `??=`: a value from `.env` or the shell names a real directory, which is exactly
 * what a test must not write into.
 *
 * @param testPath - the absolute path of the test file about to run
 * @throws {Error} when jest did not report which test file is running
 */
export const applyFileSandbox = (testPath: string | undefined): void => {
    if (!testPath) throw new Error('jest reported no test path: cannot choose a file sandbox');

    const directory = sandboxDirectory(sandboxRoot(), testPath);
    for (const [variable, segment] of Object.entries(SANDBOXED_VARIABLES))
        process.env[variable] = path.join(directory, segment);
};

/**
 * Deletes everything the current test file wrote, for a suite that writes files for real.
 *
 * Refuses a setting that points outside the sandbox root, so a misconfigured run fails here rather
 * than deleting a real `public/`.
 *
 * @throws {Error} when a sandboxed setting is unset or points outside the sandbox root
 */
export const emptyFileSandbox = async (): Promise<void> => {
    const root = path.resolve(sandboxRoot());
    const directories = Object.keys(SANDBOXED_VARIABLES).map((variable) => {
        const directory = path.resolve(process.env[variable] ?? '');
        if (!directory.startsWith(root + path.sep))
            throw new Error(`${variable} is outside the file sandbox: ${directory}`);
        return directory;
    });

    await Promise.all(
        directories.map((directory) => rm(directory, { recursive: true, force: true }))
    );
};

/**
 * Every file still present under a sandbox root, grouped by the test file that owns it.
 *
 * Directories do not count: the code under test creates them on demand, and teardown removes the
 * whole root anyway. A file is something a test caused and did not clean up.
 *
 * @param root - a jest instance's sandbox root; a missing one has no leftovers
 * @returns one entry per sandbox that still holds files, in name order
 */
export const leftoverFiles = async (root: string): Promise<SandboxLeftovers[]> => {
    const sandboxes = await readdir(root, { withFileTypes: true }).catch(() => []);

    const found = await Promise.all(
        sandboxes
            .filter((entry) => entry.isDirectory())
            .map((entry) =>
                readdir(path.join(root, entry.name), { recursive: true, withFileTypes: true }).then(
                    (children) => ({
                        sandbox: entry.name,
                        files: children
                            .filter((child) => child.isFile())
                            .map((child) =>
                                path.relative(
                                    path.join(root, entry.name),
                                    path.join(child.parentPath, child.name)
                                )
                            )
                            .toSorted()
                    })
                )
            )
    );

    return found
        .filter((leftovers) => leftovers.files.length > 0)
        .toSorted((a, b) => a.sandbox.localeCompare(b.sandbox));
};

/**
 * The failure message teardown raises: which test files left what behind.
 *
 * @param leftovers - the non-empty result of {@link leftoverFiles}
 * @returns a multi-line message naming each test file and its files
 */
export const describeLeftovers = (leftovers: SandboxLeftovers[]): string =>
    [
        'Test files left files behind. A test must remove every file it causes:',
        ...leftovers.flatMap(({ sandbox, files }) => [
            `  ${sandbox.split('__').join('/')}`,
            ...files.map((file) => `    ${file}`)
        ])
    ].join('\n');
