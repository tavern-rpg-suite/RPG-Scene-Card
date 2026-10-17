/* ============================================================
   RPG SCENE CARD — MIDNIGHT (1.5.5)
   ------------------------------------------------------------
   The continuity rule tells the model to keep the date of the previous card
   unless "a new day clearly passes". Crossing midnight is rarely clear enough
   for it: Saturday 23:55 → 00:00 → 00:05 stayed Saturday, and everything that
   follows the day (the diary's new-day entry, the map's routines) never knew.

   This file only looks at what the model returned, next to the previous card:
   if the clock went past midnight and the date did not move, the date moves by
   one day — day, month and year by the calendar, the weekday to the next one (the
   story's own week, even where it disagrees with the real calendar), in the
   language and the form it was written in. A date it cannot read (an invented calendar) is left alone.
   Nothing here talks to the model or changes the prompt.
   ============================================================ */

const WEEKDAYS = {
    en: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
    ru: ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'],
};
const MONTHS = {
    en: ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'],
    ruGen: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
    ruNom: ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'],
};
const LETTER = 'A-Za-zА-Яа-яЁё';

const lower = s => String(s || '').toLowerCase().replace(/ё/g, 'е');

/* ---------- the clock ---------- */
// "23:55 -> 00:05", "11:55 PM → 12:05 AM", "с 23:40 до 00:10" → minutes of the first and the last time
function spanOf(time) {
    const s = String(time || '');
    const re = /(\d{1,2})[:.](\d{2})(?:\s*([ap])\.?\s*m\.?)?/gi;
    const all = [];
    let m;
    while ((m = re.exec(s)) && all.length < 6) {
        let h = parseInt(m[1], 10);
        const min = parseInt(m[2], 10);
        if (h > 24 || min > 59) continue;
        const ap = m[3] && m[3].toLowerCase();
        if (ap === 'p' && h < 12) h += 12;
        if (ap === 'a' && h === 12) h = 0;
        all.push((h % 24) * 60 + min);
    }
    return all.length ? { start: all[0], end: all[all.length - 1] } : null;
}

/* Did the clock pass midnight while the date stood still?
   • the new card itself runs past it:            Sat 23:55 → 00:05
   • the previous card ran past it and was not moved on (an older card, or one
     the model wrote before this check existed):  Sat 23:55 → 00:00, then Sat 00:00 → 00:05
   • late evening, then early morning:            Sat 22:10 → 23:50, then Sat 00:20 → 00:40
   An early time after an early time, or an evening after a morning, is no midnight. */
export function crossedMidnight(prev, cur) {
    if (!prev || !cur || !prev.date || !cur.date) return false;
    if (lower(prev.date).replace(/\s+/g, ' ').trim() !== lower(cur.date).replace(/\s+/g, ' ').trim()) return false;
    const c = spanOf(cur.time);
    if (!c) return false;
    if (c.end < c.start) return true;
    const p = spanOf(prev.time);
    if (!p) return false;
    if (p.end < p.start && !prev.dayRolled) return true;
    return p.end >= 18 * 60 && c.start <= 6 * 60 && c.start < p.end;
}

/* ---------- the date, one day on ---------- */
function sameCase(word, like) {
    if (like === like.toUpperCase() && like !== like.toLowerCase()) return word.toUpperCase();
    if (like[0] === like[0].toUpperCase()) return word[0].toUpperCase() + word.slice(1);
    return word;
}
// a whole word: Cyrillic is not a \b word in JavaScript, so the edges are spelled out
function wordRe(words) {
    return new RegExp(`(^|[^${LETTER}])(${words.join('|')})(?![${LETTER}])`, 'i');
}
function findWord(s, list) {
    const m = wordRe(list).exec(s);
    if (!m) return null;
    const idx = list.indexOf(lower(m[2]));
    return idx < 0 ? null : { index: m.index + m[1].length, text: m[2], idx };
}
function replaceAt(s, at, len, by) { return s.slice(0, at) + by + s.slice(at + len); }

export function nextDay(date) {
    let s = String(date || '');
    if (!s.trim()) return null;
    const wdEn = findWord(s, WEEKDAYS.en), wdRu = findWord(s, WEEKDAYS.ru.map(lower));
    const wd = wdEn ? { ...wdEn, list: WEEKDAYS.en } : wdRu ? { ...wdRu, list: WEEKDAYS.ru } : null;
    let mon = null;
    for (const key of ['en', 'ruGen', 'ruNom']) {
        const f = findWord(s, MONTHS[key]);
        if (f) { mon = { ...f, list: MONTHS[key] }; break; }
    }
    // a full date: the day number next to the month, and a year if there is one
    if (mon) {
        const before = s.slice(Math.max(0, mon.index - 8), mon.index);
        const after = s.slice(mon.index + mon.text.length, mon.index + mon.text.length + 8);
        let dayAt = -1, dayNum = 0, dayLen = 0;
        const b = /(\d{1,2})(?:st|nd|rd|th|-?е|-?го)?\s*(?:of\s+)?$/i.exec(before);
        const a = /^\s*(\d{1,2})(?!\d)/.exec(after);
        if (b) { dayNum = +b[1]; dayLen = b[1].length; dayAt = mon.index - before.length + b.index; }
        else if (a) { dayNum = +a[1]; dayLen = a[1].length; dayAt = mon.index + mon.text.length + a.index + a[0].length - a[1].length; }
        if (dayNum >= 1 && dayNum <= 31) {
            const yearM = /(^|[^\d])(\d{3,4})(?!\d)/.exec(s.slice(mon.index));
            const yearAt = yearM ? mon.index + yearM.index + yearM[1].length : -1;
            const year = yearM ? +yearM[2] : 2001;          // no year: any non-leap year will do
            const d = new Date(Date.UTC(2000, mon.idx, dayNum));
            d.setUTCFullYear(year, mon.idx, dayNum + 1);
            const nd = d.getUTCDate(), nm = d.getUTCMonth(), ny = d.getUTCFullYear();
            // replace from the right so the earlier positions stay valid
            const edits = [];
            if (yearM && ny !== year) edits.push([yearAt, yearM[2].length, String(ny)]);
            edits.push([dayAt, dayLen, String(nd)]);
            if (nm !== mon.idx) edits.push([mon.index, mon.text.length, sameCase(mon.list[nm], mon.text)]);
            // the weekday follows the story's own, not the real calendar: if the card called
            // 11 October 1889 a Saturday, the 12th is its Sunday
            if (wd) edits.push([wd.index, wd.text.length, sameCase(wd.list[(wd.idx + 1) % 7], wd.text)]);
            edits.sort((x, y) => y[0] - x[0]).forEach(([at, len, by]) => { s = replaceAt(s, at, len, by); });
            return s;
        }
    }
    // a numeric date: 11.10.1889, 11/10/1889 (day first) or 1889-10-11
    const num = /(^|[^\d])(\d{1,2})([./])(\d{1,2})\3(\d{2,4})(?!\d)|(^|[^\d])(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/.exec(s);
    if (num) {
        const iso = !!num[7];
        const y = +(iso ? num[7] : num[5]), mo = +(iso ? num[8] : num[4]) - 1, dd = +(iso ? num[9] : num[2]);
        if (mo >= 0 && mo < 12 && dd >= 1 && dd <= 31) {
            const d = new Date(Date.UTC(2000, mo, dd));
            d.setUTCFullYear(y, mo, dd + 1);
            const pad = (v, like) => String(v).padStart(like.length, '0');
            const at = num.index + (iso ? num[6].length : num[1].length);
            const old = iso ? `${num[7]}-${num[8]}-${num[9]}` : `${num[2]}${num[3]}${num[4]}${num[3]}${num[5]}`;
            const ny = num[5] && num[5].length === 2 ? pad(d.getUTCFullYear() % 100, num[5]) : String(d.getUTCFullYear());
            const by = iso ? `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1, num[8])}-${pad(d.getUTCDate(), num[9])}`
                : `${pad(d.getUTCDate(), num[2])}${num[3]}${pad(d.getUTCMonth() + 1, num[4])}${num[3]}${ny}`;
            s = replaceAt(s, at, old.length, by);
            if (wd) s = replaceAt(s, wd.index, wd.text.length, sameCase(wd.list[(wd.idx + 1) % 7], wd.text));
            return s;
        }
    }
    // no date at all: the weekday alone moves on, and a "Day 3" / "День 3" counter
    let changed = false;
    if (wd) { s = replaceAt(s, wd.index, wd.text.length, sameCase(wd.list[(wd.idx + 1) % 7], wd.text)); changed = true; }
    const dayCount = /(^|[^A-Za-zА-Яа-яЁё])(day|день)\s*(\d{1,5})(?!\d)/i.exec(s);
    if (dayCount) {
        const at = dayCount.index + dayCount[0].length - dayCount[3].length;
        s = replaceAt(s, at, dayCount[3].length, String(+dayCount[3] + 1));
        changed = true;
    }
    return changed ? s : null;
}

/* What processMessage calls: the model's card, the card before it. Moves the date
   on and marks the card, or returns false and touches nothing. */
export function rollMidnight(prev, cur) {
    if (!prev || !cur || !cur.date) return false;
    // the day was moved on here, and the model wrote yesterday again — it copied an older
    // card; while the clock goes on from where it was, the date stays where it was moved to
    if (prev.dayRolled && prev.date && nextDay(cur.date) === prev.date) {
        const p = spanOf(prev.time), c = spanOf(cur.time);
        if (p && c && (c.start >= p.end || c.start <= 6 * 60)) { cur.date = prev.date; cur.dayRolled = true; return true; }
    }
    if (!crossedMidnight(prev, cur)) return false;
    const next = nextDay(cur.date);
    if (!next || next === cur.date) return false;
    cur.date = next;
    cur.dayRolled = true;
    return true;
}
