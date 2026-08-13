/**
 * The `host` npm script, and the two URI resolvers it depends on.
 *
 * `npm run host -- <script>` exists so a developer can run anything against the containerised
 * database WITHOUT being in a container. That means overriding one thing — the hostname — and
 * nothing else. A script that spells out a whole `mongodb://localhost:27017/boilerplate-node-backend`
 * hardcodes the database NAME and ignores `NODE_MONGODB_NAME`, so renaming the database in `.env`
 * has `npm run host -- db:seed` cheerfully seed a different one, silently, with no output naming
 * which.
 *
 * So the wrapper blanks `NODE_DB_URI` / `NODE_REDIS_URL` and sets only `*_HOST=localhost`, letting
 * both resolvers fall through to their host/port/name fragments — which come from `.env`, the
 * single source of truth. Four things have to stay true for that to keep working, and each is
 * asserted below:
 *
 *   1. The wrapper does not reintroduce a literal URI.
 *   2. It stays the ONLY script that redirects a hostname — the per-script `:host` twins it
 *      replaced were seven copies of one env prefix, and seven chances to copy it wrong.
 *   3. An EMPTY URI falls through to the fragments (a `!== undefined` check would not).
 *   4. `migrate-mongo-config.js` resolves the same URI as the application, despite having to
 *      reimplement the logic — it is CommonJS loaded by migrate-mongo's own resolver, and it
 *      cannot import a TypeScript module.
 *
 * (3) is the load-bearing one and the easiest to break by "tidying" a truthiness check.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getDatabaseUri } from '@infrastructure/runtime/database';

/**
 * `migrate-mongo-config.js` calls `dotenv.config()` at load. That would let this machine's `.env`
 * leak into the matrix below and make the results unreproducible, so it is stubbed out — these
 * tests are about URI resolution, not about dotenv.
 */
jest.mock('dotenv', () => ({ config: () => ({ parsed: {} }) }));

const ROOT = path.join(__dirname, '../../..');

const packageScripts: Record<string, string> = JSON.parse(
    readFileSync(path.join(ROOT, 'package.json'), 'utf8')
).scripts;

const hostScript = packageScripts.host;

/**
 * Re-evaluate the migrate-mongo config against the CURRENT env — it resolves the URI at load, so
 * a plain top-level import would freeze one answer and the matrix below would test nothing.
 *
 * `require` inside `isolateModules` is the only thing that re-runs a CommonJS module: `import()`
 * would hand back the same cached namespace. The lint rule is disabled rather than worked around
 * because loading this file the way migrate-mongo loads it is the entire point of the test.
 */
const migrateMongoUri = (): string => {
    let url = '';
    jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        url = (require(path.join(ROOT, 'migrate-mongo-config.js')) as { mongodb: { url: string } })
            .mongodb.url;
    });
    return url;
};

const MONGO_VARS = [
    'NODE_DB_URI',
    'NODE_MONGODB_HOST',
    'NODE_MONGODB_PORT',
    'NODE_MONGODB_NAME'
] as const;

describe('the host script', () => {
    it('exists, so the assertions below are not vacuous', () => {
        expect(hostScript).toBeDefined();
    });

    it('spells out no connection URI', () => {
        // The original bug in its most direct form. A literal URI carries a database name with
        // it, and that name then contradicts `.env` the moment anyone changes one of them.
        expect(hostScript).not.toMatch(/mongodb(\+srv)?:\/\/\S/);
        expect(hostScript).not.toMatch(/redis:\/\/\S/);
    });

    it('never names a database', () => {
        // Belt and braces: catches a name arriving through some route other than a full URI,
        // e.g. someone "helpfully" adding NODE_MONGODB_NAME=… back into the script.
        expect(hostScript).not.toContain('NODE_MONGODB_NAME');
        expect(hostScript).not.toContain('boilerplate-node-backend');
    });

    it('blanks both URIs and redirects only the hostnames', () => {
        // The mechanism itself. `NODE_DB_URI=` (empty) is what makes the resolver fall through to
        // the fragments; without the paired host override it would fall through to `.env`'s
        // container hostname, which does not resolve from the host.
        expect(hostScript).toContain('NODE_DB_URI= ');
        expect(hostScript).toContain('NODE_MONGODB_HOST=localhost');
        expect(hostScript).toContain('NODE_REDIS_URL= ');
        expect(hostScript).toContain('NODE_REDIS_HOST=localhost');
    });

    it('delegates rather than naming a command of its own', () => {
        // `npm run host -- db:seed` works because the wrapper ENDS in `npm run`: npm appends the
        // arguments after `--`. Anything after that would silently swallow the script name.
        expect(hostScript.trimEnd()).toMatch(/\bnpm run$/);
    });

    it('is the only script that redirects a hostname', () => {
        // The seven `:host` twins this replaced were one env prefix copied seven times, and
        // `db:cache:clear:host` had already drifted — it blanked Redis but not Mongo. One wrapper
        // cannot drift from itself, so the invariant worth guarding is that it stays one.
        const redirectors = Object.entries(packageScripts)
            .filter(([, command]) => command.includes('_HOST=localhost'))
            .map(([name]) => name);

        expect(redirectors).toEqual(['host']);
    });
});

describe('database URI resolution', () => {
    const saved = new Map<string, string | undefined>();

    beforeEach(() => {
        for (const key of MONGO_VARS) {
            saved.set(key, process.env[key]);
            delete process.env[key];
        }
    });

    afterEach(() => {
        for (const [key, value] of saved)
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
    });

    it('prefers an explicit NODE_DB_URI', () => {
        process.env.NODE_DB_URI = 'mongodb+srv://user:pw@cluster.example/appdb';
        process.env.NODE_MONGODB_NAME = 'ignored';

        expect(getDatabaseUri()).toBe('mongodb+srv://user:pw@cluster.example/appdb');
    });

    /**
     * The check that makes `:host` work. Written as its own test because it is the one line most
     * likely to be "corrected" to `!== undefined` by someone who reads an empty URI as a mistake
     * rather than as a deliberate signal.
     */
    it('falls through to the fragments when NODE_DB_URI is EMPTY', () => {
        process.env.NODE_DB_URI = '';
        process.env.NODE_MONGODB_HOST = 'localhost';
        process.env.NODE_MONGODB_PORT = '27017';
        process.env.NODE_MONGODB_NAME = 'renamed-db';

        expect(getDatabaseUri()).toBe('mongodb://localhost:27017/renamed-db');
    });

    it('honours a renamed database — the failure this whole change is about', () => {
        process.env.NODE_DB_URI = '';
        process.env.NODE_MONGODB_HOST = 'localhost';
        process.env.NODE_MONGODB_NAME = 'my-actual-data';

        // The old scripts produced `…/boilerplate-node-backend` here, seeding a database the
        // developer had never heard of while their real one sat untouched.
        expect(getDatabaseUri()).toContain('/my-actual-data');
        expect(getDatabaseUri()).not.toContain('boilerplate-node-backend');
    });

    it('defaults host, port and name when nothing is configured', () => {
        expect(getDatabaseUri()).toBe('mongodb://127.0.0.1:27017/boilerplate-node-backend');
    });
});

/**
 * `migrate-mongo-config.js` duplicates `getDatabaseUri()` because it cannot import it. The
 * duplication is allowed to exist ONLY because this block proves the two agree — without it,
 * `npm run host -- db:migrate:up` drifting away from `npm run host -- db:seed` is exactly the
 * silent wrong-database failure the change was meant to end, just relocated.
 */
describe('migrate-mongo agrees with the application', () => {
    const saved = new Map<string, string | undefined>();

    beforeEach(() => {
        for (const key of MONGO_VARS) {
            saved.set(key, process.env[key]);
            delete process.env[key];
        }
    });

    afterEach(() => {
        for (const [key, value] of saved)
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
    });

    const matrix: [name: string, env: Partial<Record<(typeof MONGO_VARS)[number], string>>][] = [
        ['nothing configured', {}],
        ['explicit URI', { NODE_DB_URI: 'mongodb://db.example:27017/prod' }],
        [
            'the :host shape',
            { NODE_DB_URI: '', NODE_MONGODB_HOST: 'localhost', NODE_MONGODB_NAME: 'renamed-db' }
        ],
        [
            'the :host shape on a non-default port',
            {
                NODE_DB_URI: '',
                NODE_MONGODB_HOST: 'localhost',
                NODE_MONGODB_PORT: '27018',
                NODE_MONGODB_NAME: 'renamed-db'
            }
        ],
        ['fragments only', { NODE_MONGODB_HOST: 'database', NODE_MONGODB_NAME: 'compose-db' }],
        ['an empty URI and no fragments at all', { NODE_DB_URI: '' }]
    ];

    it.each(matrix)('resolves the same URI with %s', (_name, env) => {
        Object.assign(process.env, env);

        expect(migrateMongoUri()).toBe(getDatabaseUri());
    });

    it('targets the configured database name, not the hardcoded one', () => {
        // Stated separately from the equality check: the two implementations agreeing on a WRONG
        // answer would satisfy the assertion above and still seed the wrong database.
        process.env.NODE_DB_URI = '';
        process.env.NODE_MONGODB_HOST = 'localhost';
        process.env.NODE_MONGODB_NAME = 'my-actual-data';

        expect(migrateMongoUri()).toBe('mongodb://localhost:27017/my-actual-data');
    });
});
