/**
 * This is the MAIN file of the repo (check "package.json") so we can use clusters.
 * If you don't need clusters, you can just change the MAIN attribute in the "package.json" and use "app.ts"
 */
import os from "os";
import cluster from "cluster";

/**
 * Cluster management
 * https://www.digitalocean.com/community/tutorials/how-to-scale-node-js-applications-with-clustering
 */
if (cluster.isPrimary) {

    /**
     * Master monitor and manage workers
     */
    // // Windows OS only settings (to guarantee standard round robin approach):
    // cluster.schedulingPolicy = cluster.SCHED_RR;
    // Get number of CPU
    const cpuCount = os.cpus().length;
    console.log(`The total number of CPUs is ${cpuCount}. Primary pid=${process.pid}`);
    // Use all possible cores
    for (let i = 0; i < cpuCount; i++)
        cluster.fork();
    // When a cluster exit\is closed, create a new one to replace it
    cluster.on("exit", (worker, code, signal) => {
        console.log(`worker ${worker.process.pid} has been killed. Starting another worker.`, { code, signal });
        cluster.fork();
    });
}else{

    /**
     * Workers execute the app module
     */
    import('./app');
}



