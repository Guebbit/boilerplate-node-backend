/**
 * `src/infrastructure/config/secret-files.ts` — `NODE_X_FILE` stands in for `NODE_X`, and a password
 * file is merged into its connection URL.
 *
 * The subject is the loader's contract: the file wins, nothing is written back to `process.env`,
 * a tool's own `*_FILE` variable is left alone, and a secret never appears in an error.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { currentEnvironment, overrideEnvironment } from '@infrastructure/config/store';
import { resolveSecretFiles } from '@infrastructure/config/secret-files';
import { databaseConfig } from '@infrastructure/runtime/config';

/** Where this file's secret files live, removed whole after each case. */
let directory: string;

/**
 * Writes one secret file.
 *
 * @param name - the file's name inside the case's directory
 * @param content - what it holds
 * @returns its absolute path
 */
const secretFile = (name: string, content: string): string => {
    const target = path.join(directory, name);
    writeFileSync(target, content);
    return target;
};

describe('resolveSecretFiles', () => {
    beforeEach(() => {
        directory = mkdtempSync(path.join(tmpdir(), 'secret-files-'));
    });

    afterEach(() => {
        rmSync(directory, { recursive: true, force: true });
    });

    it('reads NODE_X_FILE into NODE_X and strips the one trailing newline', () => {
        const resolved = resolveSecretFiles({
            NODE_TOKEN_ACCESS_FILE: secretFile('token', 'long-secret\n')
        });

        expect(resolved.NODE_TOKEN_ACCESS).toBe('long-secret');
    });

    it('keeps every other character of the secret, edge whitespace included', () => {
        const resolved = resolveSecretFiles({
            NODE_TOKEN_ACCESS_FILE: secretFile('token', '  pad  \n\n')
        });

        expect(resolved.NODE_TOKEN_ACCESS).toBe('  pad  \n');
    });

    it('lets the file win when the variable and its file are both set', () => {
        const resolved = resolveSecretFiles({
            NODE_TOKEN_ACCESS: 'from-env',
            NODE_TOKEN_ACCESS_FILE: secretFile('token', 'from-file')
        });

        expect(resolved.NODE_TOKEN_ACCESS).toBe('from-file');
    });

    it('treats an empty file as unset, so the variable keeps its own value', () => {
        const resolved = resolveSecretFiles({
            NODE_TOKEN_ACCESS: 'from-env',
            NODE_TOKEN_ACCESS_FILE: secretFile('token', '\n')
        });

        expect(resolved.NODE_TOKEN_ACCESS).toBe('from-env');
    });

    it('ignores a blank NODE_X_FILE', () => {
        expect(
            resolveSecretFiles({ NODE_TOKEN_ACCESS_FILE: '' }).NODE_TOKEN_ACCESS
        ).toBeUndefined();
    });

    it('leaves a variable outside the app namespace alone', () => {
        const resolved = resolveSecretFiles({ GIT_INDEX_FILE: '/definitely/not/a/file' });

        expect(resolved).toEqual({ GIT_INDEX_FILE: '/definitely/not/a/file' });
    });

    it('names the variable and path, never a value, when the file cannot be read', () => {
        const missing = path.join(directory, 'absent');

        expect(() => resolveSecretFiles({ NODE_TOKEN_ACCESS_FILE: missing })).toThrow(
            `NODE_TOKEN_ACCESS_FILE: cannot read the secret file ${missing} (ENOENT)`
        );
    });

    it('does not change the environment it was given', () => {
        const input = { NODE_TOKEN_ACCESS_FILE: secretFile('token', 'x') };

        resolveSecretFiles(input);

        expect(input).toEqual({ NODE_TOKEN_ACCESS_FILE: input.NODE_TOKEN_ACCESS_FILE });
    });
});

describe('a password merged into its URL', () => {
    it.each([
        ['NODE_DB_URI', 'NODE_DB_PASSWORD', 'mongodb://api@database:27017/api?tls=true'],
        ['NODE_REDIS_URL', 'NODE_REDIS_PASSWORD', 'redis://cache:6379'],
        ['NODE_RABBITMQ_URL', 'NODE_RABBITMQ_PASSWORD', 'amqp://guest@queue:5672'],
        ['NODE_RATE_LIMIT_REDIS_URL', 'NODE_RATE_LIMIT_REDIS_PASSWORD', 'redis://limits:6379']
    ])('%s takes %s', (urlName, passwordName, url) => {
        const resolved = resolveSecretFiles({ [urlName]: url, [passwordName]: 'p@ss/w#d' });

        expect(URL.parse(resolved[urlName] ?? '')?.password).toBe('p%40ss%2Fw%23d');
    });

    it('keeps the user the URL names', () => {
        const resolved = resolveSecretFiles({
            NODE_DB_URI: 'mongodb://api@database:27017/api',
            NODE_DB_PASSWORD: 'secret'
        });

        expect(resolved.NODE_DB_URI).toBe('mongodb://api:secret@database:27017/api');
    });

    it('gives a user-less URL an empty user, which is how Redis spells a password-only login', () => {
        const resolved = resolveSecretFiles({
            NODE_REDIS_URL: 'redis://cache:6379',
            NODE_REDIS_PASSWORD: 'secret'
        });

        expect(resolved.NODE_REDIS_URL).toBe('redis://:secret@cache:6379');
    });

    it('replaces a password the URL already carries', () => {
        const resolved = resolveSecretFiles({
            NODE_DB_URI: 'mongodb://api:old@database:27017/api',
            NODE_DB_PASSWORD: 'new'
        });

        expect(resolved.NODE_DB_URI).toBe('mongodb://api:new@database:27017/api');
    });

    it('handles a multi-host Mongo URI, which the WHATWG URL refuses, and escapes the password', () => {
        const resolved = resolveSecretFiles({
            NODE_DB_URI: 'mongodb://api@a:27017,b:27017/api?replicaSet=rs0',
            NODE_DB_PASSWORD: 'p@ss w/rd:'
        });

        expect(resolved.NODE_DB_URI).toBe(
            'mongodb://api:p%40ss%20w%2Frd%3A@a:27017,b:27017/api?replicaSet=rs0'
        );
    });

    it('handles a mongodb+srv URI', () => {
        const resolved = resolveSecretFiles({
            NODE_DB_URI: 'mongodb+srv://api@cluster.example.net/api',
            NODE_DB_PASSWORD: 'x'
        });

        expect(resolved.NODE_DB_URI).toBe('mongodb+srv://api:x@cluster.example.net/api');
    });

    it('escapes the password in an AMQP URL', () => {
        const resolved = resolveSecretFiles({
            NODE_RABBITMQ_URL: 'amqp://guest@queue:5672',
            NODE_RABBITMQ_PASSWORD: 'p@ss w/rd:'
        });

        expect(resolved.NODE_RABBITMQ_URL).toBe('amqp://guest:p%40ss%20w%2Frd%3A@queue:5672');
    });

    it.each([
        ['NODE_DB_URI', 'NODE_DB_PASSWORD', 'mongodb://'],
        ['NODE_REDIS_URL', 'NODE_REDIS_PASSWORD', 'not a url']
    ])('leaves an unparseable %s as it was', (urlName, passwordName, url) => {
        const resolved = resolveSecretFiles({ [urlName]: url, [passwordName]: 'secret' });

        expect(resolved[urlName]).toBe(url);
    });

    it('leaves a URL alone when no password is given, so a managed URI keeps its own', () => {
        const url = 'mongodb://api:own@managed.example:27017/api';

        expect(resolveSecretFiles({ NODE_DB_URI: url }).NODE_DB_URI).toBe(url);
    });

    it('does nothing when there is a password and no URL', () => {
        expect(resolveSecretFiles({ NODE_DB_PASSWORD: 'secret' }).NODE_DB_URI).toBeUndefined();
    });

    it('takes the password from a file', () => {
        directory = mkdtempSync(path.join(tmpdir(), 'secret-files-'));
        try {
            const resolved = resolveSecretFiles({
                NODE_DB_URI: 'mongodb://api@database:27017/api',
                NODE_DB_PASSWORD_FILE: secretFile('db', 'from-file\n')
            });

            expect(resolved.NODE_DB_URI).toBe('mongodb://api:from-file@database:27017/api');
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });
});

describe('through the config store', () => {
    it('hands a slice the resolved URL and leaves process.env without it', () => {
        directory = mkdtempSync(path.join(tmpdir(), 'secret-files-'));
        const restore = overrideEnvironment({
            NODE_DB_URI: 'mongodb://api@database:27017/api',
            NODE_DB_PASSWORD_FILE: secretFile('db', 'from-file\n')
        });
        try {
            expect(databaseConfig().NODE_DB_URI).toBe('mongodb://api:from-file@database:27017/api');
            expect(process.env.NODE_DB_PASSWORD).toBeUndefined();
            expect(currentEnvironment().NODE_DB_PASSWORD).toBe('from-file');
        } finally {
            restore();
            rmSync(directory, { recursive: true, force: true });
        }
    });
});
