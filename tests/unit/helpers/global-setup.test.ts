/**
 * The `/tmp` sweep that runs once per jest instance (`globalSetup`).
 *
 * The load-bearing assertions are the ones about what is *kept*, not what is deleted: Stryker
 * runs several jest instances concurrently, so a sweep that misjudged a live server would delete
 * its `dbpath` mid-run — trading a disk leak for a flaky, unexplainable suite.
 *
 * Real files in a real temp directory, because the thing under test is filesystem behaviour;
 * mocking `node:fs/promises` here would only assert that the code calls the functions it calls.
 */
import { chmod, mkdtemp, mkdir, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pruneStaleDataDirs } from '../../helpers/global-setup';

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

/** Explicit limits, so each case says which of the two verdicts it is exercising. */
const LIMITS = { maxAgeMs: HOUR_MS, graceMs: 5 * MINUTE_MS };

/** `mongod` truncates its lock file to zero bytes when it shuts down. */
const SHUT_DOWN = '';

/** No lock file at all: a keyfile directory, or a server that has not written one yet. */
const NO_LOCK = false;

/** A pid that cannot be a running server: PID 0 is never a user process. */
const DEAD_PID = '0';

/** This test process — the one pid guaranteed to be alive while the assertion runs. */
const LIVE_PID = String(process.pid);

let root: string;

/**
 * Creates `<root>/<name>`, aged `ageMs` into the past, with the given `mongod.lock` content
 * (`NO_LOCK` for none).
 */
const makeDir = async (name: string, ageMs: number, lock: string | false = SHUT_DOWN) => {
    const directory = path.join(root, name);
    await mkdir(directory);
    if (lock !== NO_LOCK) {
        await writeFile(path.join(directory, 'mongod.lock'), lock);
    }
    const time = new Date(Date.now() - ageMs);
    await utimes(directory, time, time);
    return directory;
};

beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'prune-test-'));
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe('pruneStaleDataDirs', () => {
    it('removes a stranded data directory, contents and all', async () => {
        await makeDir('mongo-mem-abc123', 2 * HOUR_MS);

        expect(await pruneStaleDataDirs(root, LIMITS)).toBe(1);
        expect(await readdir(root)).toEqual([]);
    });

    /* The reason the sweep cannot simply delete what it finds: a concurrent instance is using it. */
    it('leaves a directory whose mongod is still running', async () => {
        await makeDir('mongo-mem-live', 30 * MINUTE_MS, LIVE_PID);

        expect(await pruneStaleDataDirs(root, LIMITS)).toBe(0);
        expect(await readdir(root)).toEqual(['mongo-mem-live']);
    });

    /* A worker killed mid-run: mongod exited cleanly and truncated its lock, the files stayed. */
    it('removes a directory whose mongod is gone, well before the age backstop', async () => {
        await makeDir('mongo-mem-orphaned', 10 * MINUTE_MS, SHUT_DOWN);

        expect(await pruneStaleDataDirs(root, LIMITS)).toBe(1);
    });

    it('removes a directory whose recorded pid no longer exists', async () => {
        await makeDir('mongo-mem-killed', 10 * MINUTE_MS, DEAD_PID);

        expect(await pruneStaleDataDirs(root, LIMITS)).toBe(1);
    });

    /* The seconds between mkdtemp and mongod writing its lock must not read as "unowned". */
    it('leaves a just-created directory alone even with no lock file yet', async () => {
        await makeDir('mongo-mem-booting', 2 * MINUTE_MS, NO_LOCK);

        expect(await pruneStaleDataDirs(root, LIMITS)).toBe(0);
        expect(await readdir(root)).toEqual(['mongo-mem-booting']);
    });

    /**
     * `mongo-mem-keyfile-*` (replica sets) has no `mongod.lock`, so liveness is unknowable and
     * only the age backstop applies. Kilobytes, so waiting the hour costs nothing.
     */
    it('holds a lock-less directory until the age backstop, then removes it', async () => {
        await makeDir('mongo-mem-keyfile-recent', 30 * MINUTE_MS, NO_LOCK);
        await makeDir('mongo-mem-keyfile-old', 2 * HOUR_MS, NO_LOCK);

        expect(await pruneStaleDataDirs(root, LIMITS)).toBe(1);
        expect(await readdir(root)).toEqual(['mongo-mem-keyfile-recent']);
    });

    /* A pid the OS reused for something unrelated would look alive forever without this. */
    it('removes a directory past the age backstop even if its pid resolves to a process', async () => {
        await makeDir('mongo-mem-stale-pid', 3 * HOUR_MS, LIVE_PID);

        expect(await pruneStaleDataDirs(root, LIMITS)).toBe(1);
    });

    it('touches nothing that is not a mongo-mem- directory', async () => {
        await makeDir('some-other-tool-cache', 2 * HOUR_MS);
        await writeFile(path.join(root, 'mongo-mem-not-a-directory'), '');

        expect(await pruneStaleDataDirs(root, LIMITS)).toBe(0);
        const kept = await readdir(root);
        expect(kept.toSorted()).toEqual(['mongo-mem-not-a-directory', 'some-other-tool-cache']);
    });

    it('prunes only the stranded directories out of a mixed temp directory', async () => {
        await makeDir('mongo-mem-old', 3 * HOUR_MS);
        await makeDir('mongo-mem-orphaned', 10 * MINUTE_MS, SHUT_DOWN);
        await makeDir('mongo-mem-live', 10 * MINUTE_MS, LIVE_PID);
        await makeDir('mongo-mem-fresh', 0, NO_LOCK);

        expect(await pruneStaleDataDirs(root, LIMITS)).toBe(2);
        const kept = await readdir(root);
        expect(kept.toSorted()).toEqual(['mongo-mem-fresh', 'mongo-mem-live']);
    });

    /* Cleanup failing must never fail the suite it was about to run. */
    it('reports nothing and does not throw when the temp directory is unreadable', async () => {
        await expect(pruneStaleDataDirs(path.join(root, 'does-not-exist'), LIMITS)).resolves.toBe(
            0
        );
    });

    /**
     * Same contract for a removal that fails outright — here because the temp directory is not
     * writable, in a real run because a concurrent instance got to the same stale directory first
     * and it no longer exists (ENOENT).
     */
    it('reports a removal it could not perform, without throwing', async () => {
        await makeDir('mongo-mem-undeletable', 2 * HOUR_MS);
        await chmod(root, 0o500);

        try {
            await expect(pruneStaleDataDirs(root, LIMITS)).resolves.toBe(0);
        } finally {
            await chmod(root, 0o700);
        }
    });
});
