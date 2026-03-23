/**
 * This is the MAIN file of the repo (check "package.json") so we can use clusters.
 * If you don't need clusters, you can just change the MAIN attribute in the "package.json" and use "app.ts"
 */
import os from "node:os";
import cluster from "node:cluster";
import logger from "@utils/winston";

/**
 * Cluster management
 * https://www.digitalocean.com/community/tutorials/how-to-scale-node-js-applications-with-clustering
 */
if (cluster.isPrimary && process.env.NODE_ENABLE_CLUSTERING === '1') {

    /**
     * Master monitor and manage workers
     *
     * Windows OS only settings (to guarantee standard round robin approach):
     * cluster.schedulingPolicy = cluster.SCHED_RR;
     * Get number of CPU
     */
    const cpuCount = os.cpus().length;
    logger.info(`The total number of CPUs is ${ cpuCount }. Primary pid=${ process.pid }`);
    // Use all possible cores
    for (let i = 0; i < cpuCount; i++)
        cluster.fork();
    // When a cluster exit\is closed, create a new one to replace it
    cluster.on("exit", (worker, code, signal) => {
        logger.info(`worker ${ worker.process.pid } has been killed. Starting another worker.`, { code, signal });
        cluster.fork();
    });
} else {

    /**
     * Workers execute the app module
     */

    import('./app');
}



