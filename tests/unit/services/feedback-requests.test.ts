/**
 * Feedback request service — `src/services/feedback-requests.ts`.
 *
 * Three things here are worth pinning:
 *
 *   **Normalisation on create.** Email is lowercased and every field trimmed, so the same person
 *   writing "  Ada@Example.COM " twice produces one searchable identity rather than two. An empty
 *   `name` collapses to `undefined` rather than `''`, which is what keeps the field genuinely
 *   optional instead of "present but blank".
 *
 *   **The status vocabulary.** `STATUS_MAP` is lowercase-only and matches `openapi.yaml`'s
 *   `enum: [new, in_progress, resolved, spam]`. It previously carried uppercase aliases that the
 *   contract never allowed; the module comment records that removal. An unknown status must map
 *   to `undefined` — and, on the search path, that has a consequence the tests below make
 *   explicit rather than assume.
 *
 *   **`respondedAt` is stamped once.** Re-resolving an already-resolved item must not move the
 *   timestamp, or "when did we answer this" becomes "when did an admin last click something".
 */

import { setupTestDb } from '../../helpers/setup-test-db';
import { create, search, updateStatus, updateStatusById } from '@services/feedback-requests';
import { feedbackRequestRepository } from '@repositories/feedback-requests';
import { FeedbackRequestStatus } from '@types';
import type { IResponseReject, IResponseSuccess } from '@core/http/response';
import type { IFeedbackRequestDocument } from '@models/feedback-requests';

setupTestDb();

const MISSING_ID = '507f1f77bcf86cd799439011';

const asSuccess = (result: unknown) => result as IResponseSuccess<IFeedbackRequestDocument>;
const asReject = (result: unknown) => result as IResponseReject;

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
        const feedback = await create(makePayload());

        // Every request starts in the same state regardless of what a client sent — the status
        // field is admin-controlled, not caller-controlled.
        expect(feedback.status).toBe(FeedbackRequestStatus.new);
        expect(feedback.subject).toBe('Broken checkout');
    });

    it('lowercases the email so the same address is one identity', async () => {
        const feedback = await create(makePayload({ email: 'Ada@Example.COM' }));

        expect(feedback.email).toBe('ada@example.com');
    });

    it('trims surrounding whitespace from every text field', async () => {
        const feedback = await create(
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
        const feedback = await create(makePayload({ name: '   ' }));

        expect(feedback.name).toBeUndefined();
    });

    it('keeps a name that is only whitespace-padded', async () => {
        const feedback = await create(makePayload({ name: ' A ' }));

        expect(feedback.name).toBe('A');
    });
});

/** Seeds a small, deliberately varied corpus. */
const seed = async () => {
    await create(makePayload({ email: 'ada@example.com', subject: 'Checkout bug' }));
    await create(makePayload({ email: 'grace@example.com', subject: 'Login trouble' }));
    const third = await create(makePayload({ email: 'alan@example.com', subject: 'Feature idea' }));
    third.status = FeedbackRequestStatus.resolved;
    await feedbackRequestRepository.save(third);
};

describe('search', () => {
    it('returns every request when no filter is given', async () => {
        await seed();

        const { items, meta } = await search();

        expect(items).toHaveLength(3);
        expect(meta.totalItems).toBe(3);
    });

    it('filters by status', async () => {
        await seed();

        const { items } = await search({ status: 'resolved' });

        expect(items).toHaveLength(1);
        expect(items[0].email).toBe('alan@example.com');
    });

    it('filters by email fragment', async () => {
        await seed();

        const { items } = await search({ email: 'grace' });

        expect(items).toHaveLength(1);
        expect(items[0].email).toBe('grace@example.com');
    });

    it('searches free text across name, subject and message', async () => {
        await seed();

        const { items } = await search({ text: 'Login' });

        expect(items).toHaveLength(1);
        expect(items[0].subject).toBe('Login trouble');
    });

    it('paginates and reports coherent meta', async () => {
        await seed();

        const { items, meta } = await search({ page: 1, pageSize: 2 });

        expect(items).toHaveLength(2);
        // The three meta fields must agree with each other and with the page actually returned;
        // a totalPages computed from the page size rather than the total is a classic off-by-one.
        expect(meta).toMatchObject({ page: 1, pageSize: 2, totalItems: 3, totalPages: 2 });
    });

    it('matches nothing for an unknown status rather than widening the search', async () => {
        // An unrecognised status is truthy, so `where.status` is set, but `toFeedbackStatus`
        // maps it to `undefined`. The important property is the *direction* of the failure: an
        // unparseable filter must narrow to nothing, never fall through to "return everything".
        await seed();

        const { items } = await search({ status: 'NOT_A_STATUS' });

        expect(items).toHaveLength(0);
    });

    it('does not honour the uppercase status aliases the contract removed', async () => {
        // `STATUS_MAP` is lowercase-only, matching openapi.yaml's enum. 'NEW' is therefore not a
        // status at all — it must not quietly behave like `new`.
        await seed();

        const { items } = await search({ status: 'NEW' });

        expect(items).toHaveLength(0);
        // Contrast with the lowercase form, which does filter — proving the assertion above is
        // about the alias and not about the filter being broken outright.
        const lowercase = await search({ status: 'new' });
        expect(lowercase.items).toHaveLength(2);
    });
});

describe('updateStatus', () => {
    it('applies a new status', async () => {
        const feedback = await create(makePayload());

        const result = await updateStatus(feedback, {
            status: FeedbackRequestStatus.in_progress
        });

        expect(asSuccess(result).data!.status).toBe(FeedbackRequestStatus.in_progress);
    });

    it('persists the change rather than only mutating in memory', async () => {
        const feedback = await create(makePayload());

        await updateStatus(feedback, { status: FeedbackRequestStatus.spam });

        const reloaded = await feedbackRequestRepository.findById(String(feedback._id));
        expect(reloaded!.status).toBe(FeedbackRequestStatus.spam);
    });

    it('records admin notes', async () => {
        const feedback = await create(makePayload());

        const result = await updateStatus(feedback, { adminNotes: 'Duplicate of #12' });

        expect(asSuccess(result).data!.adminNotes).toBe('Duplicate of #12');
    });

    it('leaves the status untouched when the payload carries none', async () => {
        const feedback = await create(makePayload());
        feedback.status = FeedbackRequestStatus.in_progress;
        await feedbackRequestRepository.save(feedback);

        await updateStatus(feedback, { adminNotes: 'Just a note' });

        expect(feedback.status).toBe(FeedbackRequestStatus.in_progress);
    });

    it('allows admin notes to be cleared to an empty string', async () => {
        // `!== undefined`, not a truthiness check: '' is a deliberate clear, and a truthy guard
        // would make notes impossible to remove once written.
        const feedback = await create(makePayload());
        await updateStatus(feedback, { adminNotes: 'temporary' });

        await updateStatus(feedback, { adminNotes: '' });

        expect(feedback.adminNotes).toBe('');
    });

    it('stamps respondedAt when the request becomes resolved', async () => {
        const feedback = await create(makePayload());

        await updateStatus(feedback, { status: FeedbackRequestStatus.resolved });

        expect(feedback.respondedAt).toBeInstanceOf(Date);
    });

    it('does not stamp respondedAt for a non-resolved status', async () => {
        const feedback = await create(makePayload());

        await updateStatus(feedback, { status: FeedbackRequestStatus.in_progress });

        expect(feedback.respondedAt).toBeUndefined();
    });

    it('keeps the original respondedAt when resolved a second time', async () => {
        // "When did we answer this" must not drift every time an admin re-saves the record.
        const feedback = await create(makePayload());
        await updateStatus(feedback, { status: FeedbackRequestStatus.resolved });
        const firstStamp = feedback.respondedAt!.getTime();

        await updateStatus(feedback, { status: FeedbackRequestStatus.resolved });

        expect(feedback.respondedAt!.getTime()).toBe(firstStamp);
    });
});

describe('updateStatusById', () => {
    it('updates an existing request', async () => {
        const feedback = await create(makePayload());

        const result = await updateStatusById(String(feedback._id), {
            status: FeedbackRequestStatus.resolved
        });

        expect(result.success).toBe(true);
        expect(asSuccess(result).data!.status).toBe(FeedbackRequestStatus.resolved);
    });

    it('rejects with 404 for an id that does not exist', async () => {
        const result = await updateStatusById(MISSING_ID, {
            status: FeedbackRequestStatus.resolved
        });

        expect(result.success).toBe(false);
        expect(asReject(result).status).toBe(404);
    });
});
