/**
 * @module
 * `zodUserSchema`'s ten message thunks — exercised here because import-time coverage lies about
 * them: the schema is a declaration, so it reports 100% covered whether or not a thunk ever runs.
 * The case that matters most: `error: t('…')` instead of `error: () => t('…')` resolves at import
 * time, before `i18next.init()`, so Zod silently falls back to English — these cases catch that,
 * and a message attached to the wrong rule, by asserting on `en.json`'s own copy.
 */
import { zodUserSchema } from '@modules/users/model';
import { signupBodyPasswordMin, signupBodyPasswordMax } from '@api/schemas.zod';
import { readLocaleDictionary } from '@infrastructure/i18n';
import { PLAIN_PASSWORD } from '@modules/users/factories';
import { MINIMAL_PASSWORD } from '@modules/users/tests/factories';

/** The shipped English copy, read from the same file the thunks resolve against. */
const en = readLocaleDictionary('en') as { users: Record<string, string> };
const copy = (key: string) => en.users[key];

/** A payload that passes every rule, so each case can break exactly one field. */
const validUser = {
    email: 'valid@example.com',
    username: 'validuser',
    password: PLAIN_PASSWORD,
    role: 'customer',
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

describe('username length ceiling', () => {
    // A display name, printed in greetings and lists: bounded, with no charset rule (a charset
    // would refuse real names).
    it('accepts a name of exactly 50 characters, including non-ASCII ones', () => {
        expect(messagesFor({ ...validUser, username: 'ä'.repeat(50) }, 'username')).not.toContain(
            copy('field-username-max')
        );
    });

    it('uses the maximum-length copy for a name past 50', () => {
        const messages = messagesFor({ ...validUser, username: 'a'.repeat(51) }, 'username');

        expect(messages).toContain(copy('field-username-max'));
        expect(messages).not.toContain(copy('field-username-min'));
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
            { ...validUser, password: 'a'.repeat(signupBodyPasswordMin - 1) },
            'password'
        );

        expect(messages).toContain(copy('field-password-min'));
        expect(messages).not.toContain(copy('field-password-required'));
    });

    it('uses the maximum-length copy for a password past the contract ceiling', () => {
        const messages = messagesFor(
            { ...validUser, password: 'a'.repeat(signupBodyPasswordMax + 1) },
            'password'
        );

        expect(messages).toContain(copy('field-password-max'));
    });

    it('accepts a password of exactly the contract maximum, long passphrases included', () => {
        expect(
            messagesFor({ ...validUser, password: 'a'.repeat(signupBodyPasswordMax) }, 'password')
        ).toEqual([]);
    });

    it('accepts a password of exactly the contract minimum', () => {
        expect(messagesFor({ ...validUser, password: MINIMAL_PASSWORD }, 'password')).toEqual([]);
    });

    // No composition rules (NIST SP 800-63B-4): length is the whole policy here, and the breached
    // check, not a mix of character classes, keeps a weak one out.
    it.each([
        ['all lowercase', 'a'.repeat(signupBodyPasswordMin)],
        ['all digits', '1'.repeat(signupBodyPasswordMin)],
        ['a passphrase of words', 'correct horse battery staple']
    ])('accepts %s, since length is all the policy asks of the shape', (_label, password) => {
        expect(messagesFor({ ...validUser, password }, 'password')).toEqual([]);
    });
});

describe('inherited rules', () => {
    it('still validates the fields it did not override', () => {
        // `role`, `active` and `imageUrl` come from the generated CreateUserBody. If `.extend()`
        // ever replaced the base instead of extending it, these would silently stop being checked.
        // `active` carries the assertion rather than `role`, because a wrong-typed STRING is what
        // a string field cannot have — the check has to be against a field whose type can be
        // broken.
        const result = zodUserSchema.safeParse({ ...validUser, active: 'yes' });

        expect(result.success).toBe(false);
    });
});
