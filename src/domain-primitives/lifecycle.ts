/**
 * @module
 * A module's lifecycle as a pure event table: named events, each with the statuses it may start
 * from, the one it lands on, and (when it matters) who may make it.
 *
 * Why events, not a status → statuses map: it is the shape Solidus and Symfony Workflow use, and
 * it maps 1:1 onto Google AIP-216's one-verb-per-transition. The table stays TypeScript; the
 * contract carries only the status enum and the `actions` flags.
 *
 * See: docs/theory/tactical-ddd.md#deciding-and-enforcing-stay-separate
 */

/** One named move: where it may start, where it lands, who may make it. */
export interface LifecycleEvent<TStatus extends string, TActor extends string = never> {
    /** The statuses the event may start from. */
    readonly from: readonly TStatus[];
    /** The status the event leaves the thing in. Never one of its own `from`. */
    readonly to: TStatus;
    /** Who may make it. Absent means the table does not say (the caller's keys decide). */
    readonly actors?: readonly TActor[];
}

/** The table `defineLifecycle` reads. */
export interface LifecycleTable<
    TStatus extends string,
    TEvent extends string,
    TActor extends string = never
> {
    /** The status every new thing starts at. */
    readonly initial: TStatus;
    /** The events, by name. */
    readonly events: Readonly<Record<TEvent, LifecycleEvent<TStatus, TActor>>>;
}

/** The questions a lifecycle answers. */
export interface Lifecycle<
    TStatus extends string,
    TEvent extends string,
    TActor extends string = never
> {
    /** The status every new thing starts at. */
    readonly initial: TStatus;
    /** Whether `event` may be taken from `status` (and by `actor`, when one is given). */
    allows: (event: TEvent, status: TStatus, actor?: TActor) => boolean;
    /** The statuses `event` may start from, e.g. a conditional write's `from` set. */
    fromOf: (event: TEvent) => readonly TStatus[];
    /** The status `event` lands on. */
    toOf: (event: TEvent) => TStatus;
    /** The events that may be taken from `status`, in table order. */
    eventsFrom: (status: TStatus, actor?: TActor) => readonly TEvent[];
    /** The statuses one event from `status` can reach, without repeats, in table order. */
    reachableFrom: (status: TStatus, actor?: TActor) => readonly TStatus[];
    /** Whether some event moves `from` to `to`. Staying where it is is never a move. */
    canTransition: (from: TStatus, to: TStatus, actor?: TActor) => boolean;
}

/**
 * Build a lifecycle from its event table, refusing a table that cannot be right.
 *
 * @param statuses - every real status, e.g. `Object.values(ExampleStatus)`
 * @param table - the initial status and the events
 * @returns the lifecycle's questions
 * @throws {Error} when a status is unknown, an event has no `from`, or an event lands inside its own `from`
 */
export const defineLifecycle = <
    TStatus extends string,
    TEvent extends string,
    TActor extends string = never
>(
    statuses: readonly TStatus[],
    table: LifecycleTable<TStatus, TEvent, TActor>
): Lifecycle<TStatus, TEvent, TActor> => {
    const known = new Set<string>(statuses);
    // `Object.keys` widens to string[]; the keys of `table.events` ARE the TEvent names. Event names
    // are unique by construction: they are object keys.
    const names = Object.keys(table.events) as TEvent[];
    const eventOf = (name: TEvent): LifecycleEvent<TStatus, TActor> => table.events[name];

    if (!known.has(table.initial)) throw new Error(`lifecycle: unknown initial "${table.initial}"`);
    for (const name of names) {
        const { from, to } = eventOf(name);
        if (from.length === 0) throw new Error(`lifecycle: "${name}" has no from`);
        for (const status of [...from, to])
            if (!known.has(status))
                throw new Error(`lifecycle: "${name}" names unknown "${status}"`);
        // The self-move stays illegal by construction.
        if (from.includes(to)) throw new Error(`lifecycle: "${name}" lands inside its own from`);
    }

    /** Whether the actor (absent: anyone) may make the event. */
    const actorMay = (name: TEvent, actor: TActor | undefined): boolean => {
        const { actors } = eventOf(name);
        return actor === undefined || actors === undefined || actors.includes(actor);
    };
    const allows = (event: TEvent, status: TStatus, actor?: TActor): boolean =>
        eventOf(event).from.includes(status) && actorMay(event, actor);
    const eventsFrom = (status: TStatus, actor?: TActor): readonly TEvent[] =>
        names.filter((name) => allows(name, status, actor));

    return {
        initial: table.initial,
        allows,
        fromOf: (event) => eventOf(event).from,
        toOf: (event) => eventOf(event).to,
        eventsFrom,
        reachableFrom: (status, actor) => [
            ...new Set(eventsFrom(status, actor).map((name) => eventOf(name).to))
        ],
        canTransition: (from, to, actor) =>
            eventsFrom(from, actor).some((name) => eventOf(name).to === to)
    };
};
