import { Sequelize } from 'sequelize';
import { logger } from './winston';

const MAX_RETRIES = 10;
const BASE_DELAY_MS = 1000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const dialect = (process.env.NODE_DB_DIALECT ??
    (process.env.NODE_ENV === 'test' ? 'sqlite' : 'mysql')) as 'mysql' | 'sqlite';

export const sequelize =
    dialect === 'sqlite'
        ? new Sequelize({
              dialect: 'sqlite',
              storage: process.env.NODE_DB_STORAGE ?? ':memory:',
              logging: false
          })
        : new Sequelize(
              process.env.NODE_DB_NAME ?? 'boilerplate_mysql',
              process.env.NODE_DB_USER ?? 'root',
              process.env.NODE_DB_PASS ?? '',
              {
                  dialect: 'mysql',
                  host: process.env.NODE_DB_HOST ?? '127.0.0.1',
                  port: Number(process.env.NODE_DB_PORT ?? 3306),
                  logging: false
              }
          );

let initialized = false;

const initializeModels = async () => {
    if (initialized) return;
    await import('@models/users');
    await import('@models/products');
    await import('@models/orders');
    await import('@models/cart-items');
    await import('@models/user-tokens');
    await import('@models/order-items');
    await import('@models/associations');
    initialized = true;
};

export const syncSchema = (force = false) =>
    initializeModels().then(() => sequelize.sync({ force }));

/**
 * Connect to SQL database with exponential-backoff retry.
 */
export const start = () => {
    const attemptConnect = (attempt: number): Promise<void> =>
        initializeModels()
            .then(() => sequelize.authenticate())
            .then(() => sequelize.sync())
            .then(() => {})
            .catch(() => {
                if (attempt >= MAX_RETRIES - 1)
                    throw new Error(`DB connection failed after ${MAX_RETRIES} attempts`);
                const delayMs = Math.min(BASE_DELAY_MS * 2 ** attempt, 30_000);
                logger.warn(
                    `DB not ready, retrying in ${delayMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
                );
                return wait(delayMs).then(() => attemptConnect(attempt + 1));
            });

    return attemptConnect(0);
};

export const connection = sequelize;
