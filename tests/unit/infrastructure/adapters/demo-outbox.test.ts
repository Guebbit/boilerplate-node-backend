/**
 * `src/infrastructure/adapters/demo-outbox.ts` — the demo profile's email sink.
 *
 * The paired frontend's password-reset and verification specs are only as good as this
 * recording: `token` in particular is lifted out of the templates' link URL, and a regression
 * there fails suites in ANOTHER repo with a message about an empty inbox.
 */
import {
    clearDemoOutbox,
    readDemoOutbox,
    recordDemoEmail
} from '@infrastructure/adapters/demo-outbox';

afterEach(() => {
    clearDemoOutbox();
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

it('clears to an empty inbox — the per-spec reset the demo router performs', () => {
    recordDemoEmail({ to: 'a@b.it', subject: 'S' }, 't', {});
    clearDemoOutbox();
    expect(readDemoOutbox()).toEqual([]);
});

it('records an attachment by filename only, never its bytes', () => {
    recordDemoEmail(
        {
            to: 'a@b.it',
            subject: 'S',
            attachments: [{ filename: 'invoice-2026-000041.pdf', key: 'abc123.pdf' }]
        },
        't',
        {}
    );
    expect(readDemoOutbox()[0].attachments).toEqual(['invoice-2026-000041.pdf']);
});

it('omits attachments entirely for a send that carried none', () => {
    recordDemoEmail({ to: 'a@b.it', subject: 'S' }, 't', {});
    expect(readDemoOutbox()[0].attachments).toBeUndefined();
});
