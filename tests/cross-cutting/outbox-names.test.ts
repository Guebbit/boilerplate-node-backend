/**
 * Every mail names itself, and names itself the way the twin does.
 *
 * The demo outbox's `template` field is a shared identifier: the paired frontend's e2e specs use
 * it to say WHICH mail they are looking at — "find the shipping notice", not "find the second one"
 * — and those specs run against both backends. So the name belongs to the pair, not to this
 * repository, and anything in it that only one backend can produce is a name the other cannot
 * match.
 *
 * `.ejs` was exactly that. These names carried the extension of the templating engine this backend
 * happens to use, so this one published `account.reset-request.ejs` where the PHP twin — which
 * renders Blade and has never heard of EJS — published `account.reset-request`. Four frontend specs
 * hardcoded the suffixed form and therefore only ever worked against this backend. The extension is
 * now added by `templateFile()` at the one point the name becomes a path, and the case below is
 * what keeps it there.
 *
 * Stripping the suffix cost one guarantee that used to be free: a name WAS a filename, so a
 * mistyped one could not resolve. Now it can, and only at send time — so the last case asserts
 * every published name still points at a real template.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { templateFile } from '@infrastructure/adapters/mailer';

const MODULES_ROOT = path.join(__dirname, '../../src/modules');

/** Every `src/modules/<name>/emails.ts`, discovered rather than listed. */
const listEmailFiles = (): { module: string; file: string }[] =>
    readdirSync(MODULES_ROOT)
        .map((name) => ({ module: name, file: path.join(MODULES_ROOT, name, 'emails.ts') }))
        .filter((entry) => existsSync(entry.file));

/** Every `template:` assignment in an `emails.ts`, literal or not. */
const templateAssignments = (source: string): string[] =>
    source.split('\n').filter((line) => /^\s*template:/.test(line));

/** The outbox names a module publishes. */
const namesIn = (source: string): string[] =>
    [...source.matchAll(/^\s*template: '([^']+)'/gm)].map((match) => match[1]);

const publishedNames = (): { module: string; name: string }[] =>
    listEmailFiles().flatMap(({ module, file }) =>
        namesIn(readFileSync(file, 'utf8')).map((name) => ({ module, name }))
    );

it('finds the mails it means to check', () => {
    // A canary: a renamed file or a changed field would otherwise make every case below a sweep
    // over an empty list, which passes and proves nothing.
    const found = publishedNames();
    expect(found.length).toBeGreaterThanOrEqual(8);
    expect(new Set(found.map((entry) => entry.module)).size).toBeGreaterThanOrEqual(4);
});

it('states every name as a literal, so the sweep below can see all of them', () => {
    /*
     * The cases here read source text, so a name assembled at runtime — a variable, a template
     * string, a helper call — would be published without any of them noticing. A literal is also
     * what the name IS: an identifier shared with another repository cannot be computed from
     * anything local, so requiring the literal costs nothing and closes the blind spot.
     */
    const computed = listEmailFiles().flatMap(({ module, file }) => {
        const source = readFileSync(file, 'utf8');
        return templateAssignments(source)
            .filter((line) => !/^\s*template: '[^']+',?$/.test(line))
            .map((line) => `${module}: ${line.trim()}`);
    });

    expect(computed).toEqual([]);
});

it('keeps the names free of a file extension', () => {
    /*
     * `<module>.<event>`, kebab-case, and exactly two segments. The twin renders Blade and this one
     * renders EJS, so publishing either extension makes the name describe an implementation the
     * other backend does not share.
     *
     * Stated as the shape rather than as a list of forbidden extensions — the twin's version bans
     * `.ejs` and `.blade` by name, which a third engine would walk straight past. Two segments is
     * also the convention the prefix depends on: it is what makes an orphaned template visible once
     * its module is deleted.
     *
     * `path.extname` is no use here. The names are dotted by design, so it reads the event half of
     * `account.verify-request` as the extension.
     */
    const malformed = publishedNames()
        .filter(({ name }) => !/^[a-z][\da-z-]*\.[a-z][\da-z-]*$/.test(name))
        .map(({ module, name }) => `${module}: ${name}`);

    expect(malformed).toEqual([]);
});

it('gives no two mails the same name', () => {
    /*
     * A collision is silent and total: two mails publishing one name means a spec asking for the
     * first finds whichever was sent last, and the assertion still passes.
     */
    const seen = new Map<string, string>();
    const collisions: string[] = [];

    for (const { module, name } of publishedNames()) {
        const owner = seen.get(name);
        if (owner) collisions.push(`${name} is claimed by both ${owner} and ${module}`);
        seen.set(name, module);
    }

    expect(collisions).toEqual([]);
});

it('points every name at a template that exists', () => {
    /*
     * The guarantee the strip cost. While the name carried `.ejs` it was the filename, so a typo
     * could not resolve; now `templateFile()` appends the suffix and a mistyped name is a file that
     * is missing at send time — an EJS ENOENT inside a queue worker, hours after the request that
     * asked for the mail.
     */
    const missing = publishedNames()
        .filter(({ name }) => !existsSync(templateFile(name)))
        .map(({ module, name }) => `${module}: ${name} → ${templateFile(name)}`);

    expect(missing).toEqual([]);
});

it('publishes the set the pair agreed on', () => {
    /*
     * Stated rather than derived, because the point is agreement with a repository this test cannot
     * read. The twin publishes the same eight, one per mailable, verified against
     * `tests/CrossCutting/OutboxNamesTest.php` in boilerplate-php-laravel-backend.
     *
     * `account.registration-confirm` is the known divergence: this backend sends it and the twin has
     * no mailable for it. It is listed here because the twin is the side that is missing a mail —
     * recorded in HANDOFF.md rather than fixed from here, since nothing in this repository can add
     * it. Delete this line only together with the mail itself.
     */
    const agreed = [
        'account.delete-confirm',
        'account.delete-request',
        'account.registration-confirm',
        'account.reset-confirm',
        'account.reset-request',
        'account.verify-request',
        'delivery.shipment-shipped',
        'feedback.contact',
        'orders.order-confirm'
    ];

    expect(
        publishedNames()
            .map(({ name }) => name)
            .toSorted()
    ).toEqual(agreed);
});
