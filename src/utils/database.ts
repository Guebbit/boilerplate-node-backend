import 'dotenv/config';
import { Sequelize } from 'sequelize';

export const database = new Sequelize(
    process.env.NODE_DB_DATABASE ?? "",
    process.env.NODE_DB_USERNAME ?? "",
    process.env.NODE_DB_PASSWORD ?? "", {
        dialect: 'mysql',
        host: process.env.NODE_DB_LOCALHOST ?? ""
    });

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
                await database.authenticate();
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