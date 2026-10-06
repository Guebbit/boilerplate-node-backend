/**
 * @module
 * The `apikeys` schema's contract — the declarations, not the documents. Same reasoning as every
 * other module's `schema-contract.test.ts` (see e.g. `webhooks`'s own): a dropped `required` or a
 * `unique` quietly detached from `publicPrefix` changes nothing about what a VALID document looks
 * like, so an integration test that only ever saves valid fixtures cannot catch it.
 */
import { apiKeySchema } from '@modules/api-keys/model';
import { indexOptionSpecs, indexSpecs, optionsOf, requiredPaths } from '@tests/schema';

describe('apiKeySchema', () => {
    it('requires everything a credential needs to be looked up and floored', () => {
        expect(requiredPaths(apiKeySchema)).toEqual([
            'createdByUserId',
            'expiresAt',
            'hash',
            'name',
            'permissions',
            'publicPrefix',
            'tenant'
        ]);
    });

    it('leaves lifecycle fields absent until they apply', () => {
        // `lastUsedAt` (never presented yet) and `revokedAt` (never revoked) mean something
        // specific by their absence — a `default` on either would misreport a fresh credential as
        // already used or revoked. (`expiresAt` is required: every credential expires.)
        for (const path of ['lastUsedAt', 'revokedAt'])
            expect(requiredPaths(apiKeySchema)).not.toContain(path);
    });

    it('makes "no two credentials share a prefix" a database fact', () => {
        // This is what makes `findActiveByPrefix` an exact lookup rather than "most recent wins".
        expect(indexOptionSpecs(apiKeySchema)).toContain('publicPrefix_1: unique=true');
    });

    it('declares the prefix uniqueness and the tenant listing index, and nothing else', () => {
        expect(indexSpecs(apiKeySchema)).toEqual([
            'publicPrefix_1: publicPrefix+1',
            'tenant_1_createdAt_-1: tenant+1, createdAt-1'
        ]);
    });

    it('declares no TTL or sparse option on either index', () => {
        expect(indexOptionSpecs(apiKeySchema)).toEqual([
            'publicPrefix_1: unique=true',
            'tenant_1_createdAt_-1: (none)'
        ]);
    });

    it('keeps createdAt and updatedAt, which the tenant listing sorts by', () => {
        expect(optionsOf(apiKeySchema).timestamps).toBe(true);
    });
});
