/**
 * @module
 * Integration tests for the feedback request service. Pins two behaviours: create normalises
 * (lowercased email, trimmed fields, blank `name` → `undefined`); and `respondedAt` stamps once, so re-resolving an
 * already-resolved item never moves it. Also covers the honeypot disposition and `removeById`.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext } from '@tests/callers';
import { observePort } from '@tests/ports';
import { feedbackRequestService } from '@modules/feedback/service';
import { feedbackRequestRepository } from '@modules/feedback/repository';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import * as auditPort from '@infrastructure/observability/audit';
import { feedbackAuditActions } from '@modules/feedback/audit';
import { FeedbackRequestStatus } from '@types';
import { asReject, asSuccess } from '@tests/response';
import { MISSING_ID } from '@tests/ids';
import { setEnvironment } from '@tests/environment';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn().mockResolvedValue(undefined)
}));
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

/* Replaced for the same reason `orders/tests/integration/cancel.test.ts` replaces it — see
 * `tests/support/ports.ts`. */
jest.mock('@infrastructure/observability/audit', () =>
    jest.requireActual<typeof import('@tests/ports')>('@tests/ports').auditPortMock()
);

setupTestDb();

/*
 * `notifyMailbox()` reads `NODE_CONTACT_NOTIFY_EMAIL` from the environment at call time. `.env`
 * supplies it via `dotenv/config` in `src/app.ts`, which a service-level suite never imports — so
 * without this the honeypot tests below would pass for the wrong reason (nothing configured to
 * notify, rather than the honeypot suppressing the notification).
 */
beforeEach(() => {
    setEnvironment({ NODE_CONTACT_NOTIFY_EMAIL: 'admin@example.com' });
});
afterEach(() => jest.clearAllMocks());

/** A valid creation payload; overrides let each test vary one field at a time. */
const makePayload = (overrides: Record<string, string> = {}) => ({
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    subject: 'Broken checkout',
    message: 'The cart total is wrong.',
    ...overrides
});

describe('create', () => {
    it('stores a new request with status "new"', async () => {
        const feedback = await feedbackRequestService.create(makePayload());

        // Every request starts in the same state regardless of what a client sent — the status
        // field is admin-controlled, not caller-controlled.
        expect(feedback.status).toBe(FeedbackRequestStatus.new);
        expect(feedback.subject).toBe('Broken checkout');
    });

    it('lowercases the email so the same address is one identity', async () => {
        const feedback = await feedbackRequestService.create(
            makePayload({ email: 'Ada@Example.COM' })
        );

        expect(feedback.email).toBe('ada@example.com');
    });

    it('trims surrounding whitespace from every text field', async () => {
        const feedback = await feedbackRequestService.create(
            makePayload({
                name: '  Ada Lovelace  ',
                email: '  ada@example.com  ',
                subject: '  Broken checkout  ',
                message: '  The cart total is wrong.  '
            })
        );

        expect(feedback.name).toBe('Ada Lovelace');
        expect(feedback.email).toBe('ada@example.com');
        expect(feedback.subject).toBe('Broken checkout');
        expect(feedback.message).toBe('The cart total is wrong.');
    });

    it('treats a blank name as absent rather than empty', async () => {
        // `|| undefined` — the field is optional, and '' would render as an empty author line in
        // any admin view instead of falling back to the email.
        const feedback = await feedbackRequestService.create(makePayload({ name: '   ' }));

        expect(feedback.name).toBeUndefined();
    });

    it('keeps a name that is only whitespace-padded', async () => {
        const feedback = await feedbackRequestService.create(makePayload({ name: ' A ' }));

        expect(feedback.name).toBe('A');
    });
});

describe('create — the operator notification', () => {
    it('files a request that names nobody', async () => {
        const { name: _omitted, ...withoutName } = makePayload();

        const feedback = await feedbackRequestService.create(withoutName);

        expect(feedback.name).toBeUndefined();
        expect(feedback.email).toBe('ada@example.com');
    });

    it('goes to the configured mailbox, with the ticket’s own words and the moment it was filed', async () => {
        const feedback = await feedbackRequestService.create(makePayload());

        const [envelope, template, data] = mockEnqueueEmail.mock.calls[0];
        expect(envelope).toMatchObject({ to: 'admin@example.com' });
        expect(envelope.subject).toContain('Broken checkout');
        expect(template).toBe('feedback.contact');
        expect(data).toMatchObject({
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            subject: 'Broken checkout',
            message: 'The cart total is wrong.',
            createdAt: feedback.createdAt?.toISOString()
        });
    });

    it('sends nothing when no mailbox is configured at all', async () => {
        setEnvironment({ NODE_CONTACT_NOTIFY_EMAIL: undefined, NODE_SMTP_SENDER: undefined });

        const feedback = await feedbackRequestService.create(makePayload());

        expect(feedback.status).toBe(FeedbackRequestStatus.new);
        expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });
});

describe('create — honeypot', () => {
    it('sends the operator notification when the honeypot is empty', async () => {
        await feedbackRequestService.create(makePayload());

        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
    });

    it('writes a suspected-spam submission as status "spam" and sends no notification', async () => {
        const feedback = await feedbackRequestService.create(
            makePayload({ website: 'https://spammer.example' })
        );

        expect(feedback.status).toBe(FeedbackRequestStatus.spam);
        expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });

    it('treats a whitespace-only honeypot as empty, same as a real client leaves it', async () => {
        const feedback = await feedbackRequestService.create(makePayload({ website: '   ' }));

        expect(feedback.status).toBe(FeedbackRequestStatus.new);
        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
    });

    it('never persists or returns the honeypot field itself', async () => {
        const feedback = await feedbackRequestService.create(
            makePayload({ website: 'https://spammer.example' })
        );

        const serialized = feedback.toJSON() as Record<string, unknown>;
        expect(serialized).not.toHaveProperty('website');

        const reloaded = await feedbackRequestRepository.findByIdRaw(String(feedback._id));
        expect(reloaded).not.toHaveProperty('website');
    });
});

describe('create — disposable-email policy', () => {
    // Every anti-automation rung must be provably off by default.
    it('is off by default — a known disposable domain still notifies as normal', async () => {
        setEnvironment({ NODE_ANTIBOT_EMAIL_POLICY: undefined });

        const feedback = await feedbackRequestService.create(
            makePayload({ email: 'someone@mailinator.com' })
        );

        expect(feedback.status).toBe(FeedbackRequestStatus.new);
        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
    });

    it('files a disposable-domain submission as spam, same as the honeypot, with a 201-shaped result', async () => {
        setEnvironment({ NODE_ANTIBOT_EMAIL_POLICY: 'disposable' });

        const feedback = await feedbackRequestService.create(
            makePayload({ email: 'someone@mailinator.com' })
        );

        // Filed and returned exactly like the honeypot catches a bot: no visible refusal that
        // would tell a spam script which signal caught it.
        expect(feedback.status).toBe(FeedbackRequestStatus.spam);
        expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });
});

/** Seeds a small, deliberately varied corpus. */
const seed = async () => {
    await feedbackRequestService.create(
        makePayload({ email: 'ada@example.com', subject: 'Checkout bug' })
    );
    await feedbackRequestService.create(
        makePayload({ email: 'grace@example.com', subject: 'Login trouble' })
    );
    const third = await feedbackRequestService.create(
        makePayload({ email: 'alan@example.com', subject: 'Feature idea' })
    );
    third.status = FeedbackRequestStatus.resolved;
    await feedbackRequestRepository.save(third);
};

describe('search', () => {
    it('returns every request when no filter is given', async () => {
        await seed();

        const { items, meta } = await feedbackRequestService.search();

        expect(items).toHaveLength(3);
        expect(meta.totalItems).toBe(3);
    });

    it('filters by status', async () => {
        await seed();

        const { items } = await feedbackRequestService.search({ status: 'resolved' });

        expect(items).toHaveLength(1);
        expect(items[0].email).toBe('alan@example.com');
    });

    it('filters by email fragment', async () => {
        await seed();

        const { items } = await feedbackRequestService.search({ email: 'grace' });

        expect(items).toHaveLength(1);
        expect(items[0].email).toBe('grace@example.com');
    });

    it('searches free text across name, subject and message', async () => {
        await seed();

        const { items } = await feedbackRequestService.search({ text: 'Login' });

        expect(items).toHaveLength(1);
        expect(items[0].subject).toBe('Login trouble');
    });

    it('paginates and reports coherent meta', async () => {
        await seed();

        const { items, meta } = await feedbackRequestService.search({ page: 1, pageSize: 2 });

        expect(items).toHaveLength(2);
        // The three meta fields must agree with each other and with the page actually returned;
        // a totalPages computed from the page size rather than the total is a classic off-by-one.
        expect(meta).toMatchObject({ page: 1, pageSize: 2, totalItems: 3, totalPages: 2 });
    });
});

/** The ticket as storage holds it now — the service answers a copy, not the instance a test built. */
const reload = (feedback: { _id: unknown }) =>
    feedbackRequestRepository.findById(String(feedback._id)).then((found) => found!);

describe('updateStatusById — the patch', () => {
    it('applies a new status', async () => {
        const feedback = await feedbackRequestService.create(makePayload());

        const result = await feedbackRequestService.updateStatusById(String(feedback._id), {
            status: FeedbackRequestStatus.in_progress
        });

        expect(asSuccess(result).data.status).toBe(FeedbackRequestStatus.in_progress);
    });

    it('persists the change rather than only mutating in memory', async () => {
        const feedback = await feedbackRequestService.create(makePayload());

        await feedbackRequestService.updateStatusById(String(feedback._id), {
            status: FeedbackRequestStatus.spam
        });

        const stored = await reload(feedback);

        expect(stored.status).toBe(FeedbackRequestStatus.spam);
    });

    it('records admin notes', async () => {
        const feedback = await feedbackRequestService.create(makePayload());

        const result = await feedbackRequestService.updateStatusById(String(feedback._id), {
            adminNotes: 'Duplicate of #12'
        });

        expect(asSuccess(result).data.adminNotes).toBe('Duplicate of #12');
    });

    it('leaves the status untouched when the payload carries none', async () => {
        const feedback = await feedbackRequestService.create(makePayload());
        feedback.status = FeedbackRequestStatus.in_progress;
        await feedbackRequestRepository.save(feedback);

        await feedbackRequestService.updateStatusById(String(feedback._id), {
            adminNotes: 'Just a note'
        });

        const stored = await reload(feedback);

        expect(stored.status).toBe(FeedbackRequestStatus.in_progress);
    });

    it("clears admin notes on `null`, the contract's only way to clear them", async () => {
        // `!== undefined`, not a truthiness check: `null` is a deliberate clear, and a truthy guard
        // would make notes impossible to remove once written. `''` is refused at the HTTP door.
        const feedback = await feedbackRequestService.create(makePayload());
        await feedbackRequestService.updateStatusById(String(feedback._id), {
            adminNotes: 'temporary'
        });

        await feedbackRequestService.updateStatusById(String(feedback._id), { adminNotes: null });

        const stored = await reload(feedback);

        expect(stored.adminNotes).toBeUndefined();
    });

    it('stamps respondedAt when the request becomes resolved', async () => {
        const feedback = await feedbackRequestService.create(makePayload());

        await feedbackRequestService.updateStatusById(String(feedback._id), {
            status: FeedbackRequestStatus.resolved
        });

        const stored = await reload(feedback);

        expect(stored.respondedAt).toBeInstanceOf(Date);
    });

    it('does not stamp respondedAt for a non-resolved status', async () => {
        const feedback = await feedbackRequestService.create(makePayload());

        await feedbackRequestService.updateStatusById(String(feedback._id), {
            status: FeedbackRequestStatus.in_progress
        });

        const stored = await reload(feedback);

        expect(stored.respondedAt).toBeUndefined();
    });

    it('keeps the original respondedAt when resolved a second time', async () => {
        // "When did we answer this" must not drift every time an admin re-saves the record.
        const feedback = await feedbackRequestService.create(makePayload());
        await feedbackRequestService.updateStatusById(String(feedback._id), {
            status: FeedbackRequestStatus.resolved
        });
        const first = await reload(feedback);
        const firstStamp = first.respondedAt!.getTime();

        await feedbackRequestService.updateStatusById(String(feedback._id), {
            status: FeedbackRequestStatus.resolved
        });

        const stored = await reload(feedback);

        expect(stored.respondedAt!.getTime()).toBe(firstStamp);
    });
});

describe('updateStatusById — the lookup', () => {
    it('updates an existing request', async () => {
        const feedback = await feedbackRequestService.create(makePayload());

        const result = await feedbackRequestService.updateStatusById(String(feedback._id), {
            status: FeedbackRequestStatus.resolved
        });

        expect(result.success).toBe(true);
        expect(asSuccess(result).data.status).toBe(FeedbackRequestStatus.resolved);
    });

    it('rejects with 404 for an id that does not exist', async () => {
        const result = await feedbackRequestService.updateStatusById(MISSING_ID, {
            status: FeedbackRequestStatus.resolved
        });

        expect(result.success).toBe(false);
        expect(asReject(result).status).toBe(404);
    });
});

describe('removeById', () => {
    it('permanently deletes an existing request', async () => {
        const feedback = await feedbackRequestService.create(makePayload());

        const result = await feedbackRequestService.removeById(String(feedback._id));

        expect(result.success).toBe(true);
        expect(await feedbackRequestRepository.findById(String(feedback._id))).toBeNull();
    });

    it('rejects with 404 for an id that does not exist', async () => {
        const result = await feedbackRequestService.removeById(MISSING_ID);

        expect(result.success).toBe(false);
        expect(asReject(result).status).toBe(404);
    });

    it('emits admin.feedback.deleted with the target id when a context is given', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const feedback = await feedbackRequestService.create(makePayload());

        await feedbackRequestService.removeById(String(feedback._id), testCallerContext);

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: feedbackAuditActions.ADMIN_FEEDBACK_DELETED,
                outcome: 'success',
                targetType: 'feedback',
                targetId: String(feedback._id)
            })
        );
    });

    it('emits no audit event when no context is given', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const feedback = await feedbackRequestService.create(makePayload());

        await feedbackRequestService.removeById(String(feedback._id));

        expect(auditSpy).not.toHaveBeenCalled();
    });
});
