/**
 * `src/infrastructure/adapters/logger.ts` — redaction and error serialization.
 *
 * This is agnostic boilerplate in the strictest sense: every project built from this repo
 * inherits it unchanged, and its job is to stop credentials reaching a log aggregator. A gap here
 * is not a bug in a feature, it is a password in Datadog forever.
 *
 * It scored 25.74% on mutation with 73 survivors, and the survivors clustered in three places the
 * existing cases never reached: the production stack-trace guard, the winston format that wires
 * redaction into the pipeline, and the two INVARIANTS the docblock claims but nothing checked —
 * that redaction never mutates its input, and that the format returns the same object identity
 * winston handed it.
 */
import fc from 'fast-check';
import {
    redactSensitiveFields,
    serializeError,
    SENSITIVE_FIELDS,
    PERSONAL_FIELDS,
    redactFormat,
    resolveLogLevel,
    resolveConsoleFormat
} from '@infrastructure/adapters/logger';

describe('redactSensitiveFields', () => {
    it('returns primitives unchanged', () => {
        expect(redactSensitiveFields('hello')).toBe('hello');
        expect(redactSensitiveFields(42)).toBe(42);
        expect(redactSensitiveFields(true)).toBe(true);
        expect(redactSensitiveFields(void 0)).toBeUndefined();
    });

    it('redacts password and token fields', () => {
        const input = { username: 'alice', password: 's3cr3t', access_token: 'tok' };
        expect(redactSensitiveFields(input)).toEqual({
            username: 'alice',
            password: '[REDACTED]',
            access_token: '[REDACTED]'
        });
    });

    it('redacts authorization and cookie headers', () => {
        const input = {
            authorization: 'Bearer abc',
            cookie: 'jwt=xyz',
            contentType: 'application/json'
        };
        const result = redactSensitiveFields(input) as Record<string, unknown>;
        expect(result.authorization).toBe('[REDACTED]');
        expect(result.cookie).toBe('[REDACTED]');
        expect(result.contentType).toBe('application/json');
    });

    it('is case-insensitive for sensitive field names', () => {
        const input = { Password: 'secret', PASSWORD: 'secret' };
        const result = redactSensitiveFields(input) as Record<string, unknown>;
        expect(result.Password).toBe('[REDACTED]');
        expect(result.PASSWORD).toBe('[REDACTED]');
    });

    it('redacts nested sensitive fields', () => {
        // `username`, not `email` — `email` is a PERSONAL field since G6 and gets hashed, not
        // left plain; this case is about SENSITIVE_FIELDS nesting specifically.
        const input = { user: { username: 'carol', password: 'secret' } };
        expect(redactSensitiveFields(input)).toEqual({
            user: { username: 'carol', password: '[REDACTED]' }
        });
    });

    it('redacts inside arrays', () => {
        const input = [{ password: 'a' }, { password: 'b', name: 'carol' }];
        expect(redactSensitiveFields(input)).toEqual([
            { password: '[REDACTED]' },
            { password: '[REDACTED]', name: 'carol' }
        ]);
    });
});

describe('serializeError', () => {
    it('extracts name and message from an Error instance', () => {
        const result = serializeError(new Error('something went wrong'));
        expect(result.name).toBe('Error');
        expect(result.message).toBe('something went wrong');
    });

    it('wraps non-Error values in a raw field', () => {
        expect(serializeError('plain string')).toEqual({ raw: 'plain string' });
        expect(serializeError(42)).toEqual({ raw: '42' });
    });

    it('preserves custom error names', () => {
        class ValidationError extends Error {
            constructor(message: string) {
                super(message);
                this.name = 'ValidationError';
            }
        }
        const result = serializeError(new ValidationError('bad input'));
        expect(result.name).toBe('ValidationError');
        expect(result.message).toBe('bad input');
    });
});

describe('serializeError — the production stack guard', () => {
    const originalEnvironment = process.env.NODE_ENV;

    afterEach(() => {
        if (originalEnvironment === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = originalEnvironment;
    });

    it('includes the stack outside production, where it is the useful part', () => {
        process.env.NODE_ENV = 'development';

        expect(serializeError(new Error('boom'))).toHaveProperty('stack');
    });

    it('OMITS the stack in production', () => {
        // A stack trace names absolute paths and dependency internals. Locally that is debugging;
        // in an aggregated production log it is a map of the filesystem handed to anyone with
        // read access to the log tool. Nothing asserted this, so both mutants of the guard lived.
        process.env.NODE_ENV = 'production';

        expect(serializeError(new Error('boom'))).not.toHaveProperty('stack');
    });

    it('still reports name and message in production', () => {
        // Omitting the stack must not degrade into omitting the error.
        process.env.NODE_ENV = 'production';

        expect(serializeError(new Error('boom'))).toMatchObject({
            name: 'Error',
            message: 'boom'
        });
    });

    it('treats an unset NODE_ENV as non-production', () => {
        // The comparison is `!== 'production'`, so an unset variable keeps the stack — which is
        // the right default for a developer running the app with no env file.
        delete process.env.NODE_ENV;

        expect(serializeError(new Error('boom'))).toHaveProperty('stack');
    });
});

/*
 * Properties. `redactSensitiveFields` walks arbitrary caller-supplied metadata, so "for every
 * input" is the only honest way to state what it guarantees — and two of these are claims the
 * docblock makes in prose and nothing verified.
 */
const RUN = { seed: 20_260_809, numRuns: 200, endOnFailure: true } as const;

/** Every string VALUE in a structure, ignoring keys — what a leak actually looks like. */
const stringValuesOf = (input: unknown): string[] => {
    if (typeof input === 'string') return [input];
    if (Array.isArray(input)) return input.flatMap((item) => stringValuesOf(item));
    if (input !== null && typeof input === 'object')
        return Object.values(input as Record<string, unknown>).flatMap((value) =>
            stringValuesOf(value)
        );
    return [];
};

/** Arbitrary log metadata, including keys that are and are not sensitive. */
const metadata = () =>
    fc.dictionary(
        fc.oneof(fc.constantFrom('password', 'token', 'authorization', 'user', 'id'), fc.string()),
        fc.jsonValue(),
        { maxKeys: 6 }
    );

describe('redactSensitiveFields — invariants', () => {
    it('NEVER mutates the object it was given', () => {
        // The docblock is explicit that callers pass live request and domain objects, so mutating
        // them would corrupt the actual request rather than merely the log line. That is the most
        // dangerous thing this function could do and nothing was checking it.
        fc.assert(
            fc.property(metadata(), (input) => {
                const before = JSON.stringify(input);

                redactSensitiveFields(input);

                expect(JSON.stringify(input)).toBe(before);
            }),
            RUN
        );
    });

    it('is idempotent — redacting twice changes nothing further', () => {
        fc.assert(
            fc.property(metadata(), (input) => {
                const once = redactSensitiveFields(input);

                expect(redactSensitiveFields(once)).toEqual(once);
            }),
            RUN
        );
    });

    it('leaves no sensitive VALUE anywhere in the output, at any depth', () => {
        // The claim that matters. Generated nesting reaches shapes no example enumerates.
        //
        // Asserted over the output's string VALUES rather than over `JSON.stringify` of the whole
        // thing, and the difference is not pedantry — the naive version failed on the generated
        // counterexample `secret = "p"`, because "p" occurs inside the KEY "password". The claim
        // was never about key names.
        fc.assert(
            fc.property(fc.string({ minLength: 1 }), fc.nat({ max: 5 }), (secret, depth) => {
                let payload: Record<string, unknown> = { password: secret };
                for (let level = 0; level < depth; level++) payload = { nested: payload };

                expect(stringValuesOf(redactSensitiveFields(payload))).not.toContain(secret);
            }),
            RUN
        );
    });

    it('keeps arrays as arrays rather than rebuilding them as objects', () => {
        // `typeof [] === 'object'`, so without the Array.isArray branch an array comes back as
        // `{ '0': ..., '1': ... }` — valid JSON, and a log shape no dashboard can read.
        fc.assert(
            fc.property(fc.array(fc.jsonValue(), { maxLength: 6 }), (input) => {
                expect(Array.isArray(redactSensitiveFields(input))).toBe(true);
            }),
            RUN
        );
    });

    it('preserves array length and non-sensitive primitives', () => {
        fc.assert(
            fc.property(
                fc.array(fc.oneof(fc.string(), fc.integer()), { maxLength: 6 }),
                (input) => {
                    expect(redactSensitiveFields(input)).toEqual(input);
                }
            ),
            RUN
        );
    });

    it('never throws, for any input', () => {
        fc.assert(
            fc.property(fc.anything(), (input) => {
                expect(() => redactSensitiveFields(input)).not.toThrow();
            }),
            RUN
        );
    });
});

describe('the sensitive-field policy, entry by entry', () => {
    /*
     * Table-driven over the REAL set rather than over a list copied into the test.
     *
     * Two things follow, and the second is the point. A field added to the policy is tested
     * automatically — nobody has to remember. And a field REMOVED from the policy makes its case
     * disappear silently, which is why the guard below pins the size: a security list that
     * quietly shrinks is the failure worth catching.
     */
    it.each([...SENSITIVE_FIELDS])('redacts %s', (field) => {
        const redacted = redactSensitiveFields({ [field]: 'the-secret' }) as Record<
            string,
            unknown
        >;

        expect(redacted[field]).toBe('[REDACTED]');
    });

    it.each([...SENSITIVE_FIELDS])('redacts %s regardless of case', (field) => {
        // Keys are lowercased before the lookup, so `AUTHORIZATION` and `Authorization` are the
        // same entry. Header casing is not something a caller controls.
        const shouty = field.toUpperCase();
        const redacted = redactSensitiveFields({ [shouty]: 'the-secret' }) as Record<
            string,
            unknown
        >;

        expect(redacted[shouty]).toBe('[REDACTED]');
    });

    it('covers the whole policy, so a shrinking list cannot pass unnoticed', () => {
        // Deliberately a floor, not an exact count: adding a field should not fail a test, and
        // removing one should.
        expect(SENSITIVE_FIELDS.size).toBeGreaterThanOrEqual(20);
    });

    it('does not redact an ordinary field that merely contains a sensitive word', () => {
        // The lookup is exact, not substring. `passwordPolicy` and `tokenCount` are metadata
        // worth keeping; over-redaction quietly destroys the logs' usefulness.
        const redacted = redactSensitiveFields({
            passwordPolicy: 'strong',
            tokenCount: 3
        }) as Record<string, unknown>;

        expect(redacted.passwordPolicy).toBe('strong');
        expect(redacted.tokenCount).toBe(3);
    });
});

describe('the personal-data policy — GDPR_FIX.md G6', () => {
    const originalMode = process.env.NODE_LOG_PERSONAL_FIELDS;

    afterEach(() => {
        if (originalMode === undefined) delete process.env.NODE_LOG_PERSONAL_FIELDS;
        else process.env.NODE_LOG_PERSONAL_FIELDS = originalMode;
    });

    // Table-driven over the REAL set, same reasoning as the sensitive-field policy above: a field
    // added to PERSONAL_FIELDS is covered automatically, and one removed makes its case vanish.
    it.each([...PERSONAL_FIELDS])('hashes %s by default — correlatable, not readable', (field) => {
        delete process.env.NODE_LOG_PERSONAL_FIELDS;
        const redacted = redactSensitiveFields({ [field]: 'the-value' }) as Record<string, unknown>;

        expect(redacted[field]).toMatch(/^sha256:[\da-f]{12}$/);
        expect(redacted[field]).not.toBe('the-value');
    });

    it('hashes the SAME input to the SAME digest twice, so a trace stays followable', () => {
        const first = redactSensitiveFields({ email: 'user@example.com' }) as Record<
            string,
            unknown
        >;
        const second = redactSensitiveFields({ email: 'user@example.com' }) as Record<
            string,
            unknown
        >;

        expect(first.email).toBe(second.email);
    });

    it('hashes two DIFFERENT inputs to two different digests', () => {
        const first = redactSensitiveFields({ email: 'alice@example.com' }) as Record<
            string,
            unknown
        >;
        const second = redactSensitiveFields({ email: 'bob@example.com' }) as Record<
            string,
            unknown
        >;

        expect(first.email).not.toBe(second.email);
    });

    it('drops personal fields entirely under NODE_LOG_PERSONAL_FIELDS=redact', () => {
        process.env.NODE_LOG_PERSONAL_FIELDS = 'redact';

        const redacted = redactSensitiveFields({ email: 'user@example.com' }) as Record<
            string,
            unknown
        >;

        expect(redacted.email).toBe('[REDACTED]');
    });

    it('leaves personal fields untouched under NODE_LOG_PERSONAL_FIELDS=plain', () => {
        process.env.NODE_LOG_PERSONAL_FIELDS = 'plain';

        const redacted = redactSensitiveFields({ email: 'user@example.com' }) as Record<
            string,
            unknown
        >;

        expect(redacted.email).toBe('user@example.com');
    });

    it('treats an unrecognised value the same as unset — hash, the private default', () => {
        process.env.NODE_LOG_PERSONAL_FIELDS = 'not-a-real-mode';

        const redacted = redactSensitiveFields({ email: 'user@example.com' }) as Record<
            string,
            unknown
        >;

        expect(redacted.email).toMatch(/^sha256:[\da-f]{12}$/);
    });

    it('is case-insensitive for personal field names, like the sensitive-field policy', () => {
        const redacted = redactSensitiveFields({ EMAIL: 'user@example.com' }) as Record<
            string,
            unknown
        >;

        expect(redacted.EMAIL).toMatch(/^sha256:[\da-f]{12}$/);
    });

    it('never hashes a credential — SENSITIVE_FIELDS wins on any name overlap', () => {
        // No real overlap today; this pins the PRIORITY the code gives should one ever be added.
        for (const personalField of PERSONAL_FIELDS)
            expect(SENSITIVE_FIELDS.has(personalField)).toBe(false);
    });

    it('still recurses past a personal-field key whose value is not a string', () => {
        // A nested object under a personal-sounding key is not hashed itself; it's walked, so a
        // credential nested one level deeper is still caught.
        const redacted = redactSensitiveFields({
            email: { password: 'nested-secret' }
        }) as Record<string, unknown>;

        expect(redacted.email).toEqual({ password: '[REDACTED]' });
    });

    it('covers the whole policy, so a shrinking list cannot pass unnoticed', () => {
        expect(PERSONAL_FIELDS.size).toBeGreaterThanOrEqual(6);
    });
});

/** Drive the format the way winston does: one `info` record in, the same object out. */
const transform = (info: Record<string, unknown>) =>
    redactFormat().transform(info as never) as Record<string, unknown>;

describe('redactFormat — the winston wiring', () => {
    it('redacts caller metadata on the way to the transport', () => {
        // The end-to-end claim. `redactSensitiveFields` being correct is worth nothing if the
        // format that applies it is not wired in.
        const output = transform({ level: 'info', message: 'login', password: 's3cr3t' });

        expect(output.password).toBe('[REDACTED]');
    });

    it('returns the SAME object winston handed it', () => {
        // Winston requires object identity back; returning a copy silently drops the record's
        // symbol-keyed internals, and returning `false` drops the record entirely.
        const info = { level: 'info', message: 'hello' };

        expect(transform(info)).toBe(info);
    });

    it('preserves level and message, which are winston’s own fields', () => {
        const output = transform({ level: 'warn', message: 'careful', password: 'x' });

        expect(output.level).toBe('warn');
        expect(output.message).toBe('careful');
    });

    it('serialises an Error BEFORE redacting, so it does not become an empty object', () => {
        // `JSON.stringify(new Error('x'))` is `{}` — Error's fields are non-enumerable, so the
        // redaction walk would return nothing at all and the log line would lose the failure.
        const output = transform({
            level: 'error',
            message: 'failed',
            error: new Error('boom')
        });

        expect(output.error).toMatchObject({ name: 'Error', message: 'boom' });
    });

    it('redacts INSIDE a serialised error', () => {
        const error = Object.assign(new Error('boom'), { password: 'leaked' });
        const output = transform({ level: 'error', message: 'failed', error });

        expect(JSON.stringify(output)).not.toContain('leaked');
    });

    it('leaves a non-Error `error` field alone rather than mangling it', () => {
        // `throw 'string'` is legal JS, and the guard is `instanceof Error`.
        const output = transform({ level: 'error', message: 'failed', error: 'plain string' });

        expect(output.error).toBe('plain string');
    });
});

describe('resolveLogLevel', () => {
    const originalLevel = process.env.NODE_LOG_LEVEL;
    const originalEnvironment = process.env.NODE_ENV;

    afterEach(() => {
        if (originalLevel === undefined) delete process.env.NODE_LOG_LEVEL;
        else process.env.NODE_LOG_LEVEL = originalLevel;
        if (originalEnvironment === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = originalEnvironment;
    });

    it('prefers an explicit NODE_LOG_LEVEL over anything else', () => {
        process.env.NODE_LOG_LEVEL = 'silly';
        process.env.NODE_ENV = 'production';

        expect(resolveLogLevel()).toBe('silly');
    });

    it('is quiet in production, to avoid paying ingestion cost for noise', () => {
        delete process.env.NODE_LOG_LEVEL;
        process.env.NODE_ENV = 'production';

        expect(resolveLogLevel()).toBe('info');
    });

    it('is verbose everywhere else, because that is where someone is watching', () => {
        delete process.env.NODE_LOG_LEVEL;
        process.env.NODE_ENV = 'development';

        expect(resolveLogLevel()).toBe('debug');
    });

    it('treats an unset NODE_ENV as non-production', () => {
        delete process.env.NODE_LOG_LEVEL;
        delete process.env.NODE_ENV;

        expect(resolveLogLevel()).toBe('debug');
    });

    it('treats an empty NODE_LOG_LEVEL as unset rather than as a level', () => {
        // An empty string in the environment is a variable someone meant to fill in; passing it
        // to winston would silence the logger completely.
        process.env.NODE_LOG_LEVEL = '';
        process.env.NODE_ENV = 'development';

        expect(resolveLogLevel()).toBe('debug');
    });
});

/**
 * `resolveConsoleFormat` decides whether a log line is machine-readable, and getting it wrong is
 * invisible: the app keeps logging, the container keeps writing, and only the *labels* in Loki go
 * missing — `{service="api"}` and `{level="error"}` silently match nothing, because Promtail
 * parses each line as JSON and colourised prose is not JSON.
 *
 * So the assertions are made on the rendered line rather than on which format object came back:
 * the property that matters downstream is "can a collector parse this", not "is this the
 * prettyFormat constant".
 */

/** Pretend stdout is (or is not) an interactive terminal for the duration of one case. */
const setTty = (isTty: boolean) => {
    Object.defineProperty(process.stdout, 'isTTY', { value: isTty, configurable: true });
};

describe('resolveConsoleFormat', () => {
    /** Winston stashes the finished output line on the record under this well-known symbol. */
    const MESSAGE = Symbol.for('message');
    /**
     * And the *uncoloured* level under this one. `colorize` looks the colour up by this symbol
     * rather than by `info.level`, precisely so it still works after it has rewritten
     * `info.level` into an escape-wrapped string — so a record without it throws instead of
     * colouring.
     */
    const LEVEL = Symbol.for('level');

    const originalEnvironment = process.env.NODE_ENV;
    const originalIsTty = process.stdout.isTTY;

    afterEach(() => {
        if (originalEnvironment === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = originalEnvironment;
        setTty(originalIsTty);
    });

    /**
     * Render one record through whichever format the resolver picks, and return the line.
     *
     * The record is shaped the way winston hands one to a format — including the `LEVEL` symbol,
     * without which the colourising branch cannot run at all.
     */
    const render = (): string => {
        const format = resolveConsoleFormat();
        const rendered = format.transform({ level: 'info', message: 'hello', [LEVEL]: 'info' });
        return (rendered as Record<symbol, string>)[MESSAGE];
    };

    it('emits parseable JSON when stdout is not a terminal, which is every collected runtime', () => {
        // A container writing to its log file, a pipe, a CI job: nobody is reading this by eye
        // and something downstream has to parse it.
        process.env.NODE_ENV = 'development';
        setTty(false);

        expect(() => JSON.parse(render())).not.toThrow();
        expect(JSON.parse(render())).toMatchObject({ level: 'info', message: 'hello' });
    });

    it('emits the human layout only when a person is watching a terminal', () => {
        process.env.NODE_ENV = 'development';
        setTty(true);

        const line = render();

        expect(() => JSON.parse(line)).toThrow();
        expect(line).toContain('hello');
    });

    it('stays JSON in production even on a terminal', () => {
        // A production container started interactively still has its logs collected, so the
        // terminal says nothing about who ends up reading them.
        process.env.NODE_ENV = 'production';
        setTty(true);

        expect(() => JSON.parse(render())).not.toThrow();
    });
});

/** Re-import the module so both loggers are rebuilt from the environment as it stands now. */
const loadLoggers = async () => {
    jest.resetModules();
    return await import('@infrastructure/adapters/logger');
};

describe('the two loggers are configured independently', () => {
    /**
     * `auditLogger` carries a compliance guarantee that lives only in a comment: it "must not be
     * silenced by `NODE_LOG_LEVEL`" and "must not be reformatted for human reading in dev".
     *
     * Both are one-word changes away from being false, and neither failure is visible — the app
     * keeps running, the ordinary log keeps flowing, and the audit trail quietly stops recording.
     * Which is exactly the situation an audit trail exists to prevent.
     *
     * The module is re-imported per case because both loggers are constructed at import time
     * from the environment as it stands then.
     */
    const originalLevel = process.env.NODE_LOG_LEVEL;
    const originalEnvironment = process.env.NODE_ENV;

    afterEach(() => {
        if (originalLevel === undefined) delete process.env.NODE_LOG_LEVEL;
        else process.env.NODE_LOG_LEVEL = originalLevel;
        if (originalEnvironment === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = originalEnvironment;
        jest.resetModules();
    });

    it('lets NODE_LOG_LEVEL quieten the ordinary logger', async () => {
        process.env.NODE_LOG_LEVEL = 'error';

        const { logger: appLogger } = await loadLoggers();

        expect(appLogger.level).toBe('error');
    });

    it('does NOT let NODE_LOG_LEVEL quieten the audit logger', async () => {
        // The compliance property. Set the app to `error` and audit records must still be
        // written — otherwise one environment variable erases the trail.
        process.env.NODE_LOG_LEVEL = 'error';

        const { auditLogger: audit } = await loadLoggers();

        expect(audit.level).toBe('info');
    });

    it('keeps the audit logger at info even in production', async () => {
        delete process.env.NODE_LOG_LEVEL;
        process.env.NODE_ENV = 'production';

        const { auditLogger: audit } = await loadLoggers();

        expect(audit.level).toBe('info');
    });

    it('gives both loggers at least one transport, so neither writes into the void', async () => {
        const { logger: appLogger, auditLogger: audit } = await loadLoggers();

        expect(appLogger.transports.length).toBeGreaterThan(0);
        expect(audit.transports.length).toBeGreaterThan(0);
    });
});
