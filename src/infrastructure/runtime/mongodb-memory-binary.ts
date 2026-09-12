/**
 * @module
 * Point `mongodb-memory-server` at a pre-installed `mongod` when one is on disk, so the test suite
 * and the demo profile both skip its ~100MB first-run download. `npm run setup:mongod` is what
 * puts the binary there.
 */

import { existsSync } from 'node:fs';

/** Where `npm run setup:mongod` places the binary, absent an override. */
const DEFAULT_BINARY_PATH = '/tmp/mongod';

/**
 * Sets the `mongodb-memory-server` env vars that skip its download and version check, but only
 * when the binary the caller names (or {@link DEFAULT_BINARY_PATH}) actually exists — otherwise
 * this is a no-op and the library downloads its own copy at runtime.
 */
export const usePreinstalledMongodBinary = (): void => {
    const systemBinary = process.env.MONGOMS_SYSTEM_BINARY ?? DEFAULT_BINARY_PATH;
    if (!existsSync(systemBinary)) return;

    process.env.MONGOMS_SYSTEM_BINARY = systemBinary;
    process.env.MONGOMS_SYSTEM_BINARY_VERSION_CHECK = 'false';
    process.env.MONGOMS_MD5_CHECK = 'false';
};
