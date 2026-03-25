/**
 * In-memory MongoDB test environment helpers.
 *
 * Overview
 * --------
 * `mongodb-memory-server` spins up a real `mongod` process bound to a random
 * port on localhost.  Mongoose connects to it exactly as it would connect to a
 * production cluster, so every model, schema hook and aggregation pipeline
 * executes against genuine MongoDB — without touching any real database.
 *
 * Lifecycle pattern
 * -----------------
 * Paste these three lines into every test file that needs the database:
 *
 *   import { connect, disconnect, clearAll } from '../helpers/database';
 *
 *   beforeAll(connect);   // start server + connect Mongoose (once per suite)
 *   afterAll(disconnect); // drop DB, close connection, stop server
 *   beforeEach(clearAll); // wipe all collections → each test starts empty
 *
 * Why clearAll instead of disconnect/connect per test?
 * -------------------------------------------------------
 * Restarting the server for every test is slow (~200 ms per start).
 * Deleting all documents is fast (~1 ms) and gives the same isolation
 * guarantee: each test builds exactly the state it needs from scratch.
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

/** Singleton server instance — shared for the lifetime of one Jest worker. */
let mongoServer: MongoMemoryServer;

/**
 * Start an in-memory MongoDB server and connect Mongoose to it.
 *
 * Call once inside `beforeAll()` of each test suite.
 * Jest runs every test *file* in its own worker process, so each file gets its
 * own isolated server; there is no cross-file contention.
 */
export const connect = async (): Promise<void> => {
    // Create a fresh server on an OS-assigned free port
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();

    // Connect Mongoose — all models registered on this connection will use the
    // in-memory database automatically
    await mongoose.connect(uri);
};

/**
 * Drop the database, close the Mongoose connection, and stop the server.
 *
 * Call once inside `afterAll()` of each test suite.
 */
export const disconnect = async (): Promise<void> => {
    // Drop ensures no stale data leaks if the server is somehow reused
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    await mongoServer.stop();
};

/**
 * Delete every document from every collection.
 *
 * Call inside `beforeEach()` so each individual test starts with an empty
 * database.  This makes tests deterministic: a test's outcome depends only on
 * the data it inserts itself, never on the residue of a previous test.
 */
export const clearAll = async (): Promise<void> => {
    const { collections } = mongoose.connection;
    for (const key of Object.keys(collections)) {
        await collections[key].deleteMany({});
    }
};
