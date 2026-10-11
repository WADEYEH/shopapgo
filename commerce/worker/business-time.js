// The back office's calendar (M9 首页, D50): "today", "this month" and "this week" are the team's days, in Taiwan time
// unless ADMIN_TIME_ZONE says otherwise (the daily summary goes out at 08:00 there too). Times stay ISO UTC in the
// database; only these boundaries are local.
const DAY_MS = 24 * 60 * 60_000;
export const DEFAULT_TIME_ZONE = "Asia/Taipei";

export function timeZoneOf(env = {}) {
  const zone = String(env.ADMIN_TIME_ZONE ?? "").trim();
  if (!zone) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

// The zone's calendar date and offset from UTC at an instant.
function local(ms, zone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(ms))
      .map((part) => [part.type, part.value]),
  );
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const asUtc = Date.UTC(year, month - 1, day, Number(parts.hour), Number(parts.minute), Number(parts.second));
  return { year, month, day, offset: asUtc - Math.floor(ms / 1000) * 1000 };
}

const midnight = (zone, year, month, day) => {
  const guess = Date.UTC(year, month - 1, day);
  return guess - local(guess, zone).offset;
};

// { today, week (Monday), month, dayKey(ms) } as UTC milliseconds of the local midnights.
export function calendar(env, nowMs = Date.now()) {
  const zone = timeZoneOf(env);
  const { year, month, day } = local(nowMs, zone);
  const today = midnight(zone, year, month, day);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sunday
  return {
    zone,
    today,
    week: today - ((weekday + 6) % 7) * DAY_MS,
    month: midnight(zone, year, month, 1),
    // The local calendar day of an instant, "YYYY-MM-DD".
    dayKey: (ms) => {
      const d = local(ms, zone);
      return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
    },
  };
}

export const DAY = DAY_MS;
