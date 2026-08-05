/**
 * Guards the email template path.
 *
 * `EMAIL_TEMPLATES_DIR` previously came from a per-file `import.meta.url` shim whose `dirname`
 * was derived from the CommonJS `__filename` it existed to replace. It resolved to
 * `src/views/templates-emails` — a directory that has never existed, since templates live at the
 * repository root — so every templated email failed to render, and no test noticed because
 * nothing asserted the path pointed at a real file.
 *
 * This asserts existence rather than mocking it away: a path bug is only catchable against the
 * real filesystem.
 */
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { EMAIL_TEMPLATES_DIR } from '@core/adapters/mailer';

describe('email templates', () => {
    it('resolves to a directory that exists', () => {
        expect(existsSync(EMAIL_TEMPLATES_DIR)).toBe(true);
    });

    it('contains at least one .ejs template', () => {
        const templates = readdirSync(EMAIL_TEMPLATES_DIR).filter((f) => f.endsWith('.ejs'));
        expect(templates.length).toBeGreaterThan(0);
    });

    it.each([
        'email-registration-confirm.ejs',
        'email-order-confirm.ejs',
        'email-delete-confirm.ejs',
        'email-delete-request.ejs',
        'email-feedback-contact.ejs'
    ])('resolves %s to a real file', (template) => {
        expect(existsSync(path.resolve(EMAIL_TEMPLATES_DIR, template))).toBe(true);
    });
});
