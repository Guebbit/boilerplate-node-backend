/**
 * @module
 * The `sessions` and `verificationtokens` schemas — the declarations whose failures are silent: a
 * dropped TTL index keeps rows for ever, a dropped partial unique index lets two reset links live
 * at once, an open `type` lets a misspelt kind be stored and never purged, and a serialized digest
 * hands out a credential. Read off the schema objects, so no database is involved.
 */

import {
    enumOf,
    indexBehaviour,
    indexSpecs,
    optionsOf,
    pathOptions,
    requiredPaths
} from '@tests/schema';
import {
    sessionSchema,
    verificationTokenSchema,
    sessionModel,
    verificationTokenModel
} from '../../model';
import { ONE_LIVE_TOKEN_TYPES, VERIFICATION_TOKEN_TYPES } from '../../token-types';
import { Types } from 'mongoose';

describe('sessionSchema', () => {
    it('requires who, which session, which mode, the digest, when it began and when it ends', () => {
        expect(requiredPaths(sessionSchema)).toEqual([
            'expiresAt',
            'familyId',
            'mode',
            'purgeAt',
            'startedAt',
            'tokenHash',
            'userId'
        ]);
    });

    it('restricts the mode to the two the deployment can run', () => {
        expect(enumOf(sessionSchema, 'mode')).toEqual(['jwt', 'cookie']);
    });

    it('makes the digest unique, so one credential names one row', () => {
        expect(pathOptions(sessionSchema, 'tokenHash').unique).toBe(true);
    });

    it('lets the database delete a row at its own `purgeAt`', () => {
        expect(indexBehaviour(sessionSchema).purgeAt_1).toEqual({ expireAfterSeconds: 0 });
    });

    it('declares exactly the indexes the queries use', () => {
        expect(indexSpecs(sessionSchema)).toEqual([
            'purgeAt_1: purgeAt+1',
            'tokenHash_1: tokenHash+1',
            'userId_1_familyId_1: userId+1, familyId+1'
        ]);
    });

    it('keeps no timestamps of its own: the dates are set on purpose', () => {
        expect(optionsOf(sessionSchema).timestamps).toBe(false);
    });

    it('never serializes the digest', () => {
        const row = new sessionModel({
            userId: new Types.ObjectId(),
            familyId: new Types.ObjectId(),
            mode: 'jwt',
            tokenHash: 'a-digest',
            startedAt: new Date(),
            expiresAt: new Date(),
            purgeAt: new Date()
        });

        expect(JSON.stringify(row.toJSON())).not.toContain('a-digest');
    });
});

describe('verificationTokenSchema', () => {
    it('requires who, which kind, the digest, when it was sent and when it expires', () => {
        expect(requiredPaths(verificationTokenSchema)).toEqual([
            'expiresAt',
            'sentAt',
            'tokenHash',
            'type',
            'userId'
        ]);
    });

    it('closes the kind to the vocabulary account owns', () => {
        expect(enumOf(verificationTokenSchema, 'type')).toEqual([...VERIFICATION_TOKEN_TYPES]);
    });

    it('makes the digest unique', () => {
        expect(pathOptions(verificationTokenSchema, 'tokenHash').unique).toBe(true);
    });

    it('lets the database delete a row at its own `expiresAt`', () => {
        expect(indexBehaviour(verificationTokenSchema).expiresAt_1).toEqual({
            expireAfterSeconds: 0
        });
    });

    it('allows one live link per account for exactly the one-live kinds, and no others', () => {
        const behaviour = indexBehaviour(verificationTokenSchema).userId_1_type_1;

        expect(behaviour).toEqual({
            unique: true,
            partialFilterExpression: { type: { $in: [...ONE_LIVE_TOKEN_TYPES] } }
        });
        // The kinds that allow several are the complement — a delete confirmation and a challenge.
        expect(
            VERIFICATION_TOKEN_TYPES.filter((type) => !ONE_LIVE_TOKEN_TYPES.includes(type))
        ).toEqual(['delete', 'mfa-challenge']);
    });

    it('never serializes the digest', () => {
        const row = new verificationTokenModel({
            userId: new Types.ObjectId(),
            type: 'password',
            tokenHash: 'a-digest',
            sentAt: new Date(),
            expiresAt: new Date()
        });

        expect(JSON.stringify(row.toJSON())).not.toContain('a-digest');
    });
});
