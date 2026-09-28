/**
 * @module
 * Which file an EJS template name resolves to (SK-15) — split out of `mailer.ts` on purpose, with
 * no `ejs`/`nodemailer` import of its own: `tests/support/setup.ts` calls
 * {@link registerTemplateDirectories} from jest's `setupFiles`, which runs BEFORE a test file's
 * own `jest.mock('nodemailer', …)` is even hoisted. Importing `mailer.ts` there — pulling in a
 * REAL `nodemailer` — would hand every mocking test file an already-evaluated, un-mockable
 * module; importing this leaf instead cannot.
 */

import path from 'node:path';
import { readdirSync } from 'node:fs';

/** Every collected template's absolute path, keyed by name without `.ejs` — see {@link registerTemplateDirectories}. */
let collectedTemplates: Record<string, string> = {};

/**
 * Collect every enabled module's own EJS templates into one name → path lookup.
 *
 * The template NAME still travels through RabbitMQ to a consumer that may be another process —
 * see `EmailJobPayload` — so a bare filename stays the wire format; only WHERE that filename
 * lives on disk moved, from one shared directory into the module that owns it. Every process that
 * could drain the queue boots the full module list (`app/workers.ts` runs in the same process as
 * `app.ts`), so each one collects the identical map from the identical manifests.
 *
 * Called once at boot, from `app.ts` right beside `bootI18n` — before the first request or queue
 * job that could resolve a name against it.
 *
 * @param directories - absolute paths, each expected to hold `<name>.ejs` files — a module's own
 *   `AppModule.templates`, collected by `enabledModuleTemplateDirectories`
 * @throws {Error} when two directories declare the same template name
 */
export const registerTemplateDirectories = (directories: readonly string[]): void => {
    const collected: Record<string, string> = {};

    for (const directory of directories)
        for (const entry of readdirSync(directory)) {
            if (!entry.endsWith('.ejs')) continue;
            const name = entry.slice(0, -'.ejs'.length);
            if (Object.hasOwn(collected, name))
                throw new Error(`[templates] two modules declare the template "${name}".`);
            collected[name] = path.join(directory, entry);
        }

    collectedTemplates = collected;
};

/**
 * Absolute path to a single flat override directory, when a deployment sets
 * `NODE_EMAIL_TEMPLATES_DIR` — the escape hatch for a project that forks this template set
 * wholesale, kept working exactly as before templates were collected per module.
 */
const overrideTemplatesDirectory = (): string | undefined =>
    process.env.NODE_EMAIL_TEMPLATES_DIR
        ? path.resolve(process.env.NODE_EMAIL_TEMPLATES_DIR)
        : undefined;

/**
 * The file an outbox name renders from.
 *
 * The single point where the identifier becomes a path, and so the single place `.ejs` is written.
 * Which engine renders a mail is this backend's business; the name is not, because the demo outbox
 * publishes it and the paired frontend asserts on it against both backends.
 *
 * @param templateName - an `EmailContent.template` name, without extension
 * @throws {Error} when no override directory is set and the name is not one
 *   {@link registerTemplateDirectories} collected — a module deleted without deleting the name
 *   that referenced its template, say
 */
export const templateFile = (templateName: string): string => {
    const override = overrideTemplatesDirectory();
    if (override) return path.resolve(override, `${templateName}.ejs`);

    const file = collectedTemplates[templateName];
    if (!file)
        throw new Error(
            `[templates] "${templateName}" is not a registered template — check the owning module's AppModule.templates.`
        );
    return file;
};

/**
 * Every name {@link registerTemplateDirectories} collected — what a test walks to render each
 * template this build ships, without also hand-maintaining the list `mailer-templates.test.ts`
 * checks it against.
 */
export const registeredTemplateNames = (): string[] => Object.keys(collectedTemplates);
