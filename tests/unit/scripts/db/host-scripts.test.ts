/**
 * The database URI resolver behind `npm run host -- <script>`.
 *
 * The wrapper blanks `NODE_DB_URI` and redirects only the hostname, so the resolver has to fall
 * through to the host/port/name fragments from `.env` — and an EMPTY URI has to count as unset (a
 * `!== undefined` check would not). That fall-through is what the cases below pin.
 */

import { getDatabaseUri } from '@infrastructure/runtime/database';
import { setEnvironment } from '@tests/environment';

const MONGO_VARS = [
    'NODE_DB_URI',
    'NODE_MONGODB_HOST',
    'NODE_MONGODB_PORT',
    'NODE_MONGODB_NAME'
] as const;

describe('database URI resolution', () => {
    // The Mongo variables are unset before every case, so an ambient value never decides one.
    beforeEach(() => {
        setEnvironment(Object.fromEntries(MONGO_VARS.map((key) => [key, undefined])));
    });

    it('prefers an explicit NODE_DB_URI', () => {
        setEnvironment({ NODE_DB_URI: 'mongodb+srv://user:pw@cluster.example/appdb' });
        setEnvironment({ NODE_MONGODB_NAME: 'ignored' });

        expect(getDatabaseUri()).toBe('mongodb+srv://user:pw@cluster.example/appdb');
    });

    /**
     * The check that makes `:host` work. Written as its own test because it is the one line most
     * likely to be "corrected" to `!== undefined` by someone who reads an empty URI as a mistake
     * rather than as a deliberate signal.
     */
    it('falls through to the fragments when NODE_DB_URI is EMPTY', () => {
        setEnvironment({ NODE_DB_URI: '' });
        setEnvironment({ NODE_MONGODB_HOST: 'localhost' });
        setEnvironment({ NODE_MONGODB_PORT: '27017' });
        setEnvironment({ NODE_MONGODB_NAME: 'renamed-db' });

        expect(getDatabaseUri()).toBe('mongodb://localhost:27017/renamed-db');
    });

    it('honours a renamed database — the failure this whole change is about', () => {
        setEnvironment({ NODE_DB_URI: '' });
        setEnvironment({ NODE_MONGODB_HOST: 'localhost' });
        setEnvironment({ NODE_MONGODB_NAME: 'my-actual-data' });

        // A hardcoded URI would produce `…/boilerplate-node-backend` here, seeding a database the
        // developer never heard of while their real one sat untouched.
        expect(getDatabaseUri()).toContain('/my-actual-data');
        expect(getDatabaseUri()).not.toContain('boilerplate-node-backend');
    });

    it('defaults host, port and name when nothing is configured', () => {
        expect(getDatabaseUri()).toBe('mongodb://127.0.0.1:27017/boilerplate-node-backend');
    });
});
