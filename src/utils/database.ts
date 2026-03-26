import { Sequelize } from "sequelize-typescript";
import { Dialect } from "sequelize";
import logger from "./winston";
import path from "path";

const MAX_RETRIES = 10;
const BASE_DELAY_MS = 1000;

const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

// Determine dialect based on environment (SQLite for testing)
const dialect: Dialect = process.env.NODE_ENV === 'test' ? 'sqlite' : 'mysql';
const storage = process.env.NODE_ENV === 'test' ? ':memory:' : undefined;

/**
 * Sequelize instance for MySQL database (or SQLite in test mode)
 */
export const sequelize = new Sequelize({
    dialect,
    storage,
    host: process.env.NODE_DB_HOST ?? "localhost",
    port: Number.parseInt(process.env.NODE_DB_PORT ?? "3306", 10),
    database: process.env.NODE_DB_NAME ?? "boilerplate_db",
    username: process.env.NODE_DB_USER ?? "root",
    password: process.env.NODE_DB_PASSWORD ?? "",
    logging: process.env.NODE_ENV === "development" ? (msg) => logger.debug(msg) : false,
    models: [path.join(__dirname, "..", "models")],
    pool: {
        max: 10,
        min: 0,
        acquire: 30000,
        idle: 10000,
    },
});

/**
 * Connect to MySQL with exponential-backoff retry.
 * Each failed attempt doubles the delay, capped at 30 seconds.
 * Throws if all attempts are exhausted.
 */
export const start = async (): Promise<void> => {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            await sequelize.authenticate();
            logger.info("Database connection established successfully");

            // Sync models in development (creates tables if they don't exist)
            if (process.env.NODE_ENV === "development") {
                await sequelize.sync({ alter: false });
                logger.info("Database models synchronized");
            }

            return;
        } catch (error) {
            if (attempt >= MAX_RETRIES - 1)
                throw new Error(`DB connection failed after ${MAX_RETRIES} attempts: ${error}`);
            const delayMs = Math.min(BASE_DELAY_MS * 2 ** attempt, 30_000);
            logger.warn(`DB not ready, retrying in ${delayMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
            await wait(delayMs);
        }
    }
};

/**
 * Close database connection
 */
export const close = async (): Promise<void> => {
    await sequelize.close();
};

export default sequelize;
