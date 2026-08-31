/**
 * @module
 * `zodUserSchema`'s six message thunks — exercised here because import-time coverage lies about
 * them: the schema is a declaration, so it reports 100% covered whether or not a thunk ever runs.
 * The case that matters most: `error: t('…')` instead of `error: () => t('…')` resolves at import
 * time, before `i18next.init()`, so Zod silently falls back to English — these cases catch that,
 * and a message attached to the wrong rule, by asserting on `en.json`'s own copy.
 */
import { zodUserSchema } from '@modules/users';
import { createUserBodyPasswordMin } from '@api/schemas.zod';
import { readLocaleDictionary } from '@infrastructure/i18n';

/** The shipped English copy, read from the same file the thunks resolve against. */
const en = readLocaleDictionary('en') as { users: Record<string, string> };
const copy = (key: string) => en.users[key];

/** A payload that passes every rule, so each case can break exactly one field. */
const validUser = {
    email: 'valid@example.com',
    username: 'validuser',
    password: 'Password1!',
    admin: false,
    active: true
};

/** All messages Zod produced for `field`, flattened out of the issue list. */
const messagesFor = (payload: Record<string, unknown>, field: string): string[] => {
    const result = zodUserSchema.safeParse(payload);
    if (result.success) return [];
    return result.error.issues
        .filter((issue) => issue.path[0] === field)
        .map((issue) => issue.message);
};

describe('zodUserSchema accepts a valid user', () => {
    it('parses the happy payload, so every rejection below is about one field', () => {
        expect(zodUserSchema.safeParse(validUser).success).toBe(true);
    });
});

describe('email messages', () => {
    it('uses the required copy for an empty address', () => {
        expect(messagesFor({ ...validUser, email: '' }, 'email')).toContain(
            copy('field-email-required')
        );
    });

    it('uses the invalid copy — not the required copy — for a malformed address', () => {
        const messages = messagesFor({ ...validUser, email: 'not-an-email' }, 'email');

        expect(messages).toContain(copy('field-email-invalid'));
        expect(messages).not.toContain(copy('field-email-required'));
    });
});

describe('username messages', () => {
    it('uses the required copy for an empty username', () => {
        expect(messagesFor({ ...validUser, username: '' }, 'username')).toContain(
            copy('field-username-required')
        );
    });

    it('uses the minimum-length copy — not the required copy — for a short username', () => {
        // The case that separates `min(1)` from `min(3)`. Both reject 'ab'; only one is correct.
        const messages = messagesFor({ ...validUser, username: 'ab' }, 'username');

        expect(messages).toContain(copy('field-username-min'));
        expect(messages).not.toContain(copy('field-username-required'));
    });
});

describe('password messages', () => {
    it('uses the required copy for an empty password', () => {
        expect(messagesFor({ ...validUser, password: '' }, 'password')).toContain(
            copy('field-password-required')
        );
    });

    it('uses the minimum-length copy for a password one character short of the contract', () => {
        // Length read from the generated schema rather than written here, so a change to
        // openapi.yaml moves this boundary with it instead of leaving a stale literal behind.
        const messages = messagesFor(
            { ...validUser, password: 'a'.repeat(createUserBodyPasswordMin - 1) },
            'password'
        );

        expect(messages).toContain(copy('field-password-min'));
        expect(messages).not.toContain(copy('field-password-required'));
    });

    it('accepts a password of exactly the contract minimum', () => {
        expect(
            messagesFor(
                { ...validUser, password: 'a'.repeat(createUserBodyPasswordMin) },
                'password'
            )
        ).toEqual([]);
    });
});

describe('inherited rules', () => {
    it('still validates the fields it did not override', () => {
        // `admin`, `active` and `imageUrl` come from the generated CreateUserBody. If `.extend()`
        // ever replaced the base instead of extending it, these would silently stop being checked.
        const result = zodUserSchema.safeParse({ ...validUser, admin: 'yes' });

        expect(result.success).toBe(false);
    });
});
