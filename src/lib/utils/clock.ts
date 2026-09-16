/**
 * Clock helpers.
 *
 * React's compiler rules treat `Date.now()` / `new Date()` as impure calls
 * during render. Wrapping them keeps the intent explicit and lets server
 * components read the clock without tripping those rules.
 */

export function currentTimeMs(): number {
  return Date.now();
}

export function currentDate(): Date {
  return new Date();
}
