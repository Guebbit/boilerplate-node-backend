/**
 * The module registry.
 *
 * A module is a value, not a convention: everything it needs the application to do *for* it is
 * declared in one typed object, so "what does this domain touch" is answerable by reading one file
 * rather than grepping ten. `src/modules.ts` lists the enabled modules; this file is what turns
 * that list into a running application.
 *
 * The registry deliberately does not discover modules from the filesystem. An explicit list is the
 * honest answer to "what is in this build?", it stays statically typed, and enabling or disabling a
 * domain is a one-line edit rather than a folder move.
 */

import type { Router } from 'express';
import type { TSeedOutcome } from '@infrastructure/persistence/seed';

/** What every module declares, whether or not it serves HTTP. */
interface IAppModuleCommon {
    /** Registry identity. Must match the folder name under `src/modules/`. */
    name: string;

    /**
     * Names of modules this one imports from. Declared rather than inferred, because the point is
     * to fail at boot with a sentence instead of at the first request with a 500.
     *
     * This must stay a DAG. Two modules that each need the other are not a dependency pair — they
     * are one module, or they communicate through domain events. See `kernel/events.ts`.
     */
    dependsOn?: string[];

    /**
     * Attach this module's domain-event handlers. Called once at boot, after every module is known
     * and validated, so a handler may safely reference any module it declared in `dependsOn`.
     */
    subscribe?: () => void;

    /**
     * Absolute path to this module's `locales/` directory, holding one `<locale>.json` per
     * language it contributes.
     *
     * A path rather than the loaded dictionaries, so a module never enumerates the languages: the
     * supported list is decided by the deployment (`NODE_SUPPORTED_LOCALES`, or the shared
     * directory's contents), and a module simply supplies whichever of them it has a file for.
     * `app.ts` hands these to `registerLocaleDirectories` before `i18next.init()`.
     */
    locales?: string;

    /**
     * Write this module's slice of the demo dataset. Called only by `db/seeds/index.ts`, never at
     * boot — seeding is a script, not part of starting the application.
     *
     * Declared here so the seeder can run without naming a domain: it walks `enabledModules` and
     * calls whatever it finds. A module with no demo data simply omits it.
     */
    seeds?: () => Promise<TSeedOutcome[]>;
}

/** A module that serves HTTP. `basePath` and `routes` are meaningless apart, so they arrive together. */
interface IRoutedModule extends IAppModuleCommon {
    /** Mount point for `routes`, e.g. `/products`. */
    basePath: string;

    /** The domain's express router, mounted at `basePath`. */
    routes: Router;
}

/**
 * A module that owns a collection but no URL — `audit-logs` writes and reads the audit trail, and
 * the endpoint that exposes it belongs to `observability`.
 *
 * The `never`s are what make this a real alternative rather than two optional fields: declaring a
 * router without a mount point, or a mount point with nothing to mount, is a type error at the
 * manifest rather than a route that silently never registers.
 */
interface IHeadlessModule extends IAppModuleCommon {
    basePath?: never;
    routes?: never;
}

/**
 * Everything a module declares about itself.
 *
 * Keep this small. A field that only one module ever fills does not belong here — that module
 * should do the thing itself, behind its own barrel. The cost of a wide manifest is that every
 * module has to be read against it to know which half applies.
 */
export type IAppModule = IRoutedModule | IHeadlessModule;

/**
 * Reject duplicate names, unknown dependencies and dependency cycles.
 *
 * Runs before anything is mounted: a misconfigured registry should stop the boot, not degrade the
 * running server. The cycle walk is an iterative depth-first search with an explicit "in progress"
 * set, which reports the offending path rather than just the fact of a cycle.
 *
 * @param appModules - the enabled module list, in registration order
 */
export const validateModules = (appModules: IAppModule[]): void => {
    const byName = new Map<string, IAppModule>();

    // Pass 1 — index by name, rejecting a duplicate registration on the way.
    for (const appModule of appModules) {
        if (byName.has(appModule.name))
            throw new Error(`Module "${appModule.name}" is registered twice in src/modules.ts`);
        byName.set(appModule.name, appModule);
    }

    // Pass 2 — every named dependency must be enabled, checked before the walk needs it.
    for (const appModule of appModules)
        for (const dependency of appModule.dependsOn ?? [])
            if (!byName.has(dependency))
                throw new Error(
                    `Module "${appModule.name}" depends on "${dependency}", which is not enabled. ` +
                        `Add it to src/modules.ts or drop the dependency.`
                );

    // `settled` is proven acyclic; `walking` is the current path, so a hit on it IS the cycle.
    const settled = new Set<string>();
    const walking = new Set<string>();

    // Depth-first, carrying `trail` so the error can print the path rather than just assert one.
    const walk = (name: string, trail: string[]): void => {
        if (settled.has(name)) return;
        if (walking.has(name))
            throw new Error(
                `Module dependency cycle: ${[...trail, name].join(' → ')}. ` +
                    `Sibling communication that is not a straight dependency belongs in a domain ` +
                    `event, not an import.`
            );

        walking.add(name);
        for (const dependency of byName.get(name)?.dependsOn ?? [])
            walk(dependency, [...trail, name]);
        // Off the current path, onto the settled set: this subtree is clean.
        walking.delete(name);
        settled.add(name);
    };

    // Every module is a possible root — a disconnected pair still has to be checked.
    for (const appModule of appModules) walk(appModule.name, []);
};

/**
 * Validate the registry, then let every module attach its domain-event handlers.
 *
 * Subscription is separated from mounting because a handler may fire for an event another module
 * emits while serving a request, so every subscription has to exist before the first route does.
 *
 * @param appModules - the enabled module list
 */
export const registerModules = (appModules: IAppModule[]): void => {
    validateModules(appModules);
    // After validation, so a handler may safely reach any sibling it declared in `dependsOn`.
    for (const appModule of appModules) appModule.subscribe?.();
};
