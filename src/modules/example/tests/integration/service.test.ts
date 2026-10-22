/**
 * @module
 * The example service against a real database: ownership rides in the query (own, any, or
 * nothing), the status lifecycle is enforced on write, `publishedAt` stamps once, a publish is
 * announced exactly once, and the body ceiling comes from the environment.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { withEnvironmentOverrides } from '@tests/environment';
import { observePort } from '@tests/ports';
import { asReject, asSuccess } from '@tests/response';
import { callerContextAs, testCallerContext } from '@tests/callers';
import { MISSING_ID } from '@tests/ids';
import { createUser } from '@modules/users/tests/factories';
import { markDomainEventsWired, onDomainEvent, resetDomainEvents } from '@kernel/events';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import { ExampleStatus } from '@types';
import * as auditPort from '@infrastructure/observability/audit';
import * as analyticsPort from '@infrastructure/observability/analytics';
import { exampleAuditActions } from '../../audit';
import { EXAMPLE_PUBLISHED } from '../../events';
import { exampleRepository } from '../../repository';
import { exampleService } from '../../services';
import { createExample, fieldOf } from '../factories';

/*
 * The audit and analytics ports are REPLACED, not spied on: `jest.spyOn` cannot redefine the
 * non-configurable getter a CommonJS namespace import exposes. See `tests/support/ports.ts`.
 */
jest.mock('@infrastructure/observability/audit', () =>
    jest.requireActual<typeof import('@tests/ports')>('@tests/ports').auditPortMock()
);
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
    return { user, context: callerContextAs('editor', user.id) };
};

/** An administrator, who holds every `examples.*` key. */
const anAdmin = async () => {
    const user = await createUser({ username: 'root', email: 'root@example.com' });
    return { user, context: callerContextAs('admin', user.id) };
};

/** A second administrator, holding the role in the database as the rank rule reads it. */
const anotherAdmin = () => createUser({ username: 'peer', email: 'peer@example.com' }, 'admin');

describe('create', () => {
    it('writes a trimmed draft owned by the caller, and names the owner', async () => {
        const { user, context } = await aCustomer();

        const created = asSuccess(
            await exampleService.create({ title: '  A title ', body: ' A body ' }, context)
        );

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
        const refused = asReject(
            await exampleService.create({ title: 'T', body: 'B' }, testCallerContext)
        );

        expect(refused.status).toBe(401);
        expect(await exampleRepository.count()).toBe(0);
    });

    it('refuses a body over the deployment’s ceiling, and writes nothing', async () => {
        const { context } = await aCustomer();

        await withEnvironmentOverrides({ NODE_EXAMPLE_BODY_MAX_LENGTH: '5' }, async () => {
            const refused = asReject(
                await exampleService.create({ title: 'T', body: '123456' }, context)
            );

            expect(refused.status).toBe(422);
        });
        expect(await exampleRepository.count()).toBe(0);
    });

    it('accepts a body exactly at the ceiling', async () => {
        const { context } = await aCustomer();

        await withEnvironmentOverrides({ NODE_EXAMPLE_BODY_MAX_LENGTH: '5' }, async () => {
            asSuccess(await exampleService.create({ title: 'T', body: '12345' }, context));
        });
    });

    it('audits the creation against the new example', async () => {
        const { context } = await aCustomer();
        const auditSpy = observePort(auditPort.emitAuditEvent);

        const created = asSuccess(await exampleService.create({ title: 'T', body: 'B' }, context));

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: exampleAuditActions.EXAMPLE_CREATED,
                targetId: created.data.id
            })
        );
    });
});

describe('who may read what', () => {
    it('lets an owner read their own draft', async () => {
        const { user, context } = await aCustomer();
        const mine = await createExample({ userId: user.id });

        expect(await exampleService.getById(String(mine._id), context)).toMatchObject({
            id: String(mine._id)
        });
    });

    it('answers null, never a refusal, for someone else’s example', async () => {
        const { user } = await aCustomer('ada');
        const { context: other } = await aCustomer('grace');
        const mine = await createExample({ userId: user.id });

        expect(await exampleService.getById(String(mine._id), other)).toBeNull();
    });

    it('lets a caller holding display:Example read anyone’s', async () => {
        const { user } = await aCustomer();
        const { context: admin } = await anAdmin();
        const theirs = await createExample({ userId: user.id });

        expect(await exampleService.getById(String(theirs._id), admin)).toMatchObject({
            ownerName: 'ada'
        });
    });

    it('answers null for an id nothing holds', async () => {
        const { context } = await aCustomer();

        expect(await exampleService.getById(MISSING_ID, context)).toBeNull();
    });
});

describe('getPublishedById', () => {
    it('reads a published example for anyone', async () => {
        const { user } = await aCustomer();
        const published = await createExample({ userId: user.id, status: ExampleStatus.published });

        expect(await exampleService.getPublishedById(String(published._id))).toMatchObject({
            status: ExampleStatus.published
        });
    });

    it.each([ExampleStatus.draft, ExampleStatus.archived])(
        'answers null for a %s one, the same as a missing id',
        async (status) => {
            const { user } = await aCustomer();
            const hidden = await createExample({ userId: user.id, status });

            expect(await exampleService.getPublishedById(String(hidden._id))).toBeNull();
            expect(await exampleService.getPublishedById(MISSING_ID)).toBeNull();
        }
    );
});

describe('search', () => {
    it('lists only the caller’s own examples', async () => {
        const { user, context } = await aCustomer('ada');
        const { user: other } = await aCustomer('grace');
        await createExample({ userId: user.id, title: 'Mine' });
        await createExample({ userId: other.id, title: 'Theirs' });

        const { items, meta } = await exampleService.search({}, context);

        expect(items.map((item) => item.title)).toEqual(['Mine']);
        expect(meta.totalItems).toBe(1);
    });

    it('lists everyone’s for a caller holding display:Example, each with its own owner name', async () => {
        const { user } = await aCustomer('ada');
        const { user: other } = await aCustomer('grace');
        const { context: admin } = await anAdmin();
        await createExample({ userId: user.id, title: 'One' });
        await createExample({ userId: other.id, title: 'Two' });

        const { items } = await exampleService.search({ sort: ['title'] }, admin);

        expect(items.map((item) => [item.title, item.ownerName])).toEqual([
            ['One', 'ada'],
            ['Two', 'grace']
        ]);
    });

    it('narrows by status', async () => {
        const { user, context } = await aCustomer();
        await createExample({ userId: user.id, title: 'Draft one' });
        await createExample({ userId: user.id, title: 'Out', status: ExampleStatus.published });

        const { items } = await exampleService.search({ status: ExampleStatus.published }, context);

        expect(items.map((item) => item.title)).toEqual(['Out']);
    });

    it('finds by text in the title or the body', async () => {
        const { user, context } = await aCustomer();
        await createExample({ userId: user.id, title: 'Puppies', body: 'x' });
        await createExample({ userId: user.id, title: 'Kittens', body: 'about puppies too' });
        await createExample({ userId: user.id, title: 'Birds', body: 'y' });

        const { items } = await exampleService.search(
            { text: 'puppies', sort: ['title'] },
            context
        );

        expect(items.map((item) => item.title)).toEqual(['Kittens', 'Puppies']);
    });

    it('lists nothing for a caller who holds no examples key at all', async () => {
        const { user } = await aCustomer();
        await createExample({ userId: user.id });

        const { items } = await exampleService.search({}, testCallerContext);

        expect(items).toEqual([]);
    });
});

describe('updateById', () => {
    it('edits the caller’s own example and trims what it writes', async () => {
        const { user, context } = await aCustomer();
        const mine = await createExample({ userId: user.id });

        const saved = asSuccess(
            await exampleService.updateById(
                String(mine._id),
                { title: ' New ', body: ' Words ' },
                context
            )
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

        const refused = asReject(
            await exampleService.updateById(String(theirs._id), { title: 'Mine now' }, other)
        );

        expect(refused.status).toBe(404);
        expect(await fieldOf(String(theirs._id), 'title')).toBe('Theirs');
    });

    it('lets admin:Example edit anyone’s', async () => {
        const { user } = await aCustomer();
        const { context: admin } = await anAdmin();
        const theirs = await createExample({ userId: user.id });

        asSuccess(
            await exampleService.updateById(String(theirs._id), { title: 'Edited by staff' }, admin)
        );

        expect(await fieldOf(String(theirs._id), 'title')).toBe('Edited by staff');
    });

    it('lets an administrator edit a fellow administrator’s example: nothing ranks, the key is the rule', async () => {
        const peer = await anotherAdmin();
        const { context: admin } = await anAdmin();
        const theirs = await createExample({ userId: peer.id, title: 'Theirs' });

        asSuccess(
            await exampleService.updateById(
                String(theirs._id),
                { title: 'Edited by a peer' },
                admin
            )
        );

        expect(await fieldOf(String(theirs._id), 'title')).toBe('Edited by a peer');
    });

    it('answers 404 for an id nothing holds', async () => {
        const { context } = await aCustomer();

        expect(
            asReject(await exampleService.updateById(MISSING_ID, { title: 'x' }, context)).status
        ).toBe(404);
    });

    it('refuses a body over the ceiling', async () => {
        const { user, context } = await aCustomer();
        const mine = await createExample({ userId: user.id });

        await withEnvironmentOverrides({ NODE_EXAMPLE_BODY_MAX_LENGTH: '3' }, async () => {
            expect(
                asReject(
                    await exampleService.updateById(String(mine._id), { body: 'abcd' }, context)
                ).status
            ).toBe(422);
        });
    });

    it('edits the fields and leaves the status alone, announcing nothing', async () => {
        const { user, context } = await aCustomer();
        const seen = collectPublished();
        const mine = await createExample({ userId: user.id });

        asSuccess(
            await exampleService.updateById(String(mine._id), { title: 'Reworded' }, context)
        );
        await settleOutboxNudges();

        expect(await fieldOf(String(mine._id), 'status')).toBe(ExampleStatus.draft);
        expect(seen).toEqual([]);
    });

    it('audits the edit', async () => {
        const { user, context } = await aCustomer();
        const mine = await createExample({ userId: user.id });
        const auditSpy = observePort(auditPort.emitAuditEvent);

        await exampleService.updateById(String(mine._id), { title: 'Reworded' }, context);

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({ action: exampleAuditActions.EXAMPLE_UPDATED })
        );
    });
});

/** Collects every `example.published` event the bus carries. */
const collectPublished = () => {
    // The relay only dispatches in a process where modules have subscribed.
    markDomainEventsWired();
    const seen: unknown[] = [];
    onDomainEvent(EXAMPLE_PUBLISHED, (payload) => {
        seen.push(payload);
    });
    return seen;
};

describe('publishing, through the transition door', () => {
    it('stamps publishedAt and announces the publish once, with the owner and the title', async () => {
        const { user, context } = await aCustomer();
        const seen = collectPublished();
        const mine = await createExample({ userId: user.id, title: 'Out soon' });

        const saved = asSuccess(
            await exampleService.transitionById(String(mine._id), ExampleStatus.published, context)
        );
        await settleOutboxNudges();

        expect(saved.data.publishedAt).toBeDefined();
        expect(seen).toEqual([{ exampleId: String(mine._id), userId: user.id, title: 'Out soon' }]);
    });

    it('writes exactly one outbox row for one publish, keyed by the example', async () => {
        const { user, context } = await aCustomer();
        const mine = await createExample({ userId: user.id });

        await exampleService.transitionById(String(mine._id), ExampleStatus.published, context);
        await settleOutboxNudges();

        const rows = await outboxEventModel.find({ name: EXAMPLE_PUBLISHED }).lean().exec();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ aggregateId: String(mine._id) });
    });

    it('announces once, and refuses the loser, when two requests publish the same draft', async () => {
        const { user, context } = await aCustomer();
        const seen = collectPublished();
        const mine = await createExample({ userId: user.id, title: 'Race' });
        const publish = () =>
            exampleService.transitionById(String(mine._id), ExampleStatus.published, context);

        const settled = await Promise.all([publish(), publish()]);
        await settleOutboxNudges();

        // Exactly one racer lands; the other is told the move is no longer open.
        expect(settled.map(({ status }) => status).toSorted()).toEqual([200, 409]);
        expect(await outboxEventModel.countDocuments({ name: EXAMPLE_PUBLISHED })).toBe(1);
        expect(seen).toHaveLength(1);
    });

    it('records the publish as an analytics event', async () => {
        const { user, context } = await aCustomer();
        const analyticsSpy = observePort(analyticsPort.emitAnalyticsEvent);
        const mine = await createExample({ userId: user.id });

        await exampleService.transitionById(String(mine._id), ExampleStatus.published, context);

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

        await exampleService.updateById(String(published._id), { title: 'Reworded' }, context);
        await settleOutboxNudges();

        expect(seen).toEqual([]);
    });

    it('announces again after an archive and a restore, but keeps the original publishedAt', async () => {
        const { user, context } = await aCustomer();
        const seen = collectPublished();
        const mine = await createExample({ userId: user.id });
        const id = String(mine._id);

        const first = asSuccess(
            await exampleService.transitionById(id, ExampleStatus.published, context)
        );
        await exampleService.transitionById(id, ExampleStatus.archived, context);
        await exampleService.transitionById(id, ExampleStatus.draft, context);
        const again = asSuccess(
            await exampleService.transitionById(id, ExampleStatus.published, context)
        );
        await settleOutboxNudges();

        expect(seen).toHaveLength(2);
        expect(again.data.publishedAt).toEqual(first.data.publishedAt);
    });
});

describe('transitionById', () => {
    it('refuses a move the lifecycle does not have with 409, details and no write', async () => {
        const { user, context } = await aCustomer();
        const archived = await createExample({ userId: user.id, status: ExampleStatus.archived });

        const refused = asReject(
            await exampleService.transitionById(
                String(archived._id),
                ExampleStatus.published,
                context
            )
        );

        expect(refused.status).toBe(409);
        expect(refused.errors[0]).toMatchObject({
            code: 'EXAMPLE_TRANSITION_NOT_ALLOWED',
            details: { from: ExampleStatus.archived, to: ExampleStatus.published }
        });
        expect(await fieldOf(String(archived._id), 'status')).toBe(ExampleStatus.archived);
    });

    it('refuses staying where it is: that is not a move', async () => {
        const { user, context } = await aCustomer();
        const mine = await createExample({ userId: user.id });

        expect(
            asReject(
                await exampleService.transitionById(String(mine._id), ExampleStatus.draft, context)
            ).status
        ).toBe(409);
    });

    it('answers 404, not 409, for someone else’s example, so an id reveals nothing', async () => {
        const { context } = await aCustomer();
        const stranger = await createUser({ username: 'bob', email: 'bob@example.com' });
        const theirs = await createExample({ userId: stranger.id });

        expect(
            asReject(
                await exampleService.transitionById(
                    String(theirs._id),
                    ExampleStatus.published,
                    context
                )
            ).status
        ).toBe(404);
        expect(
            asReject(
                await exampleService.transitionById(MISSING_ID, ExampleStatus.published, context)
            ).status
        ).toBe(404);
    });

    it('lets an administrator move anyone’s example', async () => {
        const { context: admin } = await anAdmin();
        const owner = await createUser({ username: 'bob', email: 'bob@example.com' });
        const theirs = await createExample({ userId: owner.id });

        const moved = asSuccess(
            await exampleService.transitionById(String(theirs._id), ExampleStatus.archived, admin)
        );

        expect(moved.data.status).toBe(ExampleStatus.archived);
    });

    it('audits the move with where it came from and went to', async () => {
        const { user, context } = await aCustomer();
        const mine = await createExample({ userId: user.id });
        const auditSpy = observePort(auditPort.emitAuditEvent);

        await exampleService.transitionById(String(mine._id), ExampleStatus.archived, context);

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: exampleAuditActions.EXAMPLE_STATUS_CHANGED,
                metadata: { from: ExampleStatus.draft, to: ExampleStatus.archived }
            })
        );
    });

    it('answers with the actions this caller has on the moved example', async () => {
        const { user, context } = await aCustomer();
        const mine = await createExample({ userId: user.id });

        const moved = asSuccess(
            await exampleService.transitionById(String(mine._id), ExampleStatus.published, context)
        );

        expect(moved.data.actions).toEqual({
            transitions: [ExampleStatus.archived],
            update: true,
            delete: true
        });
    });
});

describe('actions on rows', () => {
    it('gives a display-only caller no moves and no edits on someone else’s example', async () => {
        const moderator = await createUser({ username: 'mod', email: 'mod@example.com' });
        const owner = await createUser({ username: 'bob', email: 'bob@example.com' });
        const theirs = await createExample({ userId: owner.id });

        const read = await exampleService.getById(
            String(theirs._id),
            callerContextAs('moderator', moderator.id)
        );

        expect(read?.actions).toEqual({ transitions: [], update: false, delete: false });
    });

    it('gives the author the moves from the current status, and the public read none', async () => {
        const { user, context } = await aCustomer();
        const mine = await createExample({
            userId: user.id,
            status: ExampleStatus.published,
            publishedAt: new Date('2026-01-01T00:00:00Z')
        });

        const own = await exampleService.getById(String(mine._id), context);
        const publicRead = await exampleService.getPublishedById(String(mine._id));

        expect(own?.actions).toEqual({
            transitions: [ExampleStatus.archived],
            update: true,
            delete: true
        });
        expect(publicRead?.actions).toBeUndefined();
    });

    it('puts the actions on every row of a search', async () => {
        const { user, context } = await aCustomer();
        await createExample({ userId: user.id });

        const page = await exampleService.search({}, context);

        expect(page.items[0]?.actions).toEqual({
            transitions: [ExampleStatus.published, ExampleStatus.archived],
            update: true,
            delete: true
        });
    });
});

describe('removeById', () => {
    it('deletes the caller’s own example', async () => {
        const { user, context } = await aCustomer();
        const mine = await createExample({ userId: user.id });

        asSuccess(await exampleService.removeById(String(mine._id), context));

        expect(await exampleRepository.findById(String(mine._id))).toBeNull();
    });

    it('answers 404 for someone else’s, and keeps it', async () => {
        const { user } = await aCustomer('ada');
        const { context: other } = await aCustomer('grace');
        const theirs = await createExample({ userId: user.id });

        expect(asReject(await exampleService.removeById(String(theirs._id), other)).status).toBe(
            404
        );
        expect(await exampleRepository.findById(String(theirs._id))).not.toBeNull();
    });

    it('lets an administrator delete a fellow administrator’s example', async () => {
        const peer = await anotherAdmin();
        const { context: admin } = await anAdmin();
        const theirs = await createExample({ userId: peer.id });

        asSuccess(await exampleService.removeById(String(theirs._id), admin));

        expect(await exampleRepository.findById(String(theirs._id))).toBeNull();
    });

    it('lets admin:Example remove anyone’s, and audits it', async () => {
        const { user } = await aCustomer();
        const { context: admin } = await anAdmin();
        const theirs = await createExample({ userId: user.id });
        const auditSpy = observePort(auditPort.emitAuditEvent);

        asSuccess(await exampleService.removeById(String(theirs._id), admin));

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: exampleAuditActions.EXAMPLE_DELETED,
                targetId: String(theirs._id)
            })
        );
    });
});
