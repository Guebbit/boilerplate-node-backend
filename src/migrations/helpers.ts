import type { Db } from 'mongodb';

export type MigrationDatabase = Db;

/**
 * Keep migration collection names centralized so schema changes stay consistent across scripts.
 */
export const collections = {
    users: 'users',
    products: 'products',
    orders: 'orders'
} as const;

type MigrationCollectionName = (typeof collections)[keyof typeof collections];

/**
 * Narrow collection access to the known migration set instead of arbitrary string names.
 */
export const getCollection = (database: MigrationDatabase, name: MigrationCollectionName) =>
    database.collection(name);
