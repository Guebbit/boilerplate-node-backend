/**
 * Get execution time of any function
 * @param function_ - the function to time
 */
export function getExecTime<T>(function_: () => T | Promise<T>) {
    // execute function between two timestamps
    const start = process.hrtime.bigint();
    return Promise.resolve(function_()).then((result) => {
        const end = process.hrtime.bigint();
        return {
            result,
            // get execution time in milliseconds
            time: Number(end - start) / 1_000_000
        };
    });
}
