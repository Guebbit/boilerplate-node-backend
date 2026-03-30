/**
 * Get execution time of any function
 * @param function_ - the function to time
 */
export default async function getExecTime<T>(function_: () => T) {
    // execute function between two timestamps
    const start = process.hrtime.bigint();
    const result = await function_();
    const end = process.hrtime.bigint();

    return {
        result,
        // get execution time in milliseconds
        time: Number(end - start) / 1_000_000
    };
}