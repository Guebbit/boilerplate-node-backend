/**
 * `src/infrastructure/adapters/semantic-names.ts` — the rename from the field names code writes
 * to the OpenTelemetry semantic-convention names a log line carries, and its wiring into the
 * real transport format.
 */
import { resolveConsoleFormat } from '@infrastructure/adapters/logger';
import { SEMANTIC_LOG_NAMES, toSemanticNames } from '@infrastructure/adapters/semantic-names';
import { setEnvironment } from '@tests/environment';

describe('toSemanticNames', () => {
    it('renames every mapped field and keeps its value', () => {
        const input = Object.fromEntries(Object.keys(SEMANTIC_LOG_NAMES).map((key) => [key, key]));

        const output = toSemanticNames(input);

        for (const [key, name] of Object.entries(SEMANTIC_LOG_NAMES))
            expect(output[name]).toBe(key);
        expect(Object.keys(output)).toHaveLength(Object.keys(input).length);
    });

    it('leaves a field without a mapping alone', () => {
        expect(toSemanticNames({ level: 'info', message: 'hi', rung: 'a' })).toEqual({
            level: 'info',
            message: 'hi',
            rung: 'a'
        });
    });

    it('names the actor role as the one-entry list the convention defines', () => {
        expect(toSemanticNames({ actorRole: 'admin' })).toEqual({ 'user.roles': ['admin'] });
    });

    it('spreads a serialised error over the exception attributes', () => {
        const output = toSemanticNames({
            error: {
                name: 'TypeError',
                message: 'boom',
                stack: 'at x',
                cause: 'root',
                code: 11_000
            }
        });

        expect(output).toEqual({
            'exception.type': 'TypeError',
            'exception.message': 'boom',
            'exception.stacktrace': 'at x',
            'exception.cause': 'root',
            'exception.details': { code: 11_000 }
        });
    });

    it('keeps a bare error string as the exception message', () => {
        expect(toSemanticNames({ error: 'disk full' })).toEqual({
            'exception.message': 'disk full'
        });
    });

    it('does not open a nested object: metadata stays the call site own shape', () => {
        const metadata = { actorUserId: 'inner' };

        expect(toSemanticNames({ metadata }).metadata).toBe(metadata);
    });
});

describe('the transport format applies the rename', () => {
    /** Winston keeps the finished line under this symbol. */
    const MESSAGE = Symbol.for('message');
    const LEVEL = Symbol.for('level');

    it('writes an audit-shaped record with the semantic names, after redacting by the code names', () => {
        setEnvironment({ NODE_ENV: 'production', NODE_LOG_PERSONAL_FIELDS: 'redact' });

        const rendered = resolveConsoleFormat().transform({
            level: 'warn',
            message: 'security.forbidden',
            [LEVEL]: 'warn',
            service: 'api',
            actorUserId: 'u1',
            ip: '203.0.113.9',
            userAgent: 'curl',
            traceId: 'abc',
            statusCode: 403,
            error: new Error('nope')
        });
        const line = JSON.parse((rendered as Record<symbol, string>)[MESSAGE]) as Record<
            string,
            unknown
        >;

        expect(line).toMatchObject({
            level: 'warn',
            message: 'security.forbidden',
            'service.name': 'api',
            'user.id': 'u1',
            // Redaction ran first, on `ip`: renamed to `client.address` it would have been missed.
            'client.address': '[REDACTED]',
            'user_agent.original': 'curl',
            trace_id: 'abc',
            'http.response.status_code': 403,
            'exception.type': 'Error',
            'exception.message': 'nope'
        });
        expect(line).not.toHaveProperty('actorUserId');
        expect(line).not.toHaveProperty('ip');
    });
});
