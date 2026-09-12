/**
 * `usePreinstalledMongodBinary` — whether it sets `mongodb-memory-server`'s skip-download env vars
 * depends entirely on whether the named binary exists on disk, so this suite drives it against a
 * real file and a real absent path rather than mocking `existsSync`. Always sets
 * `MONGOMS_SYSTEM_BINARY` explicitly: the fallback default (`/tmp/mongod`) is a shared, host-wide
 * path this suite must not create, delete, or assume the state of.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { usePreinstalledMongodBinary } from '@infrastructure/runtime/mongodb-memory-binary';

const ENV_KEYS = [
    'MONGOMS_SYSTEM_BINARY',
    'MONGOMS_SYSTEM_BINARY_VERSION_CHECK',
    'MONGOMS_MD5_CHECK'
] as const;

/** Every relevant var, saved so each case restores exactly what it found. */
const ORIGINAL = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
    for (const key of ENV_KEYS) {
        if (ORIGINAL[key] === undefined) delete process.env[key];
        else process.env[key] = ORIGINAL[key];
    }
});

describe('usePreinstalledMongodBinary', () => {
    it('sets the skip-download vars when the overridden path exists', () => {
        const directory = mkdtempSync(path.join(tmpdir(), 'mongod-binary-test-'));
        const binary = path.join(directory, 'mongod');
        writeFileSync(binary, '');

        try {
            process.env.MONGOMS_SYSTEM_BINARY = binary;

            usePreinstalledMongodBinary();

            expect(process.env.MONGOMS_SYSTEM_BINARY).toBe(binary);
            expect(process.env.MONGOMS_SYSTEM_BINARY_VERSION_CHECK).toBe('false');
            expect(process.env.MONGOMS_MD5_CHECK).toBe('false');
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });

    it('leaves an overridden but non-existent path unset', () => {
        process.env.MONGOMS_SYSTEM_BINARY = '/definitely/not/a/real/path/mongod';

        usePreinstalledMongodBinary();

        expect(process.env.MONGOMS_SYSTEM_BINARY_VERSION_CHECK).toBeUndefined();
        expect(process.env.MONGOMS_MD5_CHECK).toBeUndefined();
    });
});
