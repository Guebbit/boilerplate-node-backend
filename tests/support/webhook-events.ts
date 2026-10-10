/*
 * Relative imports only, like `paths.ts`: reads the contract fragments by hand, never the app.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { MODULES_ROOT } from './paths';

/** One module's webhook-event fragment path; the file may not exist. */
const fragmentOf = (moduleName: string): string =>
    path.join(MODULES_ROOT, moduleName, 'asyncapi.webhooks.yaml');

/** Every module folder in this checkout. */
const deployedModules = (): string[] =>
    readdirSync(MODULES_ROOT, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);

/**
 * Every webhook event the named modules declare, read straight from their
 * `asyncapi.webhooks.yaml` fragments. A test names no event by hand: delete a module and its
 * events leave the expectation with it, the way they leave the contract.
 *
 * @param moduleNames - which modules to read; defaults to every module folder in this checkout
 * @returns the channel names, sorted
 */
export const declaredWebhookEvents = (
    moduleNames: readonly string[] = deployedModules()
): string[] =>
    moduleNames
        .map((name) => fragmentOf(name))
        .filter((file) => existsSync(file))
        .flatMap((file) => {
            // `yaml.parse`: https://eemeli.org/yaml/#parse — a plain object back.
            const document = parse(readFileSync(file, 'utf8')) as {
                channels?: Record<string, unknown>;
            };
            return Object.keys(document.channels ?? {});
        })
        .toSorted();
