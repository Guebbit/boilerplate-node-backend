/**
 * @module
 * The account presenter as a pure mapping: a stored session row or export request in, the wire
 * shape out, with the credential never among the fields.
 */

import { Types } from 'mongoose';
import type { SessionRow } from '../../repository';
import { presentExport, presentExportSession, presentSession } from '../../presenter';

/** A session row with a credential on it, to prove none reaches the wire. */
const row = {
    familyId: new Types.ObjectId('64b64b64b64b64b64b64b64b'),
    tokenHash: 'a-credential-digest',
    startedAt: new Date('2026-01-01T00:00:00Z'),
    expiresAt: new Date('2026-02-01T00:00:00Z'),
    lastUsedAt: new Date('2026-01-02T00:00:00Z'),
    device: 'Firefox on Linux'
} as SessionRow;

describe('presentSession', () => {
    it('maps the family id, the dates and the device, and marks the caller’s own', () => {
        expect(presentSession(row, new Date('2026-01-15T00:00:00Z'), true)).toEqual({
            id: '64b64b64b64b64b64b64b64b',
            createdAt: '2026-01-01T00:00:00.000Z',
            expiration: '2026-01-15T00:00:00.000Z',
            lastUsedAt: '2026-01-02T00:00:00.000Z',
            device: 'Firefox on Linux',
            current: true
        });
    });

    it('leaves out what was never recorded, and never carries the credential', () => {
        const unused = { ...row, lastUsedAt: undefined, device: undefined } as SessionRow;

        const wire = presentSession(unused, unused.expiresAt, false);

        expect(wire).not.toHaveProperty('lastUsedAt');
        expect(wire).not.toHaveProperty('device');
        expect(JSON.stringify(wire)).not.toContain('a-credential-digest');
    });
});

describe('presentExportSession', () => {
    it('uses the row’s own expiry and has no `current`', () => {
        const wire = presentExportSession(row);

        expect(wire.expiration).toBe('2026-02-01T00:00:00.000Z');
        expect(wire).not.toHaveProperty('current');
    });
});

describe('presentExport', () => {
    const exportRow = {
        _id: new Types.ObjectId('64b64b64b64b64b64b64b64c'),
        createdAt: new Date('2026-01-01T00:00:00Z'),
        expiresAt: new Date('2026-01-08T00:00:00Z')
    };

    it('answers the id, the status and when it was asked for', () => {
        expect(presentExport(exportRow, 'building')).toEqual({
            id: '64b64b64b64b64b64b64b64c',
            status: 'building',
            createdAt: '2026-01-01T00:00:00.000Z',
            actions: { download: false, request: false }
        });
    });

    it('names when the file goes only once it is ready', () => {
        expect(presentExport(exportRow, 'ready')).toMatchObject({
            expiresAt: '2026-01-08T00:00:00.000Z'
        });
        expect(presentExport(exportRow, 'failed')).not.toHaveProperty('expiresAt');
    });

    it('offers the download only when ready, and a new request unless one is building', () => {
        expect(presentExport(exportRow, 'ready').actions).toEqual({
            download: true,
            request: true
        });
        expect(presentExport(exportRow, 'failed').actions).toEqual({
            download: false,
            request: true
        });
    });
});
