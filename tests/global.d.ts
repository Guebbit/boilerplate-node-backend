import type { MongoMemoryServer } from 'mongodb-memory-server';

declare global {
    // Shared between jest globalSetup and globalTeardown to manage the
    // in-memory MongoDB instance lifecycle across the two modules.
    var __MONGOD__: MongoMemoryServer | undefined;
}
