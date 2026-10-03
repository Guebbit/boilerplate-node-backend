/**
 * `src/infrastructure/runtime/config.ts` — the process's own slices, and the one definition of
 * "not a deployment".
 *
 * `isRelaxedEnvironment` is exhaustive on what is NOT relaxed, because the failure it exists to
 * close is silent: an unset or misspelt `NODE_ENV` that left every safety switch off.
 */
import {
    clusterConfig,
    databaseConfig,
    isRelaxedEnvironment,
    isTestEnvironment,
    loggingConfig,
    nodeEnvironment,
    serverConfig
} from '@infrastructure/runtime/config';
import {
    withEnvironment,
    withoutEnvironment,
    withoutEnvironmentInThisFile,
    setEnvironment
} from '@tests/environment';

withoutEnvironmentInThisFile([
    'NODE_ENV',
    'NODE_PORT',
    'NODE_HOST',
    'NODE_DB_URI',
    'NODE_MONGODB_PORT',
    'NODE_ENABLE_CLUSTERING',
    'NODE_CLUSTER_CRASH_LIMIT',
    'NODE_LOG_LEVEL',
    'NODE_LOG_PERSONAL_FIELDS'
]);

describe('isRelaxedEnvironment', () => {
    it.each(['development', 'test'])('is relaxed for %s', (value) => {
        setEnvironment({ NODE_ENV: value });

        expect(isRelaxedEnvironment()).toBe(true);
    });

    it.each(['production', 'staging', 'Production', 'dev', ' development', 'test '])(
        'is strict for %p — a typo must not turn the safety switches off',
        (value) => {
            setEnvironment({ NODE_ENV: value });

            expect(isRelaxedEnvironment()).toBe(false);
        }
    );

    it('is strict when NODE_ENV is unset', () => {
        expect(isRelaxedEnvironment()).toBe(false);
    });
});

describe('isTestEnvironment and nodeEnvironment', () => {
    it('is a test only for exactly `test`', () => {
        setEnvironment({ NODE_ENV: 'test' });
        expect(isTestEnvironment()).toBe(true);
        expect(nodeEnvironment()).toBe('test');

        setEnvironment({ NODE_ENV: 'development' });
        expect(isTestEnvironment()).toBe(false);
    });
});

describe('the server slice', () => {
    it('defaults the port and reads an override', () => {
        expect(serverConfig().NODE_PORT).toBe(3000);
        setEnvironment({ NODE_PORT: '8081' });

        expect(serverConfig().NODE_PORT).toBe(8081);
    });

    it.each(['0', '70000', 'abc', '3000x'])('refuses the port %p', (value) => {
        setEnvironment({ NODE_PORT: value });

        expect(() => serverConfig()).toThrow(/NODE_PORT/);
    });

    it('leaves the host unset by default, which binds every interface', () => {
        expect(serverConfig().NODE_HOST).toBeUndefined();
    });
});

describe('the database slice', () => {
    it('defaults to a local database', () => {
        expect(databaseConfig()).toMatchObject({
            NODE_MONGODB_HOST: '127.0.0.1',
            NODE_MONGODB_PORT: 27_017,
            NODE_MONGODB_NAME: 'boilerplate-node-backend'
        });
    });

    it('reads a blank URI as unset, which is how `npm run host` reaches a container', () => {
        setEnvironment({ NODE_DB_URI: '' });

        expect(databaseConfig().NODE_DB_URI).toBeUndefined();
    });

    it('refuses a junk port instead of building a broken URI from it', () => {
        setEnvironment({ NODE_MONGODB_PORT: 'mongo' });

        expect(() => databaseConfig()).toThrow(/NODE_MONGODB_PORT/);
    });
});

describe('the cluster slice', () => {
    it('is off by default, with the documented crash limit', () => {
        expect(clusterConfig()).toMatchObject({
            NODE_ENABLE_CLUSTERING: false,
            NODE_CLUSTER_CRASH_LIMIT: 10
        });
    });

    it('accepts both switch vocabularies', () => {
        setEnvironment({ NODE_ENABLE_CLUSTERING: '1' });
        expect(clusterConfig().NODE_ENABLE_CLUSTERING).toBe(true);

        setEnvironment({ NODE_ENABLE_CLUSTERING: 'off' });
        expect(clusterConfig().NODE_ENABLE_CLUSTERING).toBe(false);
    });

    it('refuses a crash limit of zero: it would give up before the first respawn', () => {
        setEnvironment({ NODE_CLUSTER_CRASH_LIMIT: '0' });

        expect(() => clusterConfig()).toThrow(/NODE_CLUSTER_CRASH_LIMIT/);
    });
});

describe('the logging slice', () => {
    it('hashes personal fields by default', () => {
        expect(loggingConfig().NODE_LOG_PERSONAL_FIELDS).toBe('hash');
    });

    it('refuses a mode that is not one of the three', () => {
        setEnvironment({ NODE_LOG_PERSONAL_FIELDS: 'sha256' });

        expect(() => loggingConfig()).toThrow(/NODE_LOG_PERSONAL_FIELDS/);
    });

    it('reads a level case-insensitively, and refuses one winston does not know', () => {
        setEnvironment({ NODE_LOG_LEVEL: 'DEBUG' });
        expect(loggingConfig().NODE_LOG_LEVEL).toBe('debug');

        setEnvironment({ NODE_LOG_LEVEL: 'loud' });
        expect(() => loggingConfig()).toThrow(/NODE_LOG_LEVEL/);
    });
});

describe('the helpers restore what they touched', () => {
    it('sets and unsets through the environment helpers', async () => {
        await withEnvironment('NODE_ENV', 'production', () => {
            expect(isRelaxedEnvironment()).toBe(false);
            return Promise.resolve();
        });
        await withoutEnvironment(['NODE_PORT'], () => {
            expect(serverConfig().NODE_PORT).toBe(3000);
            return Promise.resolve();
        });
    });
});
