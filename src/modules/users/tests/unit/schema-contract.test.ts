/**
 * @module
 * The user schema's contract, and the two token-bearing methods on it.
 *
 * The most security-sensitive schema in the codebase: `select: false` on `password` and `tokens`
 * keeps them out of ordinary reads, `omit` on the transform repeats the guarantee at
 * serialization, and each is tested independently since neither is load-bearing alone. The
 * `pre('save')` hook hashes only when `password` is modified, so an ordinary profile update
 * cannot re-hash an existing hash into an unusable one.
 */
import bcrypt from 'bcrypt';
import { userSchema, applyUserTransform } from '@modules/users/model';
import { TokenType } from '@modules/users';
import { asStub } from '@tests/stub';
import {
    defaultOf,
    indexOptionSpecs,
    indexSpecs,
    optionsOf,
    pathOptions,
    requiredPaths,
    subSchema,
    typeOf
} from '@tests/schema';

describe('userSchema — what a user must carry', () => {
    it('requires an address, a name and a password, and nothing else', () => {
        expect(requiredPaths(userSchema)).toEqual(['email', 'password', 'username']);
    });

    it('constrains the email to something that can be delivered to', () => {
        // The schema's own `match`, exercised through the compiled pattern rather than restated:
        // this is the last line of defence for accounts created outside the Zod-validated route,
        // and every account-recovery flow depends on the address being reachable.
        const pattern = pathOptions(userSchema, 'email').match as RegExp;

        expect(pattern.test('ada@example.com')).toBe(true);
        expect(pattern.test('ada.lovelace@sub.example.co.uk')).toBe(true);
        expect(pattern.test('not-an-address')).toBe(false);
        expect(pattern.test('ada@example')).toBe(false);
        expect(pattern.test('@example.com')).toBe(false);
    });

    it('anchors the address, so nothing may be smuggled around it', () => {
        // `^` and `$`. Unanchored, the pattern matches a valid address ANYWHERE in the string, so
        // `"Ada" <ada@example.com> evil@attacker.test` is accepted and stored whole — a display
        // name and a second address riding along in a field every recovery email is sent to.
        const pattern = pathOptions(userSchema, 'email').match as RegExp;

        expect(pattern.test('  ada@example.com')).toBe(false);
        expect(pattern.test('ada@example.com  ')).toBe(false);
        expect(pattern.test('"Ada" <ada@example.com>')).toBe(false);
        expect(pattern.test('ada@example.com,evil@attacker.test')).toBe(false);
        expect(pattern.test('ada@example.com\nBcc: evil@attacker.test')).toBe(false);
    });

    it('creates a user as a non-admin, active and unverified', () => {
        // `admin: false` is the fail-safe direction and the only one: a default of `true`, or an
        // absent default read as truthy anywhere, is an account-creation privilege escalation.
        // `verified: false` matters equally — a default of `true` makes the whole email
        // verification flow decorative, since every new account already satisfies it.
        expect(defaultOf(userSchema, 'admin')).toBe(false);
        expect(defaultOf(userSchema, 'active')).toBe(true);
        expect(defaultOf(userSchema, 'verified')).toBe(false);
    });

    it('gives a new user the configured locale and avatar', () => {
        expect(defaultOf(userSchema, 'locale')).toBe(process.env.NODE_DEFAULT_LOCALE ?? 'en');
        expect(defaultOf(userSchema, 'imageUrl')).toBe(
            process.env.NODE_DEFAULT_IMAGE_USER ?? 'https://placekitten.com/600/600'
        );
    });

    /*
     * The case above cannot tell a working `??` from a broken one, and that is worth stating
     * rather than leaving as a gap. This checkout's `.env` sets `NODE_DEFAULT_LOCALE=en` and
     * `NODE_DEFAULT_IMAGE_USER` to the very string the `??` falls back to — so the configured
     * value and the fallback are identical, and an expression that returned the WRONG one of the
     * two would satisfy it. The defaults are captured when the module loads, so the only way to
     * tell them apart is to load the module again with a different environment.
     */
    it.each([
        ['NODE_DEFAULT_LOCALE', 'locale', 'it'],
        ['NODE_DEFAULT_IMAGE_USER', 'imageUrl', 'https://cdn.example.test/avatar.png']
    ])('prefers %s over the built-in fallback', async (variable, path, configured) => {
        const original = process.env[variable];
        process.env[variable] = configured;

        try {
            await jest.isolateModulesAsync(async () => {
                const reloaded = await import('@modules/users/model');

                expect(defaultOf(reloaded.userSchema, path)).toBe(configured);
            });
        } finally {
            if (original === undefined) delete process.env[variable];
            else process.env[variable] = original;
        }
    });

    it('starts a user with an empty token list rather than an absent one', () => {
        expect(defaultOf(userSchema, 'tokens')).toEqual([]);
    });

    it('leaves the soft-delete marker unset, and typed as a Date', () => {
        // The type is load-bearing: every visibility scope tests `deletedAt` with `$exists`, and
        // a Mixed path would accept the ISO string the contract uses on the wire — after which
        // the two representations sort and compare differently.
        expect(defaultOf(userSchema, 'deletedAt')).toBeUndefined();
        expect(typeOf(userSchema, 'deletedAt')).toBe('Date');
    });

    it('keeps timestamps', () => {
        expect(optionsOf(userSchema).timestamps).toBe(true);
    });
});

describe('userSchema — the credentials never load by accident', () => {
    it('withholds the password hash from every query that does not ask for it', () => {
        // The first of the two layers. Without it, `.lean()` reads — which skip the transform
        // entirely — return the hash, and so does anything that spreads a document.
        expect(pathOptions(userSchema, 'password').select).toBe(false);
    });

    it('withholds the token list from every query that does not ask for it', () => {
        // Live refresh tokens. A leaked one is a session, usable until it expires and invisible
        // in any audit trail as anything other than the user's own activity.
        expect(pathOptions(userSchema, 'tokens').select).toBe(false);
    });

    it('strips both again at serialization, independently of the projection', () => {
        // The second layer. `omit` runs on the way out, so a query that DID ask for the password
        // — the login path must — still cannot serialize it by accident.
        const serialized = applyUserTransform({
            _id: 'abc',
            email: 'ada@example.com',
            password: '$2a$12$hash',
            tokens: [{ type: TokenType.REFRESH, token: 'live-token' }]
        });

        expect(serialized.password).toBeUndefined();
        expect(serialized.tokens).toBeUndefined();
        expect(serialized.email).toBe('ada@example.com');
        // And the ordinary rename still happens, so this is the real transform and not a stub.
        expect(serialized.id).toBe('abc');
        expect(serialized._id).toBeUndefined();
    });

    it('leaks nothing through a JSON round trip of the serialized user', () => {
        // The assertion that survives a future field being added beside `password`: search the
        // rendered output for the secret itself rather than for the key it lived under.
        const rendered = JSON.stringify(
            applyUserTransform({
                _id: 'abc',
                password: '$2a$12$hash',
                tokens: [{ type: TokenType.REFRESH, token: 'live-token' }]
            })
        );

        expect(rendered).not.toContain('$2a$12$hash');
        expect(rendered).not.toContain('live-token');
    });
});

describe('userSchema — a stored token', () => {
    it('requires a kind and the token itself', () => {
        // A token row without its `type` cannot be revoked by any flow: every revocation is
        // `$pull` by type, so an untyped entry survives logout, reset and account deletion.
        expect(requiredPaths(subSchema(userSchema, 'tokens'))).toEqual(['token', 'type']);
    });

    it('leaves the expiry and last-use optional', () => {
        // A refresh token issued without "remember me" has no expiry of its own, and a token
        // never used has no last-use. Requiring either makes those states unrepresentable.
        const token = subSchema(userSchema, 'tokens');

        expect(requiredPaths(token)).not.toContain('expiration');
        expect(requiredPaths(token)).not.toContain('lastUsedAt');
        // Declared as Dates, not merely declared. An empty declaration still creates the path —
        // as a Mixed field — so `tokenRemoveExpired`'s `$lt` would compare against whatever the
        // driver stored, and the sweep would quietly stop matching anything.
        expect(typeOf(token, 'expiration')).toBe('Date');
        expect(typeOf(token, 'lastUsedAt')).toBe('Date');
    });
});

describe('userSchema — indexes', () => {
    it('declares exactly the two documented indexes', () => {
        // `users_tokens_token` is what makes `verifyRefreshToken`'s lookup — by token value,
        // across every user — an index hit rather than a collection scan on every refresh.
        expect(indexSpecs(userSchema)).toEqual([
            'users_email: email+1',
            'users_tokens_token: tokens.token+1'
        ]);
    });

    it('makes one account per email address a database fact', () => {
        // Uniqueness here is an authentication invariant, not hygiene: two rows for one address
        // make "the user with this email" ambiguous at exactly the moment a password is checked.
        expect(indexOptionSpecs(userSchema)).toEqual([
            'users_email: unique=true',
            'users_tokens_token: (none)'
        ]);
    });
});

/**
 * The hook itself, reached off the schema rather than through a `save()`.
 *
 * Kareem — Mongoose's middleware layer — keeps registered pre-hooks in `schema.s.hooks._pres`,
 * keyed by the method they wrap. Reaching in is deliberate: the alternative is a real save,
 * which needs a database and would make this an integration test for a function that is pure
 * apart from the bcrypt call. If Mongoose moves this, the failure is a loud `undefined` here
 * rather than a silently skipped assertion.
 */
const preSaveHook = (): ((this: unknown) => Promise<void> | undefined) => {
    const pres = asStub<{
        s: {
            hooks: {
                _pres: Map<string, { fn: (this: unknown) => Promise<void> | undefined }[]>;
            };
        };
    }>(userSchema).s.hooks._pres;

    // Mongoose registers its OWN pre-save hooks (subdocument collection, validation) on every
    // schema, and they come first. Ours is selected by what it does rather than by position:
    // taking `[0]` reaches an internal hook that fails on a plain object with
    // `this.$getAllSubdocs is not a function`, which reads as a broken test rather than as
    // the wrong hook.
    const ours = (pres.get('save') ?? []).filter(({ fn }) =>
        fn.toString().includes("isModified('password')")
    );

    if (ours.length !== 1)
        throw new Error(
            `Expected exactly one password pre-save hook on userSchema, found ${ours.length}. ` +
                'Either it was removed — which is the regression these cases exist to catch — ' +
                'or Mongoose moved its middleware storage and this accessor needs updating.'
        );

    return ours[0].fn;
};

describe('userSchema — the pre-save password hook', () => {
    it('hashes a password that was set', async () => {
        const document = {
            password: 'Password1!',
            isModified: jest.fn().mockReturnValue(true)
        };

        await preSaveHook().call(document);

        expect(document.password).not.toBe('Password1!');
        // A real bcrypt hash, at the cost factor the module chose — not merely "something else".
        expect(document.password.startsWith('$2')).toBe(true);
        expect(await bcrypt.compare('Password1!', document.password)).toBe(true);
    });

    it('leaves an untouched password alone', async () => {
        // The guard that matters: without it, every profile update re-hashes the stored HASH,
        // and the account becomes unloggable-into with no error anywhere.
        const stored = await bcrypt.hash('Password1!', 4);
        const document = { password: stored, isModified: jest.fn().mockReturnValue(false) };

        await preSaveHook().call(document);

        expect(document.password).toBe(stored);
        expect(document.isModified).toHaveBeenCalledWith('password');
    });
});
