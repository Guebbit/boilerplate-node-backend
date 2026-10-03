/**
 * @module
 * The example module's optional capabilities, each proved on its own: the publish mail (through
 * the real `subscribe` wiring), the cover image, the data export and erasure, and the two
 * writes the `locales` port makes on this collection.
 */

import { Types } from 'mongoose';
import { setupTestDb } from '@tests/setup-test-db';
import { observePort } from '@tests/ports';
import { asReject, asSuccess } from '@tests/response';
import { callerContextAs } from '@tests/callers';
import { MISSING_ID } from '@tests/ids';
import { createUser } from '@modules/users/tests/factories';
import { emitDomainEvent, resetDomainEvents } from '@kernel/events';
import { withTransaction } from '@infrastructure/runtime/database';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { ExampleStatus } from '@types';
import * as auditPort from '@infrastructure/observability/audit';
import { exampleAuditActions } from '../../audit';
import { EXAMPLE_PUBLISHED } from '../../events';
import exampleModule from '../../module';
import { exampleRepository } from '../../repository';
import { collectPersonalData, eraseForUser } from '../../services/personal-data';
import { setCover } from '../../services';
import { createExample, fieldOf } from '../factories';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn().mockResolvedValue(undefined)
}));
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

/* Only the filesystem-touching `remove` is stubbed; `applyImageWriteback` is a pure mutation. */
jest.mock('@infrastructure/adapters/image-store', () => ({
    ...jest.requireActual('@infrastructure/adapters/image-store'),
    imageStore: { remove: jest.fn().mockResolvedValue(true) }
}));
const { imageStore } = jest.requireMock<{ imageStore: { remove: jest.Mock } }>(
    '@infrastructure/adapters/image-store'
);

jest.mock('@infrastructure/observability/audit', () => {
    const actual = jest.requireActual<typeof import('@infrastructure/observability/audit')>(
        '@infrastructure/observability/audit'
    );
    const emitAuditEvent = jest.fn();
    return {
        __esModule: true,
        ...actual,
        emitAuditEvent,
        recordAudit: (
            context: Parameters<typeof actual.recordAudit>[0],
            fields: Parameters<typeof actual.recordAudit>[1]
        ) => {
            if (!context) return;
            emitAuditEvent(actual.buildAuditEvent(context, fields));
        }
    };
});

setupTestDb();

afterEach(() => {
    resetDomainEvents();
    jest.clearAllMocks();
});

/** Wires the module's own listener to the bus, the way `registerModules` does at boot. */
const subscribe = () => exampleModule.subscribe();

describe('the publish mail', () => {
    it('mails the owner, in their language, when an example is published', async () => {
        const owner = await createUser({ email: 'ada@example.com', username: 'ada', locale: 'it' });
        subscribe();

        await emitDomainEvent(EXAMPLE_PUBLISHED, {
            exampleId: MISSING_ID,
            userId: owner.id,
            title: 'Ciao'
        });

        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
        expect(mockEnqueueEmail).toHaveBeenCalledWith(
            { to: 'ada@example.com', subject: 'Il tuo esempio è pubblicato: Ciao' },
            'example.published',
            expect.objectContaining({ greeting: 'Ciao, ada!' })
        );
    });

    it('sends nothing when the owner no longer exists', async () => {
        subscribe();

        await emitDomainEvent(EXAMPLE_PUBLISHED, {
            exampleId: MISSING_ID,
            userId: new Types.ObjectId().toString(),
            title: 'Orphan'
        });

        expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });
});

/** The three image fields an upload leaves on the request, for a cover called `name`. */
const image = (name: string) => ({
    imageUrl: `/images/${name}.jpg`,
    thumbnailUrl: `/images/${name}-t.webp`,
    pendingImageKey: undefined
});

describe('setCover', () => {
    it('stores the url and thumbnail, and audits the change', async () => {
        const owner = await createUser();
        const mine = await createExample({ userId: owner.id });
        const auditSpy = observePort(auditPort.emitAuditEvent);

        const saved = asSuccess(
            await setCover(
                String(mine._id),
                {
                    imageUrl: '/images/a.jpg',
                    thumbnailUrl: '/images/a-t.webp',
                    pendingImageKey: undefined
                },
                callerContextAs('customer', owner.id)
            )
        );

        expect(saved.data).toMatchObject({
            imageUrl: '/images/a.jpg',
            thumbnailUrl: '/images/a-t.webp'
        });
        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({ action: exampleAuditActions.EXAMPLE_COVER_CHANGED })
        );
    });

    it('deletes the cover it replaced, once the new one is saved', async () => {
        const owner = await createUser();
        const mine = await createExample({ userId: owner.id });
        const context = callerContextAs('customer', owner.id);
        await setCover(String(mine._id), image('old'), context);
        await setCover(String(mine._id), image('new'), context);

        expect(imageStore.remove).toHaveBeenCalledWith('/images/old.jpg');
        expect(imageStore.remove).not.toHaveBeenCalledWith('/images/new.jpg');
    });

    it('answers 404 for someone else’s example, and changes nothing', async () => {
        const owner = await createUser({ email: 'a@example.com' });
        const stranger = await createUser({ email: 'b@example.com' });
        const theirs = await createExample({ userId: owner.id });

        const refused = asReject(
            await setCover(
                String(theirs._id),
                { imageUrl: '/images/x.jpg', thumbnailUrl: undefined, pendingImageKey: undefined },
                callerContextAs('customer', stranger.id)
            )
        );

        expect(refused.status).toBe(404);
        expect(await fieldOf(String(theirs._id), 'imageUrl')).toBeUndefined();
    });
});

describe('personal data', () => {
    it('exports every example the subject owns, drafts included, and nobody else’s', async () => {
        const subject = await createUser({ email: 'a@example.com', username: 'ada' });
        const other = await createUser({ email: 'b@example.com', username: 'grace' });
        await createExample({ userId: subject.id, title: 'Draft' });
        await createExample({ userId: subject.id, title: 'Out', status: ExampleStatus.published });
        await createExample({ userId: other.id, title: 'Not yours' });

        const exported = await collectPersonalData({
            userId: subject.id,
            email: subject.email,
            emailVerified: true
        });

        expect(exported.map((example) => example.title).toSorted()).toEqual(['Draft', 'Out']);
        expect(exported.every((example) => example.ownerName === 'ada')).toBe(true);
    });

    it('exports an empty list, not nothing, for a subject with no examples', async () => {
        const subject = await createUser();

        expect(
            await collectPersonalData({
                userId: subject.id,
                email: subject.email,
                emailVerified: true
            })
        ).toEqual([]);
    });

    it('erases only the subject’s rows, and defers deleting the cover files until after commit', async () => {
        const subject = await createUser({ email: 'a@example.com' });
        const other = await createUser({ email: 'b@example.com' });
        const withCover = await createExample({ userId: subject.id });
        withCover.imageUrl = '/images/cover.jpg';
        await exampleRepository.save(withCover);
        await createExample({ userId: subject.id });
        const kept = await createExample({ userId: other.id });

        const afterErase = await withTransaction((session) => eraseForUser(subject.id, session));

        expect(await exampleRepository.count({ userId: new Types.ObjectId(subject.id) })).toBe(0);
        expect(await exampleRepository.findById(String(kept._id))).not.toBeNull();
        // The rows are gone with the transaction; the files are not touched until the step runs.
        expect(imageStore.remove).not.toHaveBeenCalled();
        await afterErase();
        expect(imageStore.remove).toHaveBeenCalledTimes(1);
        expect(imageStore.remove).toHaveBeenCalledWith('/images/cover.jpg');
    });
});

describe('the writes `locales` makes on this collection', () => {
    it('says whether an example exists, whoever owns it', async () => {
        const owner = await createUser();
        const mine = await createExample({ userId: owner.id });

        expect(await exampleRepository.existsById(String(mine._id))).toBe(true);
        expect(await exampleRepository.existsById(MISSING_ID)).toBe(false);
    });

    it('copies the fallback-language title onto the row without counting it as an edit', async () => {
        const owner = await createUser();
        const mine = await createExample({ userId: owner.id, title: 'Before' });
        const before = await fieldOf(String(mine._id), 'updatedAt');

        await exampleRepository.writeTranslatedFields(String(mine._id), { title: 'After' });

        expect(await fieldOf(String(mine._id), 'title')).toBe('After');
        expect(await fieldOf(String(mine._id), 'updatedAt')).toEqual(before);
    });

    it('clears a field to an empty column rather than leaving it absent', async () => {
        const owner = await createUser();
        const mine = await createExample({ userId: owner.id, title: 'Before' });

        await exampleRepository.writeTranslatedFields(String(mine._id), { title: null });

        expect(await fieldOf(String(mine._id), 'title')).toBe('');
    });

    it('moves updatedAt, the ETag, when only a translation changed', async () => {
        const owner = await createUser();
        const mine = await createExample({ userId: owner.id });
        const before = await fieldOf(String(mine._id), 'updatedAt');
        await new Promise((resolve) => setTimeout(resolve, 5));

        await exampleRepository.markEdited(String(mine._id));

        const after = await fieldOf(String(mine._id), 'updatedAt');
        expect(after?.getTime()).toBeGreaterThan(before?.getTime() ?? Infinity);
    });
});

describe('the image digest writeback', () => {
    it('writes the digested urls only when the pending key still matches, and clears it', async () => {
        const owner = await createUser();
        const mine = await createExample({ userId: owner.id });
        mine.pendingImageKey = 'key-1';
        await exampleRepository.save(mine);
        const urls = { imageUrl: '/images/done.jpg', thumbnailUrl: '/images/done-t.webp' };

        const wrote = await exampleRepository.writebackImage(String(mine._id), 'key-1', urls);

        expect(wrote).toBe(true);
        expect(await fieldOf(String(mine._id), 'pendingImageKey')).toBeUndefined();
    });

    it('ignores a stale job whose key was superseded', async () => {
        const owner = await createUser();
        const mine = await createExample({ userId: owner.id });
        mine.pendingImageKey = 'key-2';
        await exampleRepository.save(mine);

        const wrote = await exampleRepository.writebackImage(String(mine._id), 'key-1', {
            imageUrl: '/images/stale.jpg',
            thumbnailUrl: '/images/stale-t.webp'
        });

        expect(wrote).toBe(false);
        expect(await fieldOf(String(mine._id), 'imageUrl')).toBeUndefined();
    });

    it('counts a repeat of an already-applied job as held, so the live files are kept', async () => {
        const owner = await createUser();
        const mine = await createExample({ userId: owner.id });
        mine.pendingImageKey = 'key-1';
        await exampleRepository.save(mine);
        const urls = { imageUrl: '/images/done.jpg', thumbnailUrl: '/images/done-t.webp' };
        await exampleRepository.writebackImage(String(mine._id), 'key-1', urls);

        expect(await exampleRepository.writebackImage(String(mine._id), 'key-1', urls)).toBe(true);
    });
});
