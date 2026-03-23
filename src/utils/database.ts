import { Sequelize } from "sequelize";
import logger from "./winston";

const MAX_RETRIES = 10;
const BASE_DELAY_MS = 1000;

const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Sequelize instance.
 * Uses SQLite in-memory when NODE_ENV=test, MySQL otherwise.
 */
export const sequelize =
    process.env.NODE_ENV === 'test'
        ? new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
        : new Sequelize(process.env.NODE_DB_URI ?? '', {
              dialect: 'mysql',
              logging: false,
          });

/**
 * Connect to MySQL with exponential-backoff retry.
 * Each failed attempt doubles the delay, capped at 30 seconds.
 * Syncs models after a successful connection.
 * Throws if all attempts are exhausted.
 */
export const start = async (): Promise<void> => {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            await sequelize.authenticate();
            // Create tables if they don't exist yet (non-destructive)
            await sequelize.sync({ alter: false });
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

export default sequelize;
