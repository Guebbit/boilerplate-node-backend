import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env file
dotenv.config();

// ─── Environment Schema ───────────────────────────────────────────────────────

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DB_DIALECT: z.enum(['sqlite', 'postgres', 'mysql', 'mariadb', 'mssql']).default('sqlite'),
  DB_STORAGE: z.string().default('./database.sqlite'),
  DB_HOST: z.string().optional(),
  DB_PORT: z.coerce.number().optional(),
  DB_NAME: z.string().optional(),
  DB_USER: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  JWT_SECRET: z.string().min(16).default('default-secret-change-in-production'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  BCRYPT_ROUNDS: z.coerce.number().default(10),
});

// ─── Parse and Export ─────────────────────────────────────────────────────────

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
