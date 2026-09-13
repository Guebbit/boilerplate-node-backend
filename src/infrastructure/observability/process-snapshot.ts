/**
 * @module
 * One reading of the process, in the units it reports. Three payloads (the SSE stream and two
 * REST endpoints) read from here rather than calling `process.memoryUsage()`/`process.uptime()`
 * themselves, since separate readings can disagree and drift with no bug behind it. Units are
 * bytes everywhere. `metrics-http.ts` is the one exception, reading `process.uptime()` itself
 * since its prom-client `Gauge` must answer at scrape time.
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
     * Seconds since process start, floored — the same way in all three payloads, so two
     * endpoints polled together cannot disagree (every contract types this `integer`).
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
