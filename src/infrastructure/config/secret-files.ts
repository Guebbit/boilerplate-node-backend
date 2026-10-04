/**
 * @module
 * Secrets as files: `NODE_X_FILE=/run/secrets/x` stands in for `NODE_X=<the secret>`.
 *
 * Why:      a secret in the environment shows in `docker inspect` and in every child process. A file
 *           mounted into ONE container does neither.
 * Where:    the config store runs this over its merged environment, so every slice, check and
 *           presence rule sees the resolved value and nothing downstream knows a file existed.
 * Never:    writes into `process.env` (that would hand the value to every child process again).
 *
 * See: docs/tools/configuration.md#secrets-as-files
 */

import { readFileSync } from 'node:fs';
import { ConnectionString } from 'mongodb-connection-string-url';

/** A set of environment variables, as the store holds them. */
type Variables = Readonly<Record<string, string | undefined>>;

/** Suffix that turns a variable into "read this one from the file at the value's path". */
const FILE_SUFFIX = '_FILE';

/**
 * Only the app's own namespace is resolved. A tool's variable that happens to end in `_FILE`
 * (`GIT_INDEX_FILE` is in the environment of every git hook) names a file for that tool, not a
 * secret for us.
 */
const OWNED_PREFIX = 'NODE_';

/**
 * The variable that reads `name` from a file instead, if `name` is in the namespace this resolves.
 *
 * @param name - a variable a slice declares
 * @returns `NODE_X_FILE` for `NODE_X`; `undefined` for a variable the loader leaves alone
 */
export const fileFormOf = (name: string): string | undefined =>
    name.startsWith(OWNED_PREFIX) ? `${name}${FILE_SUFFIX}` : undefined;

/**
 * Each connection URL and the variable holding its password. The URL stays in the environment
 * WITHOUT a password; the password arrives as a file and is merged in here, so a client's
 * hostname and options live in plain config and only the credential is a secret.
 */
export const URL_PASSWORDS: Readonly<Record<string, string>> = {
    NODE_DB_URI: 'NODE_DB_PASSWORD',
    NODE_REDIS_URL: 'NODE_REDIS_PASSWORD',
    NODE_RABBITMQ_URL: 'NODE_RABBITMQ_PASSWORD',
    NODE_RATE_LIMIT_REDIS_URL: 'NODE_RATE_LIMIT_REDIS_PASSWORD'
};

/**
 * The two Mongo schemes. Only these go to the Mongo parser: a replica-set URI
 * (`mongodb://a:27017,b:27017/db`) lists several hosts, which the WHATWG `URL` refuses.
 */
const MONGO_SCHEME = /^mongodb(?:\+srv)?:\/\//i;

/**
 * The text of a secret file, or `undefined` when it holds nothing.
 *
 * An empty file means "not set": a deployment on a managed service has no secret to put in a file
 * compose insists on mounting, and the credentials in its own URL must then stand.
 *
 * @param variable - the `_FILE` variable, named in the error
 * @param filePath - where it points
 * @returns the content without its trailing newline, or `undefined` for an empty file
 * @throws {Error} naming the variable and path (never a value) when the file cannot be read
 */
const readSecretFile = (variable: string, filePath: string): string | undefined => {
    // eslint-disable-next-line no-restricted-syntax -- a synchronous read that must fail with the variable's name; no promise form exists on the config path, which is synchronous by contract
    try {
        // `\r?\n$`: the one newline an editor or `echo` appends; any other whitespace is the secret's.
        const content = readFileSync(filePath, 'utf8').replace(/\r?\n$/, '');
        return content === '' ? undefined : content;
    } catch (error) {
        // Not `instanceof Error`: an fs error can come from another realm (jest's sandbox) and fail it.
        const code =
            typeof error === 'object' && error !== null && 'code' in error
                ? String(error.code)
                : 'unreadable';
        throw new Error(`${variable}: cannot read the secret file ${filePath} (${code})`, {
            cause: error
        });
    }
};

/**
 * A Mongo URI with the password set, or `undefined` when the parser refuses it.
 *
 * `mongodb-connection-string-url` is the parser the `mongodb` driver itself uses, so what it
 * accepts here is what the driver will accept later. Assigning `.password` percent-encodes it.
 * https://github.com/mongodb-js/mongodb-connection-string-url
 *
 * @param url - a `mongodb://` or `mongodb+srv://` URI
 * @param password - the raw password
 * @returns the URI carrying the password
 */
const mongoWithPassword = (url: string, password: string): string | undefined => {
    // eslint-disable-next-line no-restricted-syntax -- the parser reports a malformed URI only by throwing, and there is no non-throwing form to chain
    try {
        const parsed = new ConnectionString(url);
        parsed.password = password;
        return parsed.toString();
    } catch {
        return undefined;
    }
};

/**
 * Any other URL (Redis, AMQP) with the password set, or `undefined` when it does not parse.
 *
 * Node's WHATWG `URL`: `URL.parse` returns `null` instead of throwing, and assigning `.password`
 * percent-encodes it. https://nodejs.org/api/url.html#urlpassword
 *
 * @param url - a single-host URL
 * @param password - the raw password
 * @returns the URL carrying the password
 */
const genericWithPassword = (url: string, password: string): string | undefined => {
    const parsed = URL.parse(url);
    if (!parsed) return undefined;
    parsed.password = password;
    return parsed.toString();
};

/**
 * Puts a password into a connection URL, replacing the one it carries, if any. The user the URL
 * names is kept.
 *
 * @param url - the URL, with or without credentials
 * @param password - the raw password, percent-encoded by the parser
 * @returns the URL carrying the password; one that does not parse comes back untouched
 */
const withPassword = (url: string, password: string): string =>
    (MONGO_SCHEME.test(url)
        ? mongoWithPassword(url, password)
        : genericWithPassword(url, password)) ?? url;

/**
 * Applies every `NODE_X_FILE` over `NODE_X`: the file wins when both are set, no refusal.
 *
 * @param environment - the merged environment
 * @returns the variables each file supplied
 */
const fileValues = (environment: Variables): Record<string, string> => {
    const supplied: Record<string, string> = {};
    for (const [name, filePath] of Object.entries(environment)) {
        if (!name.startsWith(OWNED_PREFIX) || !name.endsWith(FILE_SUFFIX) || !filePath) continue;
        const content = readSecretFile(name, filePath);
        if (content !== undefined) supplied[name.slice(0, -FILE_SUFFIX.length)] = content;
    }
    return supplied;
};

/**
 * The environment with every secret file read in and every password merged into its URL.
 *
 * @param environment - the merged environment, overrides included
 * @returns a copy with the resolved values; the input is never changed
 * @throws {Error} when a named secret file cannot be read
 */
export const resolveSecretFiles = (environment: Variables): Variables => {
    const resolved: Record<string, string | undefined> = {
        ...environment,
        ...fileValues(environment)
    };
    for (const [urlName, passwordName] of Object.entries(URL_PASSWORDS)) {
        const url = resolved[urlName];
        const password = resolved[passwordName];
        if (url && password) resolved[urlName] = withPassword(url, password);
    }
    return resolved;
};
