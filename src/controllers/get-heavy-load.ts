import type { Request, Response } from "express";
import getExecTime from "../utils/get-exec-time";


/**
 * Heavy load test
 *
 * @param req
 * @param res
 */
export default async (req: Request, res: Response) => {
    const { time } = await getExecTime(() => {
        const totalLoad = 20_000;
        let progressLoad = 0;
        for (let i = 0; i < totalLoad; i++) {
            progressLoad++;
            // eslint-disable-next-line no-console
            console.log(`Worker ${process.pid} at ${Math.round((progressLoad/totalLoad) * 100)}% of task`)
        }
    });

    res.status(200).json({
        success: true,
        message: `The CPU intensive task required ${time}ms \n`
    })
}