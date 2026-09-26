/* ============================================================
   RPG SCENE CARD — REAL TIME & REAL WEATHER
   ------------------------------------------------------------
   The second mode of the card: instead of an in-world date invented by the
   secondary model, the card (and the character, through the injection) gets
   the actual date and time from this device and the actual weather outside.

   Time   — the device clock, in the device's own time zone. No network.
   Weather — Open-Meteo (open-meteo.com): free for non-commercial use, no key,
             worldwide, answers browser requests directly, city search in many
             languages. Data under CC BY 4.0 — the settings panel credits it.

   Everything here is read-only and self-contained. The story mode of the card
   never calls into this file.
   ============================================================ */

const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const WX_URL = 'https://api.open-meteo.com/v1/forecast';
const TTL_MS = 20 * 60 * 1000;          // Open-Meteo updates current data every 15 min
const TIMEOUT_MS = 8000;

/* ---------- WMO weather codes ----------
   Words chosen so the atmosphere layer (weather.js) recognises them:
   "дождь"/"rain", "снег"/"snow", "гроза"/"thunder", "туман"/"fog",
   "ясно"/"clear", "пасмурно"/"overcast", "слабый"/"light", "сильный"/"heavy". */
const WMO = {
    0: ['☀️', 'ясно', 'clear sky'],
    1: ['🌤️', 'преимущественно ясно', 'mainly clear'],
    2: ['⛅', 'переменная облачность', 'partly cloudy'],
    3: ['☁️', 'пасмурно', 'overcast'],
    45: ['🌫️', 'туман', 'fog'],
    48: ['🌫️', 'туман с изморозью', 'freezing fog'],
    51: ['🌦️', 'слабая морось', 'light drizzle'],
    53: ['🌦️', 'морось', 'drizzle'],
    55: ['🌧️', 'сильная морось', 'heavy drizzle'],
    56: ['🌧️', 'слабая ледяная морось', 'light freezing drizzle'],
    57: ['🌧️', 'ледяная морось', 'freezing drizzle'],
    61: ['🌦️', 'слабый дождь', 'light rain'],
    63: ['🌧️', 'дождь', 'rain'],
    65: ['🌧️', 'сильный дождь', 'heavy rain'],
    66: ['🌧️', 'ледяной дождь', 'light freezing rain'],
    67: ['🌧️', 'сильный ледяной дождь', 'heavy freezing rain'],
    71: ['🌨️', 'слабый снег', 'light snow'],
    73: ['🌨️', 'снег', 'snow'],
    75: ['❄️', 'сильный снег', 'heavy snow'],
    77: ['🌨️', 'снежная крупа', 'snow grains'],
    80: ['🌦️', 'слабый ливень', 'light rain showers'],
    81: ['🌧️', 'ливень', 'rain showers'],
    82: ['⛈️', 'сильный ливень', 'violent rain showers'],
    85: ['🌨️', 'слабый снегопад', 'light snow showers'],
    86: ['❄️', 'сильный снегопад', 'heavy snow showers'],
    95: ['⛈️', 'гроза', 'thunderstorm'],
    96: ['⛈️', 'гроза с градом', 'thunderstorm with hail'],
    99: ['⛈️', 'сильная гроза с градом', 'thunderstorm with heavy hail'],
};

function signed(n) {
    const v = Math.round(Number(n));
    if (!Number.isFinite(v)) return '';
    return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v);
}

/** One short line: emoji, words, temperature, feels-like, wind. */
export function weatherText(w, lang, units) {
    if (!w || w.code == null) return '';
    const ru = lang === 'ru';
    const row = WMO[w.code] || ['🌡️', 'погода', 'weather'];
    let emoji = row[0];
    // A clear night shows a moon, not a sun.
    if (w.isDay === 0 && (w.code === 0 || w.code === 1)) emoji = '🌙';
    const words = ru ? row[1] : row[2];
    const deg = units === 'imperial' ? '°F' : '°C';
    const windU = units === 'imperial' ? (ru ? 'миль/ч' : 'mph') : (ru ? 'м/с' : 'm/s');
    const strongWind = units === 'imperial' ? 18 : 8;
    const parts = [`${emoji} ${words}`];
    if (Number.isFinite(w.temp)) {
        let t = `${signed(w.temp)}${deg}`;
        if (Number.isFinite(w.feels) && Math.round(w.feels) !== Math.round(w.temp)) {
            t += ru ? ` (ощущается ${signed(w.feels)}°)` : ` (feels ${signed(w.feels)}°)`;
        }
        parts.push(t);
    }
    if (Number.isFinite(w.wind)) {
        const windy = w.wind >= strongWind;
        parts.push((ru ? (windy ? 'ветрено, ' : 'ветер ') : (windy ? 'windy, ' : 'wind ')) + `${Math.round(w.wind)} ${windU}`);
    }
    return parts.join(', ');
}

/* ---------- network, with a timeout so a dead connection never hangs a reply ---------- */
async function getJson(url) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), TIMEOUT_MS) : null;
    try {
        const r = await fetch(url, ctl ? { signal: ctl.signal } : undefined);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return await r.json();
    } finally { if (timer) clearTimeout(timer); }
}

/** City search. Returns [{ name, admin, country, lat, lon, tz }]. */
export async function geocode(query, lang) {
    const q = String(query || '').trim();
    if (!q) return [];
    const url = `${GEO_URL}?name=${encodeURIComponent(q)}&count=6&language=${lang === 'ru' ? 'ru' : 'en'}&format=json`;
    const data = await getJson(url);
    return (Array.isArray(data?.results) ? data.results : []).map(r => ({
        name: r.name, admin: r.admin1 || '', country: r.country || '',
        lat: Number(r.latitude), lon: Number(r.longitude), tz: r.timezone || '',
    })).filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lon));
}

export function placeLabel(c) {
    if (!c) return '';
    return [c.name, c.admin && c.admin !== c.name ? c.admin : '', c.country].filter(Boolean).join(', ');
}

/** Current conditions at a point. */
export async function fetchWeather(place, units) {
    const imp = units === 'imperial';
    const url = `${WX_URL}?latitude=${place.lat}&longitude=${place.lon}`
        + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day'
        + `&wind_speed_unit=${imp ? 'mph' : 'ms'}&temperature_unit=${imp ? 'fahrenheit' : 'celsius'}&timezone=auto`;
    const data = await getJson(url);
    const c = data?.current;
    if (!c || c.weather_code == null) throw new Error('No current weather in the answer');
    return {
        code: Number(c.weather_code), isDay: Number(c.is_day),
        temp: Number(c.temperature_2m), feels: Number(c.apparent_temperature),
        wind: Number(c.wind_speed_10m), humidity: Number(c.relative_humidity_2m),
        at: Date.now(),
    };
}

/* ---------- the sky at a past moment ----------
   A card redrawn for an old message used to get the old message's date but
   TODAY's weather. Open-Meteo keeps the last months hour by hour, so the card
   can show the weather as it really was when that message was written. */
function ymdUTC(ms) { return new Date(ms).toISOString().slice(0, 10); }
const pastCache = new Map();     // "lat,lon,units,YYYY-MM-DDTHH" → weather
export async function getWeatherAt(place, units, ts) {
    if (!place || !Number.isFinite(ts)) return null;
    const age = Date.now() - ts;
    if (age < 60 * 60 * 1000) return getWeather(place, units);          // that is "now"
    if (age > 90 * 86400 * 1000) return null;                           // beyond what the service keeps
    const hourKey = `${cacheKey(place, units)},${new Date(ts).toISOString().slice(0, 13)}`;
    if (pastCache.has(hourKey)) return pastCache.get(hourKey);
    const imp = units === 'imperial';
    const day = ymdUTC(ts);
    const url = `${WX_URL}?latitude=${place.lat}&longitude=${place.lon}`
        + '&hourly=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day'
        + `&start_date=${day}&end_date=${day}&timezone=GMT&timeformat=unixtime`
        + `&wind_speed_unit=${imp ? 'mph' : 'ms'}&temperature_unit=${imp ? 'fahrenheit' : 'celsius'}`;
    try {
        const data = await getJson(url);
        const h = data?.hourly;
        const times = Array.isArray(h?.time) ? h.time : [];
        if (!times.length) return null;
        let best = 0;
        for (let i = 1; i < times.length; i++) {
            if (Math.abs(times[i] * 1000 - ts) < Math.abs(times[best] * 1000 - ts)) best = i;
        }
        const w = {
            code: Number(h.weather_code[best]), isDay: Number(h.is_day[best]),
            temp: Number(h.temperature_2m[best]), feels: Number(h.apparent_temperature[best]),
            wind: Number(h.wind_speed_10m[best]), at: times[best] * 1000, past: true,
        };
        if (!Number.isFinite(w.code)) return null;
        pastCache.set(hourKey, w);
        return w;
    } catch (e) {
        console.warn('[RPG Scene Card] past weather request failed', e);
        return null;
    }
}

/* ---------- cache: one request per 20 minutes at most, never two at once ---------- */
let cache = null;          // { key, w, at }
let inflight = null;

function cacheKey(place, units) { return place ? `${place.lat.toFixed(3)},${place.lon.toFixed(3)},${units}` : ''; }

/** Weather for the chosen place, fresh enough, or the last good one if the network fails. */
export async function getWeather(place, units, force) {
    if (!place) return null;
    const key = cacheKey(place, units);
    if (!force && cache && cache.key === key && Date.now() - cache.at < TTL_MS) return cache.w;
    if (inflight && inflight.key === key) return inflight.p;
    const p = (async () => {
        try {
            const w = await fetchWeather(place, units);
            cache = { key, w, at: Date.now() };
            return w;
        } catch (e) {
            console.warn('[RPG Scene Card] weather request failed', e);
            // Better an hour-old sky than none; older than 3 h is no longer "now".
            return (cache && cache.key === key && Date.now() - cache.at < 3 * 3600 * 1000) ? cache.w : null;
        } finally { inflight = null; }
    })();
    inflight = { key, p };
    return p;
}
/** Whatever is cached, without touching the network. */
export function cachedWeather(place, units) {
    if (!place || !cache || cache.key !== cacheKey(place, units)) return null;
    return Date.now() - cache.at < 3 * 3600 * 1000 ? cache.w : null;
}
export function _resetWeatherCache() { cache = null; inflight = null; pastCache.clear(); }

/* ---------- the device clock ---------- */
/** Local calendar day as a number that only ever grows: days since 1970 in local time.
    The Diary compares "day" numbers to notice a new day; the day of the month would
    go backwards on the 1st. */
export function localDayNumber(d) {
    const x = d || new Date();
    return Math.floor((x.getTime() - x.getTimezoneOffset() * 60000) / 86400000);
}

export function nowParts(lang, d) {
    const x = d || new Date();
    const loc = lang === 'ru' ? 'ru-RU' : 'en-US';
    let date;
    try { date = x.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
    catch (e) { date = x.toDateString(); }
    // "суббота, 26 сентября 2026 г." — the trailing "г." is noise on a card
    date = date.replace(/\s?г\.$/, '');
    if (lang === 'ru') date = date.charAt(0).toUpperCase() + date.slice(1);
    const p = (n) => String(n).padStart(2, '0');
    const time = `${p(x.getHours())}:${p(x.getMinutes())}`;
    return { date, time, day: localDayNumber(x) };
}

/** "3 ч 12 мин" / "3 h 12 min"; days when it is long. */
export function formatGap(ms, lang) {
    const ru = lang === 'ru';
    const min = Math.max(0, Math.round(ms / 60000));
    const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
    const out = [];
    if (d) out.push(ru ? `${d} д` : `${d} d`);
    if (h) out.push(ru ? `${h} ч` : `${h} h`);
    if (!d && m) out.push(ru ? `${m} мин` : `${m} min`);
    return out.join(' ') || (ru ? 'меньше минуты' : 'under a minute');
}
