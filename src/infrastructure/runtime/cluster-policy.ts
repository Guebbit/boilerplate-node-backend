/**
 * @module
 * The decisions `src/cluster.ts`'s primary makes, as pure functions: how many workers to fork, and
 * what to do when one crashes. Kept apart from the primary itself, which is a script with process
 * side effects, so each rule can be tested on its own.
 *
 * See: docs/theory/clustering.md
 */

/**
 * How many workers to fork.
 *
 * @param requested - `NODE_CLUSTER_WORKERS`; zero or less means "one per available CPU"
 * @param availableCpus - `os.availableParallelism()`, which honours a container's CPU affinity
 *  where `os.cpus().length` reports every core on the host
 * @returns at least one worker
 */
export const workerTarget = (requested: number, availableCpus: number): number =>
    Math.max(1, requested > 0 ? requested : availableCpus);

/** What the primary does about one worker crash. */
export type CrashVerdict =
    | { action: 'respawn'; delayMs: number; recentCrashes: number[] }
    | { action: 'give-up'; recentCrashes: number[] };

/** The tunables {@link crashVerdict} reads, all from `NODE_CLUSTER_CRASH_*`. */
export interface CrashPolicy {
    /** Window, in ms, a crash counts towards the loop for. */
    windowMs: number;
    /** Delay before the first respawn; doubled per further crash inside the window. */
    backoffBaseMs: number;
    /** Ceiling the doubling stops at. */
    backoffMaxMs: number;
    /** Crashes inside one window past which respawning stops and the primary exits. */
    maxCrashes: number;
}

/**
 * Respawn with exponential backoff, or give up on a crash loop.
 *
 * Giving up is what hands the failure to the supervisor: a worker that dies at import (bad
 * config) would otherwise be respawned forever by a primary that itself never exits, so the
 * container looks alive and nothing restarts or alerts.
 *
 * @param history - timestamps of earlier crashes
 * @param now - this crash's timestamp
 * @param policy - the window, backoff and limit to apply
 * @returns the verdict, plus the pruned history to keep for the next crash
 */
export const crashVerdict = (history: number[], now: number, policy: CrashPolicy): CrashVerdict => {
    const recentCrashes = [
        ...history.filter((timestamp) => now - timestamp <= policy.windowMs),
        now
    ];

    if (recentCrashes.length > policy.maxCrashes) return { action: 'give-up', recentCrashes };

    const delayMs = Math.min(
        policy.backoffBaseMs * 2 ** (recentCrashes.length - 1),
        policy.backoffMaxMs
    );
    return { action: 'respawn', delayMs, recentCrashes };
};
