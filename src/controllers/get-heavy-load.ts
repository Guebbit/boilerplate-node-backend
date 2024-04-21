import type { Request, Response } from "express";


/**
 * Heavy load test
 *
 * @param req
 * @param res
 */
export default (req: Request, res: Response) => {
    const totalLoad = 20000;
    let progressLoad = 0;
    for (let i = 0; i < totalLoad; i++) {
        progressLoad++;
        console.log(`Worker ${process.pid} at ${Math.round((progressLoad/totalLoad) * 100)}% of task`)
    }
    res.send(`The result of the CPU intensive task is ${progressLoad}\n`);
}