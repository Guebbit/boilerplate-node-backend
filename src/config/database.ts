import { Sequelize, Options } from 'sequelize';
import { env } from './environment';

// ─── Sequelize Configuration ──────────────────────────────────────────────────

const getSequelizeOptions = (): Options => {
  const baseOptions: Options = {
    logging: env.NODE_ENV === 'development' ? console.log : false,
    define: {
      underscored: true,
      timestamps: true,
    },
  };

  if (env.DB_DIALECT === 'sqlite') {
    return {
      ...baseOptions,
      dialect: 'sqlite',
      storage: env.NODE_ENV === 'test' ? ':memory:' : env.DB_STORAGE,
    };
  }

  return {
    ...baseOptions,
    dialect: env.DB_DIALECT,
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    username: env.DB_USER,
    password: env.DB_PASSWORD,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  };
};

// ─── Sequelize Instance ───────────────────────────────────────────────────────

export const sequelize = env.DB_DIALECT === 'sqlite'
  ? new Sequelize({
      ...getSequelizeOptions(),
      dialect: 'sqlite',
      storage: env.NODE_ENV === 'test' ? ':memory:' : env.DB_STORAGE,
    })
  : new Sequelize(
      env.DB_NAME ?? 'boilerplate',
      env.DB_USER ?? 'root',
      env.DB_PASSWORD ?? '',
      getSequelizeOptions(),
    );

/** Connect to the database and sync models */
export const connectDatabase = async (): Promise<void> => {
  await sequelize.authenticate();
  await sequelize.sync({ alter: env.NODE_ENV === 'development' });
  console.log(`Database connected (${env.DB_DIALECT})`);
};
