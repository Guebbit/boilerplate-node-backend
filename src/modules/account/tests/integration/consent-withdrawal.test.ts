/**
 * @module
 * The `account.analytics_consent_withdrawn` outbox event: written with the profile save only when
 * stored consent flips `true → false`, and answered by the analytics provider forgetting the id.
 * PostHog itself is never called: `forget` is observed on the resolved provider.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext } from '@tests/callers';
import { markDomainEventsWired, onDomainEvent, resetDomainEvents } from '@kernel/events';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import { resolveAnalyticsProvider } from '@infrastructure/observability/analytics';
import { createUser } from '@modules/users/tests/factories';
import { accountService } from '@modules/account/services';
import accountModule from '../../module';

setupTestDb();

/** Outbox rows for the withdrawal event, plain. */
const withdrawnRows = () =>
    outboxEventModel.find({ name: 'account.analytics_consent_withdrawn' }).lean().exec();

/** An account whose stored consent is `consent` (`undefined` = never answered). */
const accountWith = (consent: boolean | undefined, slug: string) =>
    createUser({
        email: `${slug}@example.com`,
        username: slug,
        ...(consent === undefined
            ? {}
            : { analyticsConsent: consent, analyticsConsentAt: new Date() })
    });

afterEach(() => {
    jest.restoreAllMocks();
    resetDomainEvents();
});

describe('account.analytics_consent_withdrawn', () => {
    it('is written once when consent flips true to false', async () => {
        const user = await accountWith(true, 'withdrawer');

        const result = await accountService.updateProfile(
            user.id,
            { analyticsConsent: false },
            testCallerContext
        );

        expect(result.success).toBe(true);
        expect(await withdrawnRows()).toMatchObject([
            { aggregateId: user.id, payload: { userId: user.id } }
        ]);
    });

    it.each([
        ['false to true', false, true],
        ['true to true', true, true],
        ['false to false', false, false],
        ['never answered to false', undefined, false],
        ['never answered to true', undefined, true]
    ])('is not written when consent goes %s', async (_label, before, after) => {
        const user = await accountWith(before, `no-${String(before)}-${String(after)}`);

        await accountService.updateProfile(user.id, { analyticsConsent: after }, testCallerContext);

        expect(await withdrawnRows()).toHaveLength(0);
    });

    it('is not written by an edit that leaves consent alone', async () => {
        const user = await accountWith(true, 'untouched');

        await accountService.updateProfile(user.id, { username: 'renamed' }, testCallerContext);

        expect(await withdrawnRows()).toHaveLength(0);
    });

    it('makes the analytics provider forget the account id', async () => {
        const forget = jest.spyOn(resolveAnalyticsProvider(), 'forget').mockResolvedValue();
        markDomainEventsWired();
        accountModule.subscribe();
        const user = await accountWith(true, 'forgotten');

        await accountService.updateProfile(user.id, { analyticsConsent: false }, testCallerContext);
        await settleOutboxNudges();

        expect(forget.mock.calls).toEqual([[user.id]]);
    });

    it('keeps the row pending when the provider fails, so the deletion is retried', async () => {
        jest.spyOn(resolveAnalyticsProvider(), 'forget').mockRejectedValue(new Error('down'));
        markDomainEventsWired();
        accountModule.subscribe();
        // An unrelated listener proves the failure is the provider's, not the bus's.
        onDomainEvent('account.analytics_consent_withdrawn', () => undefined);
        const user = await accountWith(true, 'retried');

        const result = await accountService.updateProfile(
            user.id,
            { analyticsConsent: false },
            testCallerContext
        );
        await settleOutboxNudges();

        expect(result.success).toBe(true);
        expect(await withdrawnRows()).toMatchObject([{ status: 'pending', attempts: 1 }]);
    });
});
