import { redactSensitiveFields, serializeError } from '@utils/winston';

// ---------------------------------------------------------------------------
// redactSensitiveFields
// ---------------------------------------------------------------------------

describe('redactSensitiveFields', () => {
    it('returns primitive values unchanged', () => {
        expect(redactSensitiveFields('hello')).toBe('hello');
        expect(redactSensitiveFields(42)).toBe(42);
        expect(redactSensitiveFields(true)).toBe(true);
        // Non-object / non-array values should pass through as-is
        expect(redactSensitiveFields(void 0)).toBeUndefined();
    });

    it('redacts a top-level password field', () => {
        const input = { username: 'alice', password: 's3cr3t' };
        expect(redactSensitiveFields(input)).toEqual({
            username: 'alice',
            password: '[REDACTED]'
        });
    });

    it('redacts token fields', () => {
        const input = { access_token: 'tok123', refresh_token: 'ref456', user: 'bob' };
        expect(redactSensitiveFields(input)).toEqual({
            access_token: '[REDACTED]',
            refresh_token: '[REDACTED]',
            user: 'bob'
        });
    });

    it('redacts authorization and cookie headers', () => {
        // Use camelCase-compatible keys as the linter requires; the redaction is case-insensitive
        const input = {
            authorization: 'Bearer abc',
            cookie: 'jwt=xyz',
            contentType: 'application/json'
        };
        const result = redactSensitiveFields(input) as Record<string, unknown>;
        expect(result['authorization']).toBe('[REDACTED]');
        expect(result['cookie']).toBe('[REDACTED]');
        expect(result['contentType']).toBe('application/json');
    });

    it('is case-insensitive for sensitive field names', () => {
        const input = { Password: 'secret', PASSWORD: 'secret', pAsSwOrD: 'secret' };
        const result = redactSensitiveFields(input) as Record<string, unknown>;
        expect(result['Password']).toBe('[REDACTED]');
        expect(result['PASSWORD']).toBe('[REDACTED]');
        expect(result['pAsSwOrD']).toBe('[REDACTED]');
    });

    it('redacts nested sensitive fields', () => {
        const input = {
            user: {
                email: 'alice@example.com',
                password: 'secret123'
            }
        };
        expect(redactSensitiveFields(input)).toEqual({
            user: {
                email: 'alice@example.com',
                password: '[REDACTED]'
            }
        });
    });

    it('redacts sensitive fields inside arrays', () => {
        const input = [{ password: 'a' }, { password: 'b', name: 'carol' }];
        expect(redactSensitiveFields(input)).toEqual([
            { password: '[REDACTED]' },
            { password: '[REDACTED]', name: 'carol' }
        ]);
    });

    it('does not modify safe fields', () => {
        const input = { email: 'alice@example.com', role: 'user', id: '123' };
        expect(redactSensitiveFields(input)).toEqual(input);
    });

    it('handles empty objects and arrays', () => {
        expect(redactSensitiveFields({})).toEqual({});
        expect(redactSensitiveFields([])).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// serializeError
// ---------------------------------------------------------------------------

describe('serializeError', () => {
    it('extracts name and message from an Error instance', () => {
        const err = new Error('something went wrong');
        const result = serializeError(err);
        expect(result['name']).toBe('Error');
        expect(result['message']).toBe('something went wrong');
    });

    it('wraps non-Error values in a raw field', () => {
        expect(serializeError('plain string')).toEqual({ raw: 'plain string' });
        expect(serializeError(42)).toEqual({ raw: '42' });
        // Non-Error objects / primitives are stringified for consistency
        expect(serializeError(void 0)).toEqual({ raw: 'undefined' });
    });

    it('preserves custom error names', () => {
        class ValidationError extends Error {
            constructor(message: string) {
                super(message);
                this.name = 'ValidationError';
            }
        }
        const result = serializeError(new ValidationError('bad input'));
        expect(result['name']).toBe('ValidationError');
        expect(result['message']).toBe('bad input');
    });
});
