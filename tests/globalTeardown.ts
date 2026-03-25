import './global';

/**
 * Jest global teardown — runs once after all test suites in the main process.
 * Stops the in-memory MongoDB server that was started by globalSetup (if any).
 */
export default async function globalTeardown(): Promise<void> {
    await globalThis.__MONGOD__?.stop();
}
