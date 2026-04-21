import type { Db } from 'mongodb';

export type MigrationDatabase = Db;

export const collections = {
    users: 'users',
    products: 'products',
    orders: 'orders'
} as const;

export const getCollection = (database: MigrationDatabase, name: string) => database.collection(name);
