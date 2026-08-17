/**
 * One reading of the process, in the units the process reports.
 *
 * Three payloads describe this process: the SSE frame built in `./stream.ts`, and the two REST
 * endpoints in `modules/observability/controllers/`. Each used to call `process.memoryUsage()` and
 * `process.uptime()` for itself, which cost more than the duplication suggests. Three readings
 * taken at three instants can disagree; two converted to megabytes and one did not; and the two
 * roundings differed — `Math.round` on the stream against `Math.floor` on both controllers — so
 * the health endpoint and the live stream reported uptimes a second apart, forever, with no bug
 * behind it.
 *
 * They all read from here now, and the wire units are bytes everywhere. Megabytes is a
 * PRESENTATION decision and a lossy one: `heapUsedMb: 41` cannot tell a leak hunter whether the
 * heap moved by 400 KB between two polls, which is exactly what a dashboard differencing
 * consecutive frames is looking for. The API states the measurement; whoever renders it states the
 * formatting.
 *
 * ## The one reading that must NOT come from here
 *
 * `./metrics-http.ts` reads `process.uptime()` inside a prom-client `Gauge`, whose `collect()` runs
 * at scrape time. It is not composing a payload — it is answering someone else's contract at the
 * instant that contract asks. Folding it in here would make it report a value from the wrong
 * moment. `tests/cross-cutting/process-snapshot.test.ts` allows that one call by name and forbids
 * every other reading in `src/`, so the fourth copy has somewhere to go instead of somewhere to
 * appear.
 */

/** Process memory in bytes — the four fields every payload publishes, and no more. */
export interface ProcessMemorySnapshot {
    /**
     * Resident Set Size — total physical memory held by the process, the number that matters
     * against a container memory limit.
     */
    rss: number;
    /** Live JS objects. Steady growth across restart-free uptime = likely leak. */
    heapUsed: number;
    /** Heap currently allocated from the OS (`heapUsed` <= `heapTotal`). */
    heapTotal: number;
    /** Off-heap memory bound to JS objects — Buffers, and native addon allocations. */
    external: number;
}

/** The process at one instant: memory in bytes, uptime in whole seconds. */
export interface ProcessSnapshot {
    /**
     * Seconds since process start, floored.
     *
     * Floored rather than rounded, and the same way in all three payloads. Every contract types
     * this `integer`, so the choice decides nothing except whether two endpoints polled together
     * are allowed to disagree — and they are not.
     */
    uptimeSeconds: number;
    memory: ProcessMemorySnapshot;
}

/**
 * Read the process once.
 *
 * Both underlying calls happen together, so every number in one snapshot describes the same
 * instant — which is the property three separate readings could not offer.
 */
export const processSnapshot = (): ProcessSnapshot => {
    const memory = process.memoryUsage();

    return {
        uptimeSeconds: Math.floor(process.uptime()),
        /*
         * Picked field by field rather than spread. `process.memoryUsage()` also returns
         * `arrayBuffers`, which appears in none of the three contracts — a spread would publish it,
         * and would publish whatever Node adds next along with it.
         */
        memory: {
            rss: memory.rss,
            heapUsed: memory.heapUsed,
            heapTotal: memory.heapTotal,
            external: memory.external
        }
    };
};
