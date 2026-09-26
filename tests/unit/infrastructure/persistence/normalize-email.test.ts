import { normalizeEmail } from '@infrastructure/persistence/normalize-email';

describe('normalizeEmail', () => {
    it('trims surrounding whitespace and lowercases the address', () => {
        expect(normalizeEmail('  Ada@Example.com  ')).toBe('ada@example.com');
    });

    it('is idempotent on an already-normalized address', () => {
        expect(normalizeEmail('ada@example.com')).toBe('ada@example.com');
    });
});
