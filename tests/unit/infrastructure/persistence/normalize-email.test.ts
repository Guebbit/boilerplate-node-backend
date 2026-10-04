import { canonicalMailbox, normalizeEmail } from '@infrastructure/persistence/normalize-email';

describe('normalizeEmail', () => {
    it('trims surrounding whitespace and lowercases the address', () => {
        expect(normalizeEmail('  Ada@Example.com  ')).toBe('ada@example.com');
    });

    it('is idempotent on an already-normalized address', () => {
        expect(normalizeEmail('ada@example.com')).toBe('ada@example.com');
    });
});

describe('canonicalMailbox', () => {
    it.each([
        ['Ada@Example.com', 'ada@example.com'],
        ['ada+shop@example.com', 'ada@example.com'],
        ['ada+a+b@example.com', 'ada@example.com'],
        ['  ADA+Tag@Example.COM ', 'ada@example.com']
    ])('folds %s to the one mailbox %s', (input, expected) => {
        expect(canonicalMailbox(input)).toBe(expected);
    });

    // Gmail ignores dots and delivers googlemail.com to gmail.com; nobody else does, so a dot in
    // another provider's address is a different mailbox.
    it('drops dots and unifies the domain only for Gmail', () => {
        expect(canonicalMailbox('a.d.a+x@gmail.com')).toBe('ada@gmail.com');
        expect(canonicalMailbox('ada@googlemail.com')).toBe('ada@gmail.com');
        expect(canonicalMailbox('a.da@example.com')).toBe('a.da@example.com');
    });

    it('keeps two different mailboxes apart', () => {
        expect(canonicalMailbox('ada@example.com')).not.toBe(canonicalMailbox('bob@example.com'));
        expect(canonicalMailbox('ada@example.com')).not.toBe(canonicalMailbox('ada@example.org'));
    });

    // A leading `+` is not a tag on nothing, and an address with no `@` is left to validation.
    it('leaves a malformed address as it finds it, only lowercased', () => {
        expect(canonicalMailbox('+tag@example.com')).toBe('+tag@example.com');
        expect(canonicalMailbox('NoAtSign')).toBe('noatsign');
    });

    it('never touches a `+` in the DOMAIN', () => {
        expect(canonicalMailbox('ada@exa+mple.com')).toBe('ada@exa+mple.com');
    });
});
