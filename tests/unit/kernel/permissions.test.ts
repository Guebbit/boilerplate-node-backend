/**
 * @module
 * `shared/authorization-keys.yaml` and `shared/authorization-roles.yaml` are parsed against a Zod
 * schema at import, not merely cast — see `permissions.ts`'s own docblock. A malformed file must
 * fail loudly, naming what was wrong, rather than load a rule that silently never matches.
 */

import { z } from 'zod';
import {
    ANONYMOUS_ROLE,
    keysDocumentSchema,
    PERMISSION_KEYS,
    PRESET_ROLES,
    rolesDocumentSchema
} from '@kernel/permissions';

/** A minimal, otherwise-valid keys document — each test below breaks exactly one field of it. */
const validKeysDocument = {
    version: 1,
    actions: ['read'],
    scopes: { tenant: 'Content belonging to one shop.', platform: 'Shared operational data.' },
    wildcards: { subject: 'all', action: 'manage' },
    keys: [
        {
            key: 'products.self.read',
            module: 'products',
            subject: 'Product',
            action: 'read',
            scope: 'tenant',
            description: 'Read active products.'
        }
    ]
};

describe('keysDocumentSchema', () => {
    it('accepts a well-formed document', () => {
        expect(keysDocumentSchema.safeParse(validKeysDocument).success).toBe(true);
    });

    it('refuses an action outside the declared vocabulary, naming the offending key', () => {
        const result = keysDocumentSchema.safeParse({
            ...validKeysDocument,
            keys: [{ ...validKeysDocument.keys[0], action: 'raed' }]
        });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(z.prettifyError(result.error)).toContain('keys');
        expect(z.prettifyError(result.error)).toContain('action');
    });

    it('refuses a key missing its scope', () => {
        const { scope: _scope, ...keyWithoutScope } = validKeysDocument.keys[0];
        const result = keysDocumentSchema.safeParse({
            ...validKeysDocument,
            keys: [keyWithoutScope]
        });

        expect(result.success).toBe(false);
    });

    it('refuses an unknown stepUp tier', () => {
        const result = keysDocumentSchema.safeParse({
            ...validKeysDocument,
            keys: [{ ...validKeysDocument.keys[0], stepUp: 'criticl' }]
        });

        expect(result.success).toBe(false);
    });

    it('refuses conditions that are not an object', () => {
        const result = keysDocumentSchema.safeParse({
            ...validKeysDocument,
            keys: [{ ...validKeysDocument.keys[0], conditions: 'active' }]
        });

        expect(result.success).toBe(false);
    });
});

describe('rolesDocumentSchema', () => {
    it('accepts a well-formed document', () => {
        expect(
            rolesDocumentSchema.safeParse({
                version: 1,
                roles: [
                    {
                        name: 'moderator',
                        scope: 'tenant',
                        title: 'The moderator',
                        description: 'Accounts and orders.',
                        permissions: ['users.any.read']
                    }
                ],
                anonymous: { name: 'guest', scope: 'tenant', permissions: ['products.self.read'] }
            }).success
        ).toBe(true);
    });

    it('refuses a role with no permissions array', () => {
        const result = rolesDocumentSchema.safeParse({
            version: 1,
            roles: [{ name: 'moderator', scope: 'tenant', title: 't', description: 'd' }],
            anonymous: { name: 'guest', scope: 'tenant', permissions: [] }
        });

        expect(result.success).toBe(false);
    });
});

describe('the real shared authorization files', () => {
    it('parsed without throwing at import — every declared key and preset role loaded', () => {
        // If either file had failed its schema, importing `@kernel/permissions` above would
        // already have thrown and this whole test file would fail to load — these assertions are
        // the visible proof that didn't happen.
        expect(PERMISSION_KEYS.length).toBeGreaterThan(0);
        expect(PRESET_ROLES.length).toBeGreaterThan(0);
        expect(ANONYMOUS_ROLE.name).toBeTruthy();
    });
});
