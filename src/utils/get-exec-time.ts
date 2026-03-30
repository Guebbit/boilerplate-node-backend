/**
 * Get execution time of any function
 * @param fn
 */
export default async function getExecTime<T>(fn: () => T) {
    // execute function between two timestamps
    const start = process.hrtime.bigint();
    const result = await fn();
    const end = process.hrtime.bigint();

    return {
        result,
        // get execution time in milliseconds
        time: Number(end - start) / 1_000_000
    };
}