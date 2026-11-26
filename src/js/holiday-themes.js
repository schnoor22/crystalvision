/**
 * First Light Window Cleaning — Holiday theme registry
 *
 * Pure data and date logic, shared by the public site and the admin panel.
 * To add a holiday, add one entry to THEMES. Nothing else needs to change.
 *
 * Each theme:
 *   id        used in the admin setting and in ?holiday=<id> previews
 *   name      shown in the admin panel
 *   greeting  short line shown in the hero pill and the footer
 *   icon      Phosphor "fill" icon name (without the ph- prefix)
 *   window    (year) => [firstDay, lastDay], inclusive, as day numbers.
 *             The window may run into the next year (see New Year's).
 *   colors    three accent colours [a, b, c] used for thin lines and glows
 *   particles kind: 'snow' | 'motes' | 'twinkle', count at a 1440px wide
 *             hero, and the colours to pick from
 *
 * All dates are evaluated in Hawaii time, where the business is.
 */

const MS_PER_DAY = 864e5;

// Calendar date -> whole day number (timezone-free)
const day = (y, m, d) => Date.UTC(y, m - 1, d) / MS_PER_DAY;

// Fourth Thursday of November
function thanksgivingDay(y) {
  const firstWeekday = new Date(Date.UTC(y, 10, 1)).getUTCDay();
  return day(y, 11, 1 + ((4 - firstWeekday + 7) % 7) + 21);
}

export const THEMES = [
  {
    id: 'thanksgiving',
    name: 'Thanksgiving',
    greeting: 'Mahalo & Happy Thanksgiving',
    icon: 'leaf',
    window: (y) => [thanksgivingDay(y) - 7, thanksgivingDay(y)],
    colors: ['#F2B263', '#F7976F', '#C8742B'],
    particles: { kind: 'motes', count: 26, colors: ['#F6C88E', '#F7976F', '#FFE1B0'] },
  },
  {
    id: 'christmas',
    name: 'Christmas',
    greeting: 'Mele Kalikimaka',
    icon: 'tree-evergreen',
    window: (y) => [thanksgivingDay(y) + 1, day(y, 12, 26)],
    colors: ['#58B98A', '#F6C88E', '#E8453C'],
    particles: { kind: 'snow', count: 40, colors: ['#FFFFFF', '#FFFFFF', '#EAF2FF', '#FDEBDD'] },
  },
  {
    id: 'newyear',
    name: "New Year's",
    greeting: 'Hauʻoli Makahiki Hou · Happy New Year',
    icon: 'sparkle',
    window: (y) => [day(y, 12, 27), day(y + 1, 1, 2)],
    colors: ['#F6C88E', '#FFFFFF', '#6AA0DC'],
    particles: { kind: 'twinkle', count: 30, colors: ['#FFE1B0', '#FFFFFF', '#F6C88E', '#A3C4EC'] },
  },
  {
    id: 'valentines',
    name: "Valentine's Day",
    greeting: "Happy Valentine's Day",
    icon: 'heart',
    window: (y) => [day(y, 2, 7), day(y, 2, 14)],
    colors: ['#F58BA6', '#F7976F', '#E8453C'],
    particles: { kind: 'motes', count: 22, colors: ['#F9B4C6', '#F58BA6', '#FDEBDD'] },
  },
  {
    id: 'july4',
    name: '4th of July',
    greeting: 'Happy 4th of July',
    icon: 'star',
    window: (y) => [day(y, 6, 27), day(y, 7, 4)],
    colors: ['#E8453C', '#FFFFFF', '#3F82C7'],
    particles: { kind: 'twinkle', count: 28, colors: ['#FFFFFF', '#F7976F', '#6AA0DC'] },
  },
  {
    id: 'halloween',
    name: 'Halloween',
    greeting: 'Happy Halloween',
    icon: 'ghost',
    window: (y) => [day(y, 10, 17), day(y, 10, 31)],
    colors: ['#F28A3D', '#B58CE0', '#F26A3D'],
    particles: { kind: 'motes', count: 22, colors: ['#F7976F', '#F28A3D', '#C9A6EC'] },
  },
];

export const MODE_AUTO = 'auto';
export const MODE_OFF = 'off';

export function getTheme(id) {
  return THEMES.find((t) => t.id === id) || null;
}

// Today's calendar date in Hawaii, as { y, m, d }
export function hawaiiToday(now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Pacific/Honolulu', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const get = (type) => Number(parts.find((p) => p.type === type).value);
    return { y: get('year'), m: get('month'), d: get('day') };
  } catch {
    return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
  }
}

// Which theme the calendar says is on for the given date (default: today in Hawaii)
export function themeForDate(date = hawaiiToday()) {
  const today = day(date.y, date.m, date.d);
  for (const theme of THEMES) {
    // A window that started last year can still be running (New Year's)
    for (const y of [date.y - 1, date.y]) {
      const [start, end] = theme.window(y);
      if (today >= start && today <= end) return theme;
    }
  }
  return null;
}

/**
 * Turn the saved admin setting into a theme (or null for none).
 * mode: 'auto' (follow the calendar), 'off', or a theme id (always on).
 */
export function resolveTheme(mode, date) {
  if (mode === MODE_OFF) return null;
  if (mode && mode !== MODE_AUTO) return getTheme(mode);
  return themeForDate(date);
}

export function isValidMode(mode) {
  return mode === MODE_AUTO || mode === MODE_OFF || !!getTheme(mode);
}

// The current or next window for each theme, for the admin schedule
export function upcomingSchedule(date = hawaiiToday()) {
  const today = day(date.y, date.m, date.d);
  const fmt = (n) => new Date(n * MS_PER_DAY).toLocaleDateString('en-US', {
    timeZone: 'UTC', month: 'short', day: 'numeric',
  });
  return THEMES.map((theme) => {
    let win = null;
    for (const y of [date.y - 1, date.y, date.y + 1]) {
      const w = theme.window(y);
      if (w[1] >= today) { win = w; break; }
    }
    const [start, end] = win;
    return {
      id: theme.id,
      name: theme.name,
      greeting: theme.greeting,
      dates: `${fmt(start)} to ${fmt(end)}`,
      activeNow: today >= start && today <= end,
      start,
    };
  });
}
