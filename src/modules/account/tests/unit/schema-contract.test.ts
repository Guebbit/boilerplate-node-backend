/**
 * @module
 * The account module's three schemas — exports, sessions and verification tokens — as
 * declarations, not documents. Each carries a database fact a valid fixture cannot show: the TTL
 * that deletes a spent row, the unique digest, the one-live-export index.
 */
import {
    accountExportSchema,
    sessionSchema,
    verificationTokenSchema,
    EXPORT_STATUSES
} from '@modules/account/model';
import {
    enumOf,
    indexOptionSpecs,
    indexSpecs,
    optionsOf,
    pathOptions,
    requiredPaths
} from '@tests/schema';

describe('accountExportSchema', () => {
    it('requires every field: the build fills them all at request time', () => {
        expect(requiredPaths(accountExportSchema)).toEqual([
            'createdAt',
            'expiresAt',
            'file',
            'status',
            'userId'
        ]);
    });

    it('allows one live export per account as a database fact', () => {
        expect(pathOptions(accountExportSchema, 'userId')).toMatchObject({ unique: true });
    });

    it('restricts status to the three the build moves through', () => {
        expect(enumOf(accountExportSchema, 'status')).toEqual([...EXPORT_STATUSES]);
    });

    it('indexes the reaper’s read of due rows, and has no TTL of its own', () => {
        // The reaper deletes the row AND its file, so a TTL index would orphan the file.
        expect(indexSpecs(accountExportSchema)).toContain('expiresAt_1: expiresAt+1');
        expect(indexOptionSpecs(accountExportSchema).join(',')).not.toContain('expireAfterSeconds');
    });

    it('sets its own timestamps', () => {
        expect(optionsOf(accountExportSchema).timestamps).toBe(false);
    });
});

describe('sessionSchema', () => {
    it('requires what every reading mode needs, and leaves the rest absent', () => {
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

    it('makes the credential digest unique', () => {
        expect(pathOptions(sessionSchema, 'tokenHash')).toMatchObject({ unique: true });
    });

    it('lets the database delete a row at its own purgeAt', () => {
        // `expireAfterSeconds: 0` means "at that time": a per-row date, so changing a lifetime
        // never rebuilds the index.
        expect(indexOptionSpecs(sessionSchema)).toContain('purgeAt_1: expireAfterSeconds=0');
    });

    it('indexes an account’s sessions by family', () => {
        expect(indexSpecs(sessionSchema)).toContain('userId_1_familyId_1: userId+1, familyId+1');
    });
});

describe('verificationTokenSchema', () => {
    it('requires what a link is looked up and expired by', () => {
        expect(requiredPaths(verificationTokenSchema)).toEqual([
            'expiresAt',
            'sentAt',
            'tokenHash',
            'type',
            'userId'
        ]);
    });

    it('lets the database delete a row at its own expiresAt', () => {
        expect(indexOptionSpecs(verificationTokenSchema)).toContain(
            'expiresAt_1: expireAfterSeconds=0'
        );
    });

    it('limits one live link per account to the kinds that allow only one', () => {
        // A PARTIAL unique index: the kinds that allow several (a delete confirmation, an MFA
        // challenge) must not be constrained by it.
        const specs = indexOptionSpecs(verificationTokenSchema).join('\n');
        expect(specs).toContain('userId_1_type_1');
        expect(specs).toContain('unique=true');
        expect(specs).toContain('partialFilterExpression');
    });
});
