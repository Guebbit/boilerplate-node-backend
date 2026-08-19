/**
 * `src/infrastructure/adapters/demo-outbox.ts` — the demo profile's email sink.
 *
 * The paired frontend's password-reset and verification specs are only as good as this
 * recording: `token` in particular is lifted out of the templates' link URL, and a regression
 * there fails suites in ANOTHER repo with a message about an empty inbox.
 */
import {
    clearDemoOutbox,
    isDemoMode,
    readDemoOutbox,
    recordDemoEmail
} from '@infrastructure/adapters/demo-outbox';

afterEach(() => {
    clearDemoOutbox();
    delete process.env.NODE_DEMO;
});

it('is demo mode exactly when NODE_DEMO is the string true', () => {
    delete process.env.NODE_DEMO;
    expect(isDemoMode()).toBe(false);
    process.env.NODE_DEMO = 'true';
    expect(isDemoMode()).toBe(true);
});

it('records newest first, with primitive template variables as readable lines', () => {
    recordDemoEmail({ to: 'a@b.it', subject: 'First' }, 'one.ejs', { greeting: 'Hello', count: 2 });
    recordDemoEmail({ to: 'c@d.it', subject: 'Second' }, 'two.ejs', {});

    const [newest, oldest] = readDemoOutbox();
    expect(newest).toMatchObject({ to: 'c@d.it', template: 'two.ejs' });
    expect(oldest.lines).toEqual(expect.arrayContaining(['greeting: Hello', 'count: 2']));
});

it('lifts the token out of a link URL when no bare token variable exists', () => {
    recordDemoEmail({ to: 'a@b.it', subject: 'Reset' }, 'reset.ejs', {
        linkUrl: 'http://localhost:3000/account/reset/d2740058f8b671c6ae12fc8618b09129'
    });
    expect(readDemoOutbox()[0].token).toBe('d2740058f8b671c6ae12fc8618b09129');
});

it('prefers a bare token variable over the link', () => {
    recordDemoEmail({ to: 'a@b.it', subject: 'Verify' }, 'verify.ejs', {
        token: 'bare-token',
        linkUrl: 'http://localhost:3000/account/verify/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    });
    expect(readDemoOutbox()[0].token).toBe('bare-token');
});

it('serializes a structured recipient rather than losing it', () => {
    recordDemoEmail({ to: { name: 'G', address: 'g@p.it' }, subject: 'S' }, 't.ejs', {});
    expect(readDemoOutbox()[0].to).toContain('g@p.it');
});

it('clears to an empty inbox — the per-spec reset the demo router performs', () => {
    recordDemoEmail({ to: 'a@b.it', subject: 'S' }, 't.ejs', {});
    clearDemoOutbox();
    expect(readDemoOutbox()).toEqual([]);
});
