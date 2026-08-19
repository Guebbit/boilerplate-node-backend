/**
 * `src/infrastructure/runtime/environment.ts` — the fail-fast boot check.
 *
 * Small on purpose and tested exhaustively for it: this is the code that decides whether the
 * process starts at all, and a hole here is a server that accepts traffic and 500s on the first
 * login. Uncovered since the file moved from `src/infrastructure/` into `runtime/` — the
 * coverage glob did not follow, which is exactly the drift this suite closes.
 */
import { validateRequiredEnvironment } from '@infrastructure/runtime/environment';

const KEYS = [
    'NODE_TOKEN_ACCESS',
    'NODE_TOKEN_REFRESH',
    'NODE_DB_URI',
    'NODE_MONGODB_PORT'
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
    saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
    process.env.NODE_TOKEN_ACCESS = 'access-secret';
    process.env.NODE_TOKEN_REFRESH = 'refresh-secret';
    process.env.NODE_DB_URI = 'mongodb://127.0.0.1:27017/test';
    delete process.env.NODE_MONGODB_PORT;
});

afterEach(() => {
    for (const key of KEYS) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
    }
});

it('passes with both token secrets and a database URI', () => {
    expect(() => validateRequiredEnvironment()).not.toThrow();
});

it('accepts host/port fragments in place of a full URI', () => {
    delete process.env.NODE_DB_URI;
    process.env.NODE_MONGODB_PORT = '27017';
    expect(() => validateRequiredEnvironment()).not.toThrow();
});

it('names every missing secret at once, not one per restart cycle', () => {
    delete process.env.NODE_TOKEN_ACCESS;
    delete process.env.NODE_TOKEN_REFRESH;
    expect(() => validateRequiredEnvironment()).toThrow(/NODE_TOKEN_ACCESS, NODE_TOKEN_REFRESH/);
});

it('treats a whitespace-only value as missing — the CI empty-secret accident', () => {
    process.env.NODE_TOKEN_ACCESS = '   ';
    expect(() => validateRequiredEnvironment()).toThrow(/NODE_TOKEN_ACCESS/);
});

it('requires SOME database configuration: a blank URI and no port is a refusal to boot', () => {
    process.env.NODE_DB_URI = '  ';
    delete process.env.NODE_MONGODB_PORT;
    expect(() => validateRequiredEnvironment()).toThrow(/NODE_DB_URI or NODE_MONGODB_PORT/);
});
