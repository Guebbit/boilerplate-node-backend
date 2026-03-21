import mongoose from "mongoose";

export const database = mongoose.connect(process.env.NODE_DB_URI ?? "");


/**
 * Connection retry
 */
export const start = () => {
    let retries = 10;

    // eslint-disable-next-line unicorn/consistent-function-scoping
    const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

    return (async () => {
        while (retries) {
            try {
                await database;
                return;
            } catch {
                // eslint-disable-next-line no-console
                console.log("------------- DB NOT READY, RETRYING -------------", retries);
                retries--;
                await wait(2000);
            }
        }

        throw new Error("DB connection failed"); // ❌ rejects
    })();
};

export default database;