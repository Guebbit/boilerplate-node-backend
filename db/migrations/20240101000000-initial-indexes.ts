import { collections, getCollection, type MigrationDatabase } from '../../src/migrations/helpers';

export const up = async (database: MigrationDatabase) => {
    await getCollection(database, collections.users).createIndex({ email: 1 }, { unique: true });
    await getCollection(database, collections.users).createIndex({ username: 1 }, { unique: true });
    await getCollection(database, collections.products).createIndex({ active: 1 });
    await getCollection(database, collections.products).createIndex({ deletedAt: 1 });
    await getCollection(database, collections.orders).createIndex({ userId: 1 });
};

export const down = async (database: MigrationDatabase) => {
    await getCollection(database, collections.users).dropIndex('email_1');
    await getCollection(database, collections.users).dropIndex('username_1');
    await getCollection(database, collections.products).dropIndex('active_1');
    await getCollection(database, collections.products).dropIndex('deletedAt_1');
    await getCollection(database, collections.orders).dropIndex('userId_1');
};
