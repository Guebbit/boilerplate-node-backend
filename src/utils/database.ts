import mongoose from "mongoose";
import logger from "./winston";

const MAX_RETRIES = 10;
const BASE_DELAY_MS = 1_000;

const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Connect to MongoDB with exponential-backoff retry.
 * Each failed attempt doubles the delay, capped at 30 seconds.
 * Throws if all attempts are exhausted.
 */
export const start = async (): Promise<void> => {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            await mongoose.connect(process.env.NODE_DB_URI ?? "");
            return;
        } catch {
            if (attempt >= MAX_RETRIES - 1)
                throw new Error(`DB connection failed after ${MAX_RETRIES} attempts`);
            const delayMs = Math.min(BASE_DELAY_MS * 2 ** attempt, 30_000);
            logger.warn(`DB not ready, retrying in ${delayMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
            await wait(delayMs);
        }
    }
};

/**
 * The active Mongoose connection.
 * Available after `start()` resolves.
 */
export const database = mongoose.connection;

export default mongoose.connection;
