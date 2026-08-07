import { readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * `mongodb-memory-server` creates its data directory with `mkdtemp(os.tmpdir()/mongo-mem-)`
 * (`MongoMemoryServer.js`, and `mongo-mem-keyfile-` for a replica set). Both are matched here.
 */
const DATA_DIR_PREFIX = 'mongo-mem-';

/** Written by `mongod` itself, inside the data directory. See `isServerGone`. */
const LOCK_FILE = 'mongod.lock';

/**
 * Age past which a directory is stranded whatever its lock file says — the backstop for every
 * case `isServerGone` cannot judge: a keyfile directory (no `mongod.lock` at all), an unreadable
 * lock, or a dead pid the OS has since handed to an unrelated process.
 *
 * A full mutation run measured ~21 minutes at the configured concurrency, so an hour is a wide
 * margin over anything a concurrent jest instance could still be holding.
 */
const STALE_AFTER_MS = 60 * 60 * 1000;

/**
 * Below this age a directory is left alone even when no server appears to own it, covering the
 * seconds between `mkdtemp` and `mongod` writing its lock file.
 */
const GRACE_MS = 5 * 60 * 1000;

/**
 * Whether a `mongod` is *provably* no longer using this data directory. Anything unprovable
 * answers `false`, leaving the decision to the age backstop.
 *
 * `mongod` writes its pid into `mongod.lock` at startup and truncates the file to zero bytes on a
 * clean shutdown — which is what a worker's death produces, because the child exits cleanly with
 * its parent. So an empty lock is positive evidence of a server that is gone, not merely absent
 * evidence of one that is running. A pid that no longer resolves to a process says the same for
 * the harder case, a `mongod` killed outright.
 *
 * `process.kill(pid, 0)` sends no signal; it only asks whether the pid can be signalled. EPERM
 * means the process exists and belongs to someone else — alive, and emphatically not ours.
 */
const isServerGone = async (directory: string) => {
    let lock: string;
    try {
        lock = await readFile(path.join(directory, LOCK_FILE), 'utf8');
    } catch {
        return false;
    }

    const pid = Number.parseInt(lock.trim(), 10);
    if (!Number.isInteger(pid) || pid <= 0) {
        return true;
    }

    try {
        process.kill(pid, 0);
        return false;
    } catch (error) {
        return (error as NodeJS.ErrnoException).code !== 'EPERM';
    }
};

/**
 * Delete `mongo-mem-*` directories left behind in the temp directory by previous runs.
 *
 * Each in-memory Mongo costs ~201 MB of `dbpath`, removed by `MongoMemoryServer.stop()` — so a
 * normal `npm test` leaves nothing behind. Stryker is the problem: it SIGKILLs a jest worker per
 * timed-out mutant and again at the end of a run, and a killed worker never reaches `stop()`. On
 * a tmpfs `/tmp` that is 201 MB of RAM per kill, and once it fills, *everything* on the machine
 * that writes to `/tmp` starts failing with ENOSPC.
 *
 * This runs from jest's `globalSetup`, i.e. once per jest instance rather than once per worker.
 * The distinction is the whole design constraint: Stryker runs several jest instances at the same
 * time, so a sweep that deleted every `mongo-mem-*` directory it found would pull a live
 * sibling's `dbpath` out from under it and trade a disk leak for a flaky, unexplainable suite.
 *
 * A directory is therefore removed on either of two independent verdicts:
 *
 *   - its `mongod` is provably gone and it is past `graceMs`, which is what lets a long mutation
 *     run reclaim its own strandings while it is still going, and
 *   - it is older than `maxAgeMs` regardless, the backstop for anything the first cannot judge.
 *
 * Best-effort by construction. Two concurrent instances may pick the same stale directory, so a
 * removal can lose the race and find it already gone; a failure to clean up temp files is never a
 * reason to fail the suite that was about to run.
 *
 * @param root directory to sweep (injectable for the test)
 * @param maxAgeMs age past which a directory is stranded whatever its lock file says
 * @param graceMs minimum age before an unowned directory may be removed
 * @returns how many directories were removed
 */
export const pruneStaleDataDirs = async (
    root = tmpdir(),
    { maxAgeMs = STALE_AFTER_MS, graceMs = GRACE_MS }: { maxAgeMs?: number; graceMs?: number } = {}
) => {
    let entries;
    try {
        entries = await readdir(root, { withFileTypes: true });
    } catch {
        return 0;
    }

    const removed = await Promise.all(
        entries
            .filter((entry) => entry.isDirectory() && entry.name.startsWith(DATA_DIR_PREFIX))
            .map(async (entry) => {
                const directory = path.join(root, entry.name);
                try {
                    const { mtimeMs } = await stat(directory);
                    const age = Date.now() - mtimeMs;
                    const stranded =
                        age >= maxAgeMs || (age >= graceMs && (await isServerGone(directory)));
                    if (!stranded) {
                        return 0;
                    }
                    await rm(directory, { recursive: true, force: true });
                    return 1;
                } catch {
                    return 0;
                }
            })
    );

    return removed.reduce<number>((total, count) => total + count, 0);
};

const globalSetup = async () => {
    await pruneStaleDataDirs();
};

export default globalSetup;
