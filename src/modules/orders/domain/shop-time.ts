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

/**
 * The wall-clock digits of an instant in a zone, read as if they were UTC. The difference between
 * the two is the zone's offset at that instant, DST included.
 * @param instant - the moment
 * @param timeZone - canonical IANA zone name
 */
const wallClockAsUtc = (instant: Date, timeZone: string): number => {
    // Intl: `h23` keeps midnight as 00 (not 24); `latn` and `gregory` pin the digits and calendar.
    const parts = new Intl.DateTimeFormat('en', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        calendar: 'gregory',
        numberingSystem: 'latn'
    }).formatToParts(instant);
    const field = (type: Intl.DateTimeFormatPartTypes): number =>
        Number(parts.find((part) => part.type === type)?.value);
    return Date.UTC(
        field('year'),
        field('month') - 1,
        field('day'),
        field('hour'),
        field('minute'),
        field('second')
    );
};

/**
 * The instant a calendar day starts on the shop's wall clock: local midnight.
 *
 * The offset is read twice, once at the UTC guess and once at the corrected instant, so a day
 * whose midnight sits on the far side of a DST change still lands on the right one. A midnight
 * that does not exist (a zone that springs forward AT midnight) lands on the first instant after
 * the gap.
 *
 * @param year - the year
 * @param month - 1 to 12
 * @param day - the day of the month
 * @param timeZone - canonical IANA zone name
 * @returns the instant of that day's first moment in the zone
 */
export const zonedStartOfDay = (
    year: number,
    month: number,
    day: number,
    timeZone: string
): Date => {
    const wall = Date.UTC(year, month - 1, day);
    const offsetAt = (instant: number): number =>
        wallClockAsUtc(new Date(instant), timeZone) - Math.floor(instant / 1000) * 1000;
    const guess = wall - offsetAt(wall);
    return new Date(wall - offsetAt(guess));
};
