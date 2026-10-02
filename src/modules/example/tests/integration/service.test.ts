/**
 * @module
 * The example service against a real database: ownership rides in the query (own, any, or
 * nothing), the status lifecycle is enforced on write, `publishedAt` stamps once, a publish is
 * announced exactly once, and the body ceiling comes from the environment.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { withEnvironment } from '@tests/environment';
import { observePort } from '@tests/ports';
import { asReject, asSuccess } from '@tests/response';
import { callerContextAs, testCallerContext } from '@tests/callers';
import { MISSING_ID } from '@tests/ids';
import { createUser } from '@modules/users/tests/factories';
import { onDomainEvent, resetDomainEvents } from '@kernel/events';
import { ExampleStatus } from '@types';
import * as auditPort from '@infrastructure/observability/audit';
import * as analyticsPort from '@infrastructure/observability/analytics';
import { exampleAuditActions } from '../../audit';
import { EXAMPLE_PUBLISHED } from '../../events';
import { exampleRepository } from '../../repository';
import { create, getById, getPublishedById, remove, search, update } from '../../services';
import { createExample, fieldOf } from '../factories';

/*
 * The audit and analytics ports are REPLACED, not spied on: `jest.spyOn` cannot redefine the
 * non-configurable getter a CommonJS namespace import exposes. See `tests/support/ports.ts`.
 */
jest.mock('@infrastructure/observability/audit', () => {
    const actual = jest.requireActual<typeof import('@infrastructure/observability/audit')>(
        '@infrastructure/observability/audit'
    );
    const emitAuditEvent = jest.fn();
    return {
        __esModule: true,
        ...actual,
        emitAuditEvent,
        // `recordAudit` closes over the real `emitAuditEvent`; reroute it through the replacement.
        recordAudit: (
            context: Parameters<typeof actual.recordAudit>[0],
            fields: Parameters<typeof actual.recordAudit>[1]
        ) => {
            if (!context) return;
            emitAuditEvent(actual.buildAuditEvent(context, fields));
        }
    };
});
jest.mock('@infrastructure/observability/analytics', () => ({
    __esModule: true,
    ...jest.requireActual('@infrastructure/observability/analytics'),
    emitAnalyticsEvent: jest.fn()
}));

setupTestDb();

afterEach(() => {
    resetDomainEvents();
    jest.clearAllMocks();
});

/** A signed-in customer with a real account row, so the owner's name can be read back. */
const aCustomer = async (username = 'ada') => {
    const user = await createUser({ username, email: `${username}@example.com` });
    return { user, context: callerContextAs('customer', user.id) };
};

/** An administrator, who holds every `examples.*` key. */
const anAdmin = async () => {
    const user = await createUser({ username: 'root', email: 'root@example.com' });
    return { user, context: callerContextAs('admin', user.id) };
};

describe('create', () => {
    it('writes a trimmed draft owned by the caller, and names the owner', async () => {
        const { user, context } = await aCustomer();

        const created = asSuccess(await create({ title: '  A title ', body: ' A body ' }, context));

        expect(created.status).toBe(201);
        expect(created.data).toMatchObject({
            title: 'A title',
            body: 'A body',
            status: ExampleStatus.draft,
            userId: user.id,
            ownerName: 'ada'
        });
        expect(created.data.publishedAt).toBeUndefined();
    });

    it('answers 401 for a caller with no identity', async () => {
        const refused = asReject(await create({ title: 'T', body: 'B' }, testCallerContext));

        expect(refused.status).toBe(401);
        expect(await exampleRepository.count()).toBe(0);
    });

    it('refuses a body over the deployment’s ceiling, and writes nothing', async () => {
        const { context } = await aCustomer();

        await withEnvironment('NODE_EXAMPLE_BODY_MAX_LENGTH', '5', async () => {
            const refused = asReject(await create({ title: 'T', body: '123456' }, context));

            expect(refused.status).toBe(422);
        });
        expect(await exampleRepository.count()).toBe(0);
    });

    it('accepts a body exactly at the ceiling', async () => {
        const { context } = await aCustomer();

        await withEnvironment('NODE_EXAMPLE_BODY_MAX_LENGTH', '5', async () => {
            asSuccess(await create({ title: 'T', body: '12345' }, context));
        });
    });

    it('audits the creation against the new example', async () => {
        const { context } = await aCustomer();
        const auditSpy = observePort(auditPort.emitAuditEvent);

        const created = asSuccess(await create({ title: 'T', body: 'B' }, context));

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: exampleAuditActions.EXAMPLE_CREATED,
                target_id: created.data.id
            })
        );
    });
});

describe('who may read what', () => {
    it('lets an owner read their own draft', async () => {
        const { user, context } = await aCustomer();
        const mine = await createExample({ userId: user.id });

        expect(await getById(String(mine._id), context)).toMatchObject({ id: String(mine._id) });
    });

    it('answers null, never a refusal, for someone else’s example', async () => {
        const { user } = await aCustomer('ada');
        const { context: other } = await aCustomer('grace');
        const mine = await createExample({ userId: user.id });

        expect(await getById(String(mine._id), other)).toBeNull();
    });

    it('lets a caller holding examples.any.read read anyone’s', async () => {
        const { user } = await aCustomer();
        const { context: admin } = await anAdmin();
        const theirs = await createExample({ userId: user.id });

        expect(await getById(String(theirs._id), admin)).toMatchObject({ ownerName: 'ada' });
    });

    it('answers null for an id nothing holds', async () => {
        const { context } = await aCustomer();

        expect(await getById(MISSING_ID, context)).toBeNull();
    });
});

describe('getPublishedById', () => {
    it('reads a published example for anyone', async () => {
        const { user } = await aCustomer();
        const published = await createExample({ userId: user.id, status: ExampleStatus.published });

        expect(await getPublishedById(String(published._id))).toMatchObject({
            status: ExampleStatus.published
        });
    });

    it.each([ExampleStatus.draft, ExampleStatus.archived])(
        'answers null for a %s one, the same as a missing id',
        async (status) => {
            const { user } = await aCustomer();
            const hidden = await createExample({ userId: user.id, status });

            expect(await getPublishedById(String(hidden._id))).toBeNull();
            expect(await getPublishedById(MISSING_ID)).toBeNull();
        }
    );
});

describe('search', () => {
    it('lists only the caller’s own examples', async () => {
        const { user, context } = await aCustomer('ada');
        const { user: other } = await aCustomer('grace');
        await createExample({ userId: user.id, title: 'Mine' });
        await createExample({ userId: other.id, title: 'Theirs' });

        const { items, meta } = await search({}, context);

        expect(items.map((item) => item.title)).toEqual(['Mine']);
        expect(meta.totalItems).toBe(1);
    });

    it('lists everyone’s for a caller holding examples.any.read, each with its own owner name', async () => {
        const { user } = await aCustomer('ada');
        const { user: other } = await aCustomer('grace');
        const { context: admin } = await anAdmin();
        await createExample({ userId: user.id, title: 'One' });
        await createExample({ userId: other.id, title: 'Two' });

        const { items } = await search({ sort: ['title'] }, admin);

        expect(items.map((item) => [item.title, item.ownerName])).toEqual([
            ['One', 'ada'],
            ['Two', 'grace']
        ]);
    });

    it('narrows by status', async () => {
        const { user, context } = await aCustomer();
        await createExample({ userId: user.id, title: 'Draft one' });
        await createExample({ userId: user.id, title: 'Out', status: ExampleStatus.published });

        const { items } = await search({ status: ExampleStatus.published }, context);

        expect(items.map((item) => item.title)).toEqual(['Out']);
    });

    it('finds by text in the title or the body', async () => {
        const { user, context } = await aCustomer();
        await createExample({ userId: user.id, title: 'Puppies', body: 'x' });
        await createExample({ userId: user.id, title: 'Kittens', body: 'about puppies too' });
        await createExample({ userId: user.id, title: 'Birds', body: 'y' });

        const { items } = await search({ text: 'puppies', sort: ['title'] }, context);

        expect(items.map((item) => item.title)).toEqual(['Kittens', 'Puppies']);
    });

    it('lists nothing for a caller who holds no examples key at all', async () => {
        const { user } = await aCustomer();
        await createExample({ userId: user.id });

        const { items } = await search({}, testCallerContext);

        expect(items).toEqual([]);
    });
});

describe('update', () => {
    it('edits the caller’s own example and trims what it writes', async () => {
        const { user, context } = await aCustomer();
        const mine = await createExample({ userId: user.id });

        const saved = asSuccess(
            await update(String(mine._id), { title: ' New ', body: ' Words ' }, context)
        );

        expect(saved.data).toMatchObject({
            title: 'New',
            body: 'Words',
            status: ExampleStatus.draft
        });
    });

    it('answers 404 for someone else’s example, and leaves it untouched', async () => {
        const { user } = await aCustomer('ada');
        const { context: other } = await aCustomer('grace');
        const theirs = await createExample({ userId: user.id, title: 'Theirs' });

        const refused = asReject(await update(String(theirs._id), { title: 'Mine now' }, other));

        expect(refused.status).toBe(404);
        expect(await fieldOf(String(theirs._id), 'title')).toBe('Theirs');
    });

    it('lets examples.any.update edit anyone’s', async () => {
        const { user } = await aCustomer();
        const { context: admin } = await anAdmin();
        const theirs = await createExample({ userId: user.id });

        asSuccess(await update(String(theirs._id), { title: 'Edited by staff' }, admin));
    });

    it('answers 404 for an id nothing holds', async () => {
        const { context } = await aCustomer();

        expect(asReject(await update(MISSING_ID, { title: 'x' }, context)).status).toBe(404);
    });

    it('refuses an illegal status move with 422, and keeps the old status', async () => {
        const { user, context } = await aCustomer();
        const archived = await createExample({ userId: user.id, status: ExampleStatus.archived });

        const refused = asReject(
            await update(String(archived._id), { status: ExampleStatus.published }, context)
        );

        expect(refused.status).toBe(422);
        expect(await fieldOf(String(archived._id), 'status')).toBe(ExampleStatus.archived);
    });

    it('refuses a body over the ceiling', async () => {
        const { user, context } = await aCustomer();
        const mine = await createExample({ userId: user.id });

        await withEnvironment('NODE_EXAMPLE_BODY_MAX_LENGTH', '3', async () => {
            expect(asReject(await update(String(mine._id), { body: 'abcd' }, context)).status).toBe(
                422
            );
        });
    });

    it('accepts a status restated unchanged, so a PUT of the same representation succeeds', async () => {
        const { user, context } = await aCustomer();
        const mine = await createExample({ userId: user.id });

        asSuccess(await update(String(mine._id), { status: ExampleStatus.draft }, context));
    });

    it('audits the edit with the resulting status', async () => {
        const { user, context } = await aCustomer();
        const mine = await createExample({ userId: user.id });
        const auditSpy = observePort(auditPort.emitAuditEvent);

        await update(String(mine._id), { status: ExampleStatus.archived }, context);

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: exampleAuditActions.EXAMPLE_UPDATED,
                metadata: { status: ExampleStatus.archived }
            })
        );
    });
});

/** Collects every `example.published` event the bus carries. */
const collectPublished = () => {
    const seen: unknown[] = [];
    onDomainEvent(EXAMPLE_PUBLISHED, (payload) => {
        seen.push(payload);
    });
    return seen;
};

describe('publishing', () => {
    it('stamps publishedAt and announces the publish once, with the owner and the title', async () => {
        const { user, context } = await aCustomer();
        const seen = collectPublished();
        const mine = await createExample({ userId: user.id, title: 'Out soon' });

        const saved = asSuccess(
            await update(String(mine._id), { status: ExampleStatus.published }, context)
        );
        await new Promise((resolve) => setImmediate(resolve));

        expect(saved.data.publishedAt).toBeDefined();
        expect(seen).toEqual([{ exampleId: String(mine._id), userId: user.id, title: 'Out soon' }]);
    });

    it('records the publish as an analytics event', async () => {
        const { user, context } = await aCustomer();
        const analyticsSpy = observePort(analyticsPort.emitAnalyticsEvent);
        const mine = await createExample({ userId: user.id });

        await update(String(mine._id), { status: ExampleStatus.published }, context);

        expect(analyticsSpy).toHaveBeenCalledWith(
            expect.objectContaining({ event: 'example_published' })
        );
    });

    it('announces nothing when a published example is saved again', async () => {
        const { user, context } = await aCustomer();
        const seen = collectPublished();
        const published = await createExample({
            userId: user.id,
            status: ExampleStatus.published,
            publishedAt: new Date('2026-01-01T00:00:00Z')
        });

        await update(String(published._id), { title: 'Reworded' }, context);
        await new Promise((resolve) => setImmediate(resolve));

        expect(seen).toEqual([]);
    });

    it('announces again after an archive and a restore, but keeps the original publishedAt', async () => {
        const { user, context } = await aCustomer();
        const seen = collectPublished();
        const mine = await createExample({ userId: user.id });
        const id = String(mine._id);

        const first = asSuccess(await update(id, { status: ExampleStatus.published }, context));
        await update(id, { status: ExampleStatus.archived }, context);
        await update(id, { status: ExampleStatus.draft }, context);
        const again = asSuccess(await update(id, { status: ExampleStatus.published }, context));
        await new Promise((resolve) => setImmediate(resolve));

        expect(seen).toHaveLength(2);
        expect(again.data.publishedAt).toEqual(first.data.publishedAt);
    });
});

describe('remove', () => {
    it('deletes the caller’s own example', async () => {
        const { user, context } = await aCustomer();
        const mine = await createExample({ userId: user.id });

        asSuccess(await remove(String(mine._id), context));

        expect(await exampleRepository.findById(String(mine._id))).toBeNull();
    });

    it('answers 404 for someone else’s, and keeps it', async () => {
        const { user } = await aCustomer('ada');
        const { context: other } = await aCustomer('grace');
        const theirs = await createExample({ userId: user.id });

        expect(asReject(await remove(String(theirs._id), other)).status).toBe(404);
        expect(await exampleRepository.findById(String(theirs._id))).not.toBeNull();
    });

    it('lets examples.any.delete remove anyone’s, and audits it', async () => {
        const { user } = await aCustomer();
        const { context: admin } = await anAdmin();
        const theirs = await createExample({ userId: user.id });
        const auditSpy = observePort(auditPort.emitAuditEvent);

        asSuccess(await remove(String(theirs._id), admin));

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: exampleAuditActions.EXAMPLE_DELETED,
                target_id: String(theirs._id)
            })
        );
    });
});
