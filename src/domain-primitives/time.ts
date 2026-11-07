/**
 * @module
 * The one place a minute, an hour and a day are spelled, in milliseconds and in seconds.
 * Retention windows, cooldowns and lifetimes are written in terms of them, so a window reads as
 * `7 * DAY_MS` and a Mongo TTL as `days * DAY_SECONDS`. They live here, below every tier, so
 * `domain/` files can use them too. The zone-calendar helpers (the day and year of an instant in a
 * zone, a zone day's start, the end of a UTC day) sit beside them for the same reason: a rule that
 * groups by day, numbers by year, or ends a deadline at the end of a printed day, needs them
 * without importing a module.
 */

/** One minute, in milliseconds. */
export const MINUTE_MS = 60 * 1000;

/** One hour, in milliseconds. */
export const HOUR_MS = 60 * MINUTE_MS;

/** One day, in milliseconds. */
export const DAY_MS = 24 * HOUR_MS;

/** One hour, in seconds: what a Mongo `expireAfterSeconds` or an HTTP cache TTL counts in. */
export const HOUR_SECONDS = 60 * 60;

/** One day, in seconds. */
export const DAY_SECONDS = 24 * HOUR_SECONDS;

/**
 * The last millisecond of the UTC day an instant falls in.
 *
 * A deadline that is printed as a date must not fall before the end of that date, or a buyer reading
 * "until the 5th" is cut off at the 5th's first hour. Withdrawal windows and answer deadlines both
 * end this way.
 * @param instant - any moment of the day
 * @returns `23:59:59.999` UTC of that day
 */
export const endOfUtcDay = (instant: Date): Date =>
    new Date(
        Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate() + 1) - 1
    );

/**
 * The same date one calendar month later, at 00:00 UTC, clamped to that month's last day.
 *
 * This is how the EDPB counts "within one month" (Guidelines 01/2022 v2 ¶160, Reg. 1182/71):
 * 5 March runs until 5 April, 31 August until 30 September. Midnight UTC means no time zone sees
 * the deadline pass late.
 * @param instant - the moment the month starts counting from
 * @returns midnight UTC of the same day next month, or of its last day when that day is missing
 */
export const oneCalendarMonthLaterUtc = (instant: Date): Date => {
    // Date.UTC: a month of 12 rolls into the next year; day 0 of month+2 is the last day of month+1.
    const year = instant.getUTCFullYear();
    const month = instant.getUTCMonth();
    const lastDayOfNextMonth = new Date(Date.UTC(year, month + 2, 0)).getUTCDate();
    return new Date(Date.UTC(year, month + 1, Math.min(instant.getUTCDate(), lastDayOfNextMonth)));
};

/**
 * The calendar day an instant falls in, on the wall clock of `timeZone`, as `YYYY-MM-DD`.
 *
 * Why not `toISOString().slice(0, 10)`: 00:30 on the 5th in Rome is still the 4th in UTC, and a
 * day a staff member typed is the shop's day, not the server's.
 * @param instant - the moment
 * @param timeZone - canonical IANA zone name, e.g. `Europe/Rome`
 * @returns the day, sortable as text
 */
export const dayInZone = (instant: Date, timeZone: string): string => {
    // Intl: `2-digit` month and day keep the key sortable; `gregory` and `latn` pin the calendar
    // and digits; the parts come back in the host locale's order, so each is read by its type.
    // https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat
    const parts = new Intl.DateTimeFormat('en', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        calendar: 'gregory',
        numberingSystem: 'latn'
    }).formatToParts(instant);
    const field = (type: Intl.DateTimeFormatPartTypes): string =>
        parts.find((part) => part.type === type)?.value ?? '';
    return `${field('year')}-${field('month')}-${field('day')}`;
};

/**
 * The calendar year an instant falls in, on the wall clock of `timeZone`.
 *
 * Why not `getUTCFullYear()`: 00:30 on 1 January in Rome is still 31 December in UTC, and a
 * yearly number series must follow the shop's calendar, not the server's.
 * @param instant - the moment
 * @param timeZone - canonical IANA zone name, e.g. `Europe/Rome`
 * @returns the four-digit year
 */
export const yearInZone = (instant: Date, timeZone: string): number =>
    Number(dayInZone(instant, timeZone).slice(0, 4));

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
    const corrected = wall - offsetAt(guess);
    // A midnight skipped by a spring-forward has no right answer in either candidate's own
    // offset: one of them lands on the previous day. The earliest one that reads as the requested
    // day is the first instant after the gap.
    const requested = dayInZone(new Date(wall), 'UTC');
    return new Date(
        [guess, corrected]
            .toSorted((first, second) => first - second)
            .find((instant) => dayInZone(new Date(instant), timeZone) === requested) ?? corrected
    );
};

/**
 * The instant a `YYYY-MM-DD` day starts on the wall clock of `timeZone`: how a day staff typed is
 * stored. The reverse of {@link dayInZone}.
 * @param day - a plain calendar day, already checked as `format: date` by the request schema
 * @param timeZone - canonical IANA zone name
 * @returns that day's local midnight as an instant
 */
export const startOfDayInZone = (day: string, timeZone: string): Date => {
    return zonedStartOfDay(
        Number(day.slice(0, 4)),
        Number(day.slice(5, 7)),
        Number(day.slice(8, 10)),
        timeZone
    );
};
