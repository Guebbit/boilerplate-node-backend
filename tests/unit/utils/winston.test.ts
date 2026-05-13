import { redactSensitiveFields, serializeError } from '@utils/winston';

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
        expect(result['authorization']).toBe('[REDACTED]');
        expect(result['cookie']).toBe('[REDACTED]');
        expect(result['contentType']).toBe('application/json');
    });

    it('is case-insensitive for sensitive field names', () => {
        const input = { Password: 'secret', PASSWORD: 'secret' };
        const result = redactSensitiveFields(input) as Record<string, unknown>;
        expect(result['Password']).toBe('[REDACTED]');
        expect(result['PASSWORD']).toBe('[REDACTED]');
    });

    it('redacts nested sensitive fields', () => {
        const input = { user: { email: 'a@b.com', password: 'secret' } };
        expect(redactSensitiveFields(input)).toEqual({
            user: { email: 'a@b.com', password: '[REDACTED]' }
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
        expect(result['name']).toBe('Error');
        expect(result['message']).toBe('something went wrong');
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
        expect(result['name']).toBe('ValidationError');
        expect(result['message']).toBe('bad input');
    });
});
