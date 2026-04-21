import type { Db } from 'mongodb';

export type MigrationDatabase = Db;

export const collections = {
    users: 'users',
    products: 'products',
    orders: 'orders'
} as const;

type MigrationCollectionName = (typeof collections)[keyof typeof collections];

export const getCollection = (database: MigrationDatabase, name: MigrationCollectionName) =>
    database.collection(name);
