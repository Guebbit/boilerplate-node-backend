/**
 * `src/infrastructure/adapters/demo-outbox.ts` — the demo profile's email sink.
 *
 * The paired frontend's password-reset and verification specs are only as good as this
 * recording: `token` in particular is lifted out of the templates' link URL, and a regression
 * there fails suites in ANOTHER repo with a message about an empty inbox.
 */
import {
    clearDemoOutbox,
    enableDemoProfile,
    isDemoMode,
    readDemoOutbox,
    recordDemoEmail
} from '@infrastructure/adapters/demo-outbox';
import { logger } from '@infrastructure/adapters/logger';

/** Restored after every case, since it is read directly rather than through a test helper. */
const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
    clearDemoOutbox();
    enableDemoProfile(false);
    process.env.NODE_ENV = originalNodeEnv;
});

it('is demo mode exactly when enableDemoProfile() was called', () => {
    expect(isDemoMode()).toBe(false);
    enableDemoProfile();
    expect(isDemoMode()).toBe(true);
});

it('refuses production even after enableDemoProfile(), and logs it', () => {
    const error = jest.spyOn(logger, 'error').mockImplementation(() => logger);
    enableDemoProfile();
    process.env.NODE_ENV = 'production';

    expect(isDemoMode()).toBe(false);
    expect(error).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('production') })
    );
});

it('records newest first, with primitive template variables as readable lines', () => {
    recordDemoEmail({ to: 'a@b.it', subject: 'First' }, 'one', { greeting: 'Hello', count: 2 });
    recordDemoEmail({ to: 'c@d.it', subject: 'Second' }, 'two', {});

    const [newest, oldest] = readDemoOutbox();
    expect(newest).toMatchObject({ to: 'c@d.it', template: 'two' });
    expect(oldest.lines).toEqual(expect.arrayContaining(['greeting: Hello', 'count: 2']));
});

it('lifts the token out of a link URL when no bare token variable exists', () => {
    recordDemoEmail({ to: 'a@b.it', subject: 'Reset' }, 'reset', {
        linkUrl: 'http://localhost:3000/account/reset/d2740058f8b671c6ae12fc8618b09129'
    });
    expect(readDemoOutbox()[0].token).toBe('d2740058f8b671c6ae12fc8618b09129');
});

it('prefers a bare token variable over the link', () => {
    recordDemoEmail({ to: 'a@b.it', subject: 'Verify' }, 'verify', {
        token: 'bare-token',
        linkUrl: 'http://localhost:3000/account/verify/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    });
    expect(readDemoOutbox()[0].token).toBe('bare-token');
});

it('serializes a structured recipient rather than losing it', () => {
    recordDemoEmail({ to: { name: 'G', address: 'g@p.it' }, subject: 'S' }, 't', {});
    expect(readDemoOutbox()[0].to).toContain('g@p.it');
});

it('clears to an empty inbox — the per-spec reset the demo router performs', () => {
    recordDemoEmail({ to: 'a@b.it', subject: 'S' }, 't', {});
    clearDemoOutbox();
    expect(readDemoOutbox()).toEqual([]);
});
