import type { Request, Response } from "express";


/**
 * Heavy load test
 *
 * @param request
 * @param response
 */
export const getHeavyLoad = (request: Request, response: Response) => {
    const totalLoad = 20_000;
    let progressLoad = 0;
    for (let i = 0; i < totalLoad; i++) {
        progressLoad++;
        // eslint-disable-next-line no-console
        console.log(`Worker ${ process.pid } at ${ Math.round((progressLoad / totalLoad) * 100) }% of task`)
    }
    response.send(`The result of the CPU intensive task is ${ progressLoad }\n`);
}