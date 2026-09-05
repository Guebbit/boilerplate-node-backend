/**
 * Every variable an EJS mail template prints, a builder supplies.
 *
 * `docs/tools/email-and-rendering.md` states the rule this guards: templates interpolate, they do
 * not translate — `<%= greeting %>`, never `<%= t('…') %>`. The PHP twin's `MailCopyTest` is built
 * for a different engine but the same failure class: Blade's `__()` answers a missing key with THE
 * KEY ITSELF, so a mail with missing copy sends successfully and nobody notices — the person who
 * wrote the template never opens the mail. EJS's failure is the render throwing at send time
 * instead of at review time, which is silent in the same practical sense: nothing here catches it
 * before a real send does, unless this file renders every template against what its builder
 * actually supplies.
 *
 * Static rather than rendered, same as the PHP version and for the same reason: the templates are
 * read as text and the builders as source, so this stays in the layer with no booted framework —
 * no SMTP, no queue, no translator — and checks every branch a template has, not just the one a
 * fixture happens to construct.
 *
 * ── Scope ─────────────────────────────────────────────────────────────────────────────────────
 * `shared/views/templates-emails/*.ejs` and the `EmailContent`-returning builders in each module's
 * `emails.ts` — mail only. `shared/views/templates-files/orders.invoice.ejs` is the same mechanism
 * (EJS, `orders/emails.ts`'s `invoiceDocument`) rendering a PDF rather than a mail,
 * found on the way and deliberately left out: it is not an `EmailContent`, so it does not fit this
 * file's builder-matching without a second shape, and it is one template. Worth its own pass, not
 * a reason to widen this one.
 *
 * ── Two things this file assumes, and defends ────────────────────────────────────────────────
 * Every template here only interpolates a bare variable or loops one array with `.forEach(function
 * (x) { … })` — never a property access, a computed expression or a helper call. That is what lets
 * a text scan know a tag's variable without evaluating it. `uses only bare interpolation…` below is
 * the tripwire: the day a template's markup grows past that, the walk needs to grow with it rather
 * than silently stop covering the new shape.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.join(__dirname, '../..');
const TEMPLATES_DIR = path.join(REPO_ROOT, 'shared/views/templates-emails');
const MODULES_ROOT = path.join(REPO_ROOT, 'src/modules');

const OUTPUT_TAG = /<%[=-]([\S\s]*?)%>/g;

/** One `<%= … %>` / `<%- … %>` tag: its full body, and the identifier it starts with. */
interface OutputTag {
    body: string;
    head: string;
}

const outputTags = (source: string): OutputTag[] =>
    [...source.matchAll(OUTPUT_TAG)].map((match) => {
        const body = match[1].trim();
        return { body, head: /^[$A-Z_a-z][\w$]*/.exec(body)?.[0] ?? '' };
    });

/** Variable names bound by a `.forEach(function (x) { … })` loop — local, not required from data. */
const loopLocals = (source: string): Set<string> =>
    new Set(
        [...source.matchAll(/\.forEach\(function\s*\(([$A-Z_a-z][\w$]*)\)/g)].map(
            (match) => match[1]
        )
    );

/** Relative paths named in this file's `include(…)` calls, in the order they appear. */
const includedPartials = (source: string): string[] =>
    [...source.matchAll(/include\(\s*["']([^"']+)["']/g)].map((match) => match[1]);

/**
 * Every bare variable a template needs, walking its `include()`s.
 *
 * `visited` guards a cycle the same way `resolveSchema` in `spec-walk.ts` guards a
 * self-referential schema — nothing here is expected to cycle, but a stack overflow is a worse
 * failure than a silently truncated result.
 */
const requiredVariables = (filePath: string, visited: Set<string> = new Set()): Set<string> => {
    if (visited.has(filePath)) return new Set();
    visited.add(filePath);

    const source = readFileSync(filePath, 'utf8');
    const locals = loopLocals(source);
    const required = new Set<string>();

    for (const { head } of outputTags(source))
        if (head && head !== 'include' && !locals.has(head)) required.add(head);

    for (const relative of includedPartials(source))
        for (const name of requiredVariables(
            path.resolve(path.dirname(filePath), relative),
            visited
        ))
            required.add(name);

    return required;
};

/** Every tag this walk cannot read as a bare variable or an `include()` — see the file header. */
const unsupportedTags = (filePath: string): string[] =>
    outputTags(readFileSync(filePath, 'utf8'))
        .filter(({ body, head }) => head !== 'include' && body !== head)
        .map(({ body }) => `${path.relative(REPO_ROOT, filePath)}: <%= ${body} %>`);

const templateFiles = (): string[] =>
    readdirSync(TEMPLATES_DIR)
        .filter((entry) => entry.endsWith('.ejs'))
        .map((entry) => path.join(TEMPLATES_DIR, entry));

/**
 * Strip comments before splitting entries. A source comment can hold a bare `:` of its own — see
 * `feedback/emails.ts`'s comment on the `name` property — and left in place that reads as the key
 * of whatever entry the comment happens to share a line-less gap with, silently discarding the
 * real property after it. None of these data objects put a real `//` or `/*` inside a string, so a
 * blind strip is safe here rather than merely convenient.
 */
const stripComments = (source: string): string =>
    source.replaceAll(/\/\*[\S\s]*?\*\//g, '').replaceAll(/\/\/.*$/gm, '');

/**
 * Depth-aware split of an object literal's body into its top-level entries — the same problem
 * `MailCopyTest`'s `flattenKeys` solves for nested JSON, restated for nested braces/parens/brackets
 * instead of nested objects. A naive comma split would cut `t('…', { title, quantity, price })`
 * into three, which is exactly the class of bug this file exists to catch in templates and must not
 * commit itself while reading builders.
 */
const topLevelEntries = (body: string): string[] => {
    const entries: string[] = [];
    let depth = 0;
    let current = '';

    for (const char of stripComments(body)) {
        if ('{(['.includes(char)) depth += 1;
        if ('})]'.includes(char)) depth -= 1;
        if (char === ',' && depth === 0) {
            entries.push(current);
            current = '';
            continue;
        }
        current += char;
    }
    if (current.trim()) entries.push(current);

    return entries;
};

/** The key of one entry — the identifier before `:`, or the whole thing for a shorthand property. */
const entryKey = (entry: string): string => {
    const trimmed = entry.trim();
    const colon = trimmed.indexOf(':');
    return colon === -1 ? trimmed : trimmed.slice(0, colon).trim();
};

/** Text between a `{` at `openIndex` (already consumed) and its matching `}`. */
const extractBalanced = (source: string, openIndex: number): string => {
    let depth = 1;
    let index = openIndex;
    while (depth > 0 && index < source.length) {
        if (source[index] === '{') depth += 1;
        else if (source[index] === '}') depth -= 1;
        index += 1;
    }
    return source.slice(openIndex, index - 1);
};

/** Every `EmailContent`-returning builder's `template` name mapped to its `data` object's keys. */
const builderDataKeys = (): Map<string, string[]> => {
    const map = new Map<string, string[]>();

    for (const module of readdirSync(MODULES_ROOT)) {
        const file = path.join(MODULES_ROOT, module, 'emails.ts');
        let source: string;
        try {
            source = readFileSync(file, 'utf8');
        } catch {
            continue;
        }

        for (const match of source.matchAll(/template: '([^']+)'/g)) {
            const name = match[1];
            const dataTag = /data:\s*{/.exec(source.slice(match.index));
            if (!dataTag) continue;
            const openIndex = match.index + dataTag.index + dataTag[0].length;
            const keys = topLevelEntries(extractBalanced(source, openIndex))
                .map((entry) => entryKey(entry))
                .filter(Boolean);
            map.set(name, keys);
        }
    }

    return map;
};

describe('every EJS mail template gets a value for every variable it prints', () => {
    it('finds the templates and builders it means to check', () => {
        // A canary: a moved directory or a renamed field would otherwise turn every case below
        // into a sweep over an empty map, which passes and proves nothing.
        expect(templateFiles().length).toBeGreaterThanOrEqual(6);
        expect(builderDataKeys().size).toBeGreaterThanOrEqual(6);
    });

    it('uses only bare interpolation, so the walk can see every variable a template needs', () => {
        /*
         * The tripwire this file's header promises. A template that starts printing
         * `<%= user.name %>` or `<%= greeting.toUpperCase() %>` would have its head identifier
         * read as `user` or `greeting` — plausible-looking and wrong, since the actual dependency
         * is a property or a method the builder may not supply under that name. Better to fail
         * loudly here than to pass while checking the wrong thing.
         */
        const unsupported = [
            ...templateFiles().flatMap((file) => unsupportedTags(file)),
            ...templateFiles()
                .flatMap((file) => includedPartials(readFileSync(file, 'utf8')))
                .map((relative) => path.resolve(TEMPLATES_DIR, relative))
                .flatMap((file) => unsupportedTags(file))
        ];

        expect(unsupported).toEqual([]);
    });

    it('gives every template a builder to check it against', () => {
        const supplied = builderDataKeys();
        const orphaned = templateFiles()
            .map((file) => path.basename(file, '.ejs'))
            .filter((name) => !supplied.has(name))
            .map((name) => `${name}.ejs: no builder returns { template: '${name}' }`);

        expect(orphaned).toEqual([]);
    });

    it('gives every template a value for every variable it prints', () => {
        const supplied = builderDataKeys();
        const missing = templateFiles().flatMap((file) => {
            const name = path.basename(file, '.ejs');
            const keys = new Set(supplied.get(name));
            return [...requiredVariables(file)]
                .filter((variable) => !keys.has(variable))
                .map((variable) => `${name}.ejs prints ${variable}, which its builder never sets`);
        });

        expect(missing).toEqual([]);
    });
});
