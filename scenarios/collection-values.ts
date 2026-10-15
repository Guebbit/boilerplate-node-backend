/**
 * @module
 * The shape of one module's contribution to the generated API client collections' example values
 * (`scripts/contracts/client-collections-bundle.ts`). The bundler scans `scenarios/values/<module>.ts`
 * and merges what each exports as `collectionValues`, so a module's values live beside its other
 * fixtures and leave with it — nothing central names them.
 */

/** What a module says about the request values only it can know. */
export interface CollectionValues {
    /** Property name → a value to put there, wherever a generated body or query carries it. */
    byProperty?: Readonly<Record<string, string | number | boolean>>;

    /** `{{token}}` names a probe may use, and what each resolves to. */
    tokens?: Readonly<Record<string, string>>;

    /**
     * A path parameter's value, or `undefined` when this module has no opinion.
     * @param name - the parameter's name
     * @param template - the path it appears in
     */
    pathParam?: (name: string, template: string) => string | undefined;
}
