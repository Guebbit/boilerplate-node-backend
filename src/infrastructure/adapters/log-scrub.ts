/**
 * @module
 * What of an error and of a message text may reach a log line.
 *
 * Two jobs, both about message text, which redaction by key name never reads:
 * - {@link scrubError}: a known error class keeps its identifying fields, never its message.
 * - {@link maskMessage}: any message loses its email and IP addresses to a pseudonym.
 *
 * The mask is pinned by `shared/cases/log-redaction.cases.yaml` (kind `message`), the file the PHP
 * twin runs too. The expressions are NOT shared: each backend writes its own.
 *
 * Relative imports only: `logger.ts` imports this, and it sits on jest `globalSetup`'s chain.
 * See: docs/theory/defences/disclosure.md
 */

/**
 * Names of the driver and ODM errors, by `name` rather than `instanceof`: `mongodb` and `bson`
 * are transitive dependencies and a second copy would make `instanceof` answer false.
 */
const DATABASE_ERROR_NAME =
    /^(?:Mongo\w*Error|Mongoose\w*Error|ValidationError|ValidatorError|CastError|VersionError|DocumentNotFoundError|StrictModeError|BSONError)$/;

/**
 * Whether the error, or any class it extends, carries a database error's name. The prototype
 * chain is walked because Mongoose's subclasses (`DocumentNotFoundError`, `VersionError`, a
 * subclass of an app's own) all end in `MongooseError` yet name themselves differently.
 *
 * @param error - whatever was caught
 */
const isDatabaseError = (error: Error): boolean => {
    if (DATABASE_ERROR_NAME.test(error.name)) return true;
    let prototype: unknown = Object.getPrototypeOf(error);
    while (typeof prototype === 'object' && prototype !== null) {
        const constructorName = (
            Reflect.get(prototype, 'constructor') as { name?: unknown } | undefined
        )?.name;
        if (typeof constructorName === 'string' && DATABASE_ERROR_NAME.test(constructorName))
            return true;
        prototype = Object.getPrototypeOf(prototype);
    }
    return false;
};

/**
 * The scrubbed fields of an error whose class is known to quote data in its message, or
 * `undefined` for any other error (the caller then keeps it whole).
 *
 * - Mongo/Mongoose: name, code and stack FRAMES. The message carries the offending values (a
 *   duplicate-key error names the email). The stack's leading lines are that message, so only
 *   the `    at ...` lines are kept; they name where the error came from and no data.
 * - Nodemailer: name, code, `responseCode` and `command`, and the message minus the SMTP
 *   server's reply, which echoes the recipient.
 *
 * @param error - whatever was caught
 */
export const scrubError = (error: Error): Record<string, unknown> | undefined => {
    if (isDatabaseError(error)) {
        // A message may span several lines, so frames are picked by shape, not by "drop line one".
        const frames = (error.stack ?? '')
            .split('\n')
            .filter((line) => /^\s+at /.test(line))
            .join('\n');
        return { name: error.name, code: 'code' in error ? error.code : undefined, stack: frames };
    }
    if ('command' in error && 'responseCode' in error && 'response' in error) {
        const reply = typeof error.response === 'string' ? `: ${error.response}` : '';
        return {
            name: error.name,
            message: reply ? error.message.replace(reply, '') : error.message,
            code: 'code' in error ? error.code : undefined,
            responseCode: error.responseCode,
            command: error.command
        };
    }
    return undefined;
};

/**
 * Email addresses, IPv6 addresses (full, compressed, IPv4-mapped) and IPv4 addresses, in one
 * pass so an address is never matched twice. Case-insensitive, Unicode-aware.
 *
 * - Email: the domain's first label may not be `<digits>x` (the `logo@2x.png` retina suffix).
 * - IPv6: needs a `::` or all eight groups, so a clock time (`12:30:45`) stays; not preceded by
 *   a word character or a colon.
 * - IPv4: each octet 0-255 (`999.1.1.1` stays), not part of a longer dotted number.
 */
const ADDRESS = (() => {
    const group = '[0-9a-f]{1,4}';
    const octet = String.raw`(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)`;
    const v4 = String.raw`${octet}(?:\.${octet}){3}`;
    const tail = `(?:(?:${group}:){0,5}${v4}|${group}(?::${group}){0,6})`;
    const v6 = String.raw`(?<![\w:])(?:(?:${group}:){7}${group}|${group}(?::${group}){0,6}::(?:${tail})?|::${tail})(?![\w:])`;
    const email = String.raw`[\p{L}\p{N}._%+-]+@(?!\d+x\.)[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}`;
    const ipv4 = String.raw`(?<![\w.])${v4}(?![\w]|\.\d)`;
    return new RegExp(`${email}|${v6}|${ipv4}`, 'giu');
})();

/**
 * Replaces every email and IP address in `text` with its pseudonym, so the line stays
 * correlatable with the hashed `email` and `ip` fields.
 *
 * The address is lowercased before it is pseudonymised: stored emails are lowercase, and a
 * message that quotes `Ada@Example.com` must hash like the `email` field does.
 *
 * @param text - a log headline or an error message
 * @param pseudonym - the stand-in for one address, already lowercased
 */
export const maskMessage = (text: string, pseudonym: (address: string) => string): string =>
    text.replaceAll(ADDRESS, (address) => pseudonym(address.toLowerCase()));
