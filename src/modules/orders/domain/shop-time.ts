/**
 * @module
 * Calendar maths in the shop's own time zone. Pure: the zone is an argument, so the unit suite
 * needs no environment, and the one place `Intl` is asked about a year is here.
 */

/**
 * The calendar year an instant falls in, on the wall clock of `timeZone`.
 *
 * Why not `getUTCFullYear()`: 00:30 on 1 January in Rome is still 31 December in UTC, and a
 * yearly number series must follow the shop's calendar, not the server's.
 * @param instant - the moment
 * @param timeZone - canonical IANA zone name, e.g. `Europe/Rome`
 * @returns the four-digit year
 */
export const yearInZone = (instant: Date, timeZone: string): number => {
    // Intl: `en` + `numeric` year gives a bare Gregorian number whatever the host locale.
    // https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat
    const year = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', calendar: 'gregory' })
        .formatToParts(instant)
        .find((part) => part.type === 'year');
    return Number(year?.value);
};
