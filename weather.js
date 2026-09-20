/* ============================================================
   RPG SCENE CARD — WEATHER
   ------------------------------------------------------------
   The card already knows the weather, the time and the place. This turns
   those three strings into an atmosphere layer over the chat:

       weather  → rain / storm / snow / fog / clear
       time     → dawn / day / dusk / night (colour of the light)
       location → indoors or out, and a mood theme (gothic, tavern, …)

   Drops, flakes, gusts and embers are DOM elements on CSS animations, so the
   compositor carries them and the main thread stays free; light, fog and
   vignette are layers underneath. Nothing is parsed twice: a signature of the
   state decides whether anything is rebuilt at all.

   Written for this extension. No code taken from other weather add-ons.
   ============================================================ */

const LAYER_ID = 'rsc-wx';

/* ---------- reading the card ---------- */
const RX = {
    storm: /(storm|thunder|lightning|гроз|шторм|бур[яею])|⛈|🌩/i,
    rain: /(rain|drizzle|shower|downpour|дожд|ливен|морос)|🌧|🌦|☔/i,
    snow: /(snow|blizzard|sleet|flurr|снег|метел|пург|вьюг)|❄|🌨|☃/i,
    fog: /(fog|mist|haze|smog|туман|мгл|дымк)|🌫/i,
    clear: /(clear|sunny|bright|ясн|солнеч|безоблач)|☀|🌞|🌤/i,
    cloud: /(cloud|overcast|облач|пасмур|туч)|☁|🌥/i,
    windy: /(wind|gale|gust|ветер|ветрен|порыв)|💨/i,
    heavy: /(heavy|hard|pouring|torrential|сильн|проливн|густ)/i,
    light: /(light|slight|soft|gentle|слаб|лёгк|легк|мелк)/i,
    night: /(night|midnight|ноч|полноч)|🌙|🌃/i,
    dawn: /(dawn|sunrise|morning|рассвет|утр)|🌅/i,
    dusk: /(dusk|sunset|evening|twilight|закат|вечер|сумерк)|🌆/i,
};

/* Walls close in: a cellar, a cave, a lab under the ground. The light behaves
   differently there, so it gets its own theme rather than a tweak to "indoors". */
const ENCLOSED_RX = /(underground|undercroft|basement|cellar|dungeon|cave|cavern|tunnel|sewer|bunker|vault|crypt|mine|подземн|подвал|погреб|пещер|тоннел|туннел|коллектор|бункер|склеп|шахт|катакомб)/i;

const THEMES = [
    { id: 'underground', rx: ENCLOSED_RX },
    { id: 'gothic', rx: /(castle|mansion|manor|estate|villa|palace|chateau|crypt|cathedral|abbey|monaster|graveyard|cemetery|chapel|tomb|dungeon|замок|особняк|усадьб|помест|дворец|склеп|собор|аббатств|монастыр|кладбищ|часовн|усыпальниц|подземел)/i },
    { id: 'tavern', rx: /(tavern|inn|pub|bar|hearth|fireplace|campfire|таверн|трактир|паб|бар|камин|очаг|костёр|костер)/i },
    { id: 'clinic', rx: /(hospital|clinic|infirmary|lab|ward|surgery|больниц|клиник|лазарет|лаборатор|палат|операцион)/i },
    { id: 'forest', rx: /(forest|wood|grove|jungle|лес|роща|чащ|джунгл)/i },
    { id: 'sea', rx: /(sea|ocean|beach|harbou?r|ship|deck|мор|океан|пляж|гаван|корабл|палуб)/i },
];

const INDOOR_RX = /(room|indoor|inside|hall|office|kitchen|bedroom|bathroom|car|carriage|cabin|apartment|basement|attic|комнат|внутри|зал|кабинет|кухн|спальн|ванн|машин|карет|салон|квартир|подвал|чердак|купе)/i;

function phaseFromTime(time) {
    const m = String(time || '').match(/(\d{1,2}):(\d{2})/);
    if (!m) return null;
    const h = parseInt(m[1], 10);
    if (h >= 5 && h < 9) return 'dawn';
    if (h >= 9 && h < 17) return 'day';
    if (h >= 17 && h < 21) return 'dusk';
    return 'night';
}

/** Card fields → what to draw. */
export function readWeather(card) {
    const w = String(card?.weather || '');
    const loc = String(card?.location || '');
    const all = `${w} ${card?.date || ''}`;

    let precip = 'none';
    if (RX.storm.test(w)) precip = 'storm';
    else if (RX.rain.test(w)) precip = 'rain';
    else if (RX.snow.test(w)) precip = 'snow';

    const state = {
        precip,
        fog: RX.fog.test(w),
        overcast: RX.cloud.test(w) && !RX.clear.test(w),
        wind: RX.windy.test(w) ? 'strong' : (precip === 'storm' ? 'strong' : 'calm'),
        intensity: RX.heavy.test(w) ? 'heavy' : (RX.light.test(w) ? 'light' : 'normal'),
        light: phaseFromTime(card?.time) || (RX.night.test(all) ? 'night' : RX.dawn.test(all) ? 'dawn' : RX.dusk.test(all) ? 'dusk' : 'day'),
        indoors: INDOOR_RX.test(loc),
        theme: (THEMES.find(t => t.rx.test(loc)) || {}).id || '',
        enclosed: ENCLOSED_RX.test(loc),
        cold: /-\s*\d|−\s*\d|\b-\d+\s*°|мороз|freezing/i.test(w) || precip === 'snow',
    };
    return state;
}

export function weatherSignature(s, opts) {
    return JSON.stringify([s.precip, s.fog, s.overcast, s.wind, s.intensity, s.light, s.indoors, s.theme, s.cold, s.enclosed,
        opts.enabled, opts.strength, opts.motion, opts.themes, opts.indoorMode]);
}

/* ---------- the layer ----------
   Drops are DOM elements on CSS animations, not a canvas loop: the compositor
   does the work, the main thread does none, and a stutter is impossible. Two
   depths (far thin and dim, near thick and bright) with stratified positions
   keep it from reading as a uniform curtain of sticks. */
let flashTimer = 0;
let bound = false;
let current = null, currentOpts = null, lastSig = '';

const rnd = (a, b) => a + Math.random() * (b - a);

/** Even coverage with jitter: a random spread clumps and leaves bald patches. */
function lanes(n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(((i + Math.random() * 0.85) / n) * 104 - 2);
    return out;
}

function ensureStyle() {
    if (document.getElementById('rsc-wx-style')) return;
    const st = document.createElement('style');
    st.id = 'rsc-wx-style';
    st.textContent = `
#${LAYER_ID} { position: fixed; inset: 0; pointer-events: none; z-index: 1150; opacity: 0; transition: opacity 1.4s ease; overflow: hidden; }
#${LAYER_ID}.on { opacity: 1; }
#${LAYER_ID} > .rsc-wx-l { position: absolute; inset: 0; }
#${LAYER_ID} b, #${LAYER_ID} s { position: absolute; display: block; will-change: transform; }

.rsc-wx-tint { transition: background 2.5s ease, opacity 2.5s ease; mix-blend-mode: soft-light; }
.rsc-wx-vig { transition: background 2.5s ease; }

@keyframes rsc-wx-fall { from { transform: translate3d(0,-16vh,0); } to { transform: translate3d(0,116vh,0); } }
@keyframes rsc-wx-drift { from { transform: translate3d(0,-14vh,0) rotate(0deg); } to { transform: translate3d(var(--dx,4vw),114vh,0) rotate(220deg); } }
@keyframes rsc-wx-gust { from { transform: translate3d(-30vw,0,0); opacity: 0; } 20% { opacity: .5; } to { transform: translate3d(130vw,-6vh,0); opacity: 0; } }
@keyframes rsc-wx-rise { from { transform: translate3d(0,0,0); opacity: 0; } 15% { opacity: .8; } to { transform: translate3d(var(--dx,2vw),-46vh,0); opacity: 0; } }

.rsc-wx-fog {
    opacity: 0; transition: opacity 2s ease;
    background:
        radial-gradient(60% 40% at 20% 85%, rgba(220,228,236,.5), transparent 70%),
        radial-gradient(70% 45% at 80% 92%, rgba(210,220,232,.42), transparent 72%);
    animation: rsc-wx-fogdrift 46s ease-in-out infinite alternate;
}
.rsc-wx-fog.on { opacity: 1; }
/* light shafts: long soft bars leaning across the screen, breathing slowly */
.rsc-wx-light i {
    position: absolute;
    display: block;
    top: -40vh;
    height: 190vh;
    transform-origin: 50% 0;
    filter: blur(6px);
    mix-blend-mode: screen;
    will-change: transform, opacity;
    animation: rsc-wx-shaft var(--dur, 26s) ease-in-out infinite alternate;
}
@keyframes rsc-wx-shaft {
    from { transform: rotate(var(--rot,14deg)) translate3d(-1.5vw,0,0) scaleX(.9); opacity: var(--o1,.5); }
    to   { transform: rotate(calc(var(--rot,14deg) + 2.5deg)) translate3d(1.5vw,0,0) scaleX(1.12); opacity: var(--o2,.85); }
}
/* a hearth, a lamp, a fireplace: warm light breathing from below */
.rsc-wx-light u {
    position: absolute;
    display: block;
    left: -10%; right: -10%; bottom: -25vh;
    height: 70vh;
    mix-blend-mode: screen;
    animation: rsc-wx-glow var(--dur, 7s) ease-in-out infinite alternate;
}
@keyframes rsc-wx-glow {
    from { opacity: .45; transform: scale(1); }
    to   { opacity: .8; transform: scale(1.06); }
}
/* dawn and dusk: a wash of colour from the horizon corner */
.rsc-wx-light em {
    position: absolute;
    display: block;
    inset: 0;
    mix-blend-mode: screen;
    animation: rsc-wx-bloom 18s ease-in-out infinite alternate;
}
@keyframes rsc-wx-bloom { from { opacity: .5; } to { opacity: .9; } }

@keyframes rsc-wx-fogdrift { from { transform: translate3d(-3%,0,0) scale(1.05); } to { transform: translate3d(3%,-2%,0) scale(1.14); } }

.rsc-wx-flash { background: rgba(214,228,255,.55); opacity: 0; }
.rsc-wx-flash.fire { animation: rsc-wx-flash .9s ease-out; }
@keyframes rsc-wx-flash { 0%{opacity:0} 6%{opacity:.85} 12%{opacity:.15} 20%{opacity:.6} 100%{opacity:0} }

.rsc-wx-glass { opacity: 0; transition: opacity 1.6s ease; }
.rsc-wx-glass.on { opacity: 1; }

@media (prefers-reduced-motion: reduce) {
    #${LAYER_ID} b, #${LAYER_ID} s, .rsc-wx-fog, .rsc-wx-flash.fire { animation: none !important; }
}
`;
    document.head.appendChild(st);
}

function ensureLayer() {
    let el = document.getElementById(LAYER_ID);
    if (el) return el;
    ensureStyle();
    el = document.createElement('div');
    el.id = LAYER_ID;
    el.innerHTML = `<div class="rsc-wx-l rsc-wx-tint"></div><div class="rsc-wx-l rsc-wx-fog"></div>
        <div class="rsc-wx-l rsc-wx-light"></div>
        <div class="rsc-wx-l rsc-wx-far"></div><div class="rsc-wx-l rsc-wx-near"></div>
        <div class="rsc-wx-l rsc-wx-glass"></div><div class="rsc-wx-l rsc-wx-vig"></div>
        <div class="rsc-wx-l rsc-wx-flash"></div>`;
    document.body.appendChild(el);
    if (!bound) {
        bound = true;
        // A hidden tab pays nothing either way, but pausing keeps laptops cool.
        document.addEventListener('visibilitychange', () => {
            const l = document.getElementById(LAYER_ID);
            if (l) l.style.animationPlayState = document.hidden ? 'paused' : '';
        });
    }
    return el;
}

function drop({ w, h, lane, dur, delay, colour, skew, anim = 'rsc-wx-fall', extra = '' }) {
    const b = document.createElement('b');
    b.style.cssText = `left:${lane.toFixed(2)}%;top:0;width:${w}px;height:${h}px;`
        + `background:linear-gradient(transparent, ${colour});border-radius:${w}px;`
        + `transform-origin:50% 0;${skew ? `rotate:${skew}deg;` : ''}`
        + `animation:${anim} ${dur.toFixed(2)}s linear ${delay.toFixed(2)}s infinite backwards;${extra}`;
    return b;
}

function flake({ r, lane, dur, delay, dx }) {
    const b = document.createElement('b');
    b.style.cssText = `left:${lane.toFixed(2)}%;top:0;width:${r}px;height:${r}px;border-radius:50%;`
        + `background:radial-gradient(circle at 35% 35%, #fff, rgba(228,240,255,.65));`
        + `--dx:${dx.toFixed(1)}vw;animation:rsc-wx-drift ${dur.toFixed(2)}s linear ${delay.toFixed(2)}s infinite backwards;`;
    return b;
}

function gust(top, dur, delay, thick) {
    const s = document.createElement('s');
    s.style.cssText = `left:0;top:${top.toFixed(1)}%;width:38vw;height:${thick}px;`
        + `background:linear-gradient(90deg, transparent, rgba(214,228,245,.30), transparent);`
        + `animation:rsc-wx-gust ${dur.toFixed(2)}s linear ${delay.toFixed(2)}s infinite backwards;`;
    return s;
}

function mote(lane, warm, dur, delay, size, dx) {
    const b = document.createElement('b');
    b.style.cssText = `left:${lane.toFixed(2)}%;top:${rnd(55, 100).toFixed(1)}%;width:${size}px;height:${size}px;border-radius:50%;`
        + `background:${warm ? 'radial-gradient(circle, #ffd08a, rgba(255,140,60,.25))' : 'radial-gradient(circle, rgba(255,248,226,.8), transparent 70%)'};`
        + `--dx:${dx.toFixed(1)}vw;animation:rsc-wx-rise ${dur.toFixed(2)}s ease-in ${delay.toFixed(2)}s infinite backwards;`;
    return b;
}

const SHAFT = {
    dawn: 'linear-gradient(180deg, rgba(255,214,150,.55), rgba(255,196,130,.16) 45%, transparent 78%)',
    day: 'linear-gradient(180deg, rgba(255,250,226,.5), rgba(255,246,210,.14) 45%, transparent 78%)',
    dusk: 'linear-gradient(180deg, rgba(255,168,118,.5), rgba(214,120,110,.14) 45%, transparent 78%)',
    night: 'linear-gradient(180deg, rgba(186,208,255,.42), rgba(150,180,240,.1) 45%, transparent 78%)',
};

/** Shafts of light, a hearth glow, a sunrise wash — the part that was missing. */
function buildLight(state, opts) {
    const el = ensureLayer();
    const box = el.querySelector('.rsc-wx-light');
    box.innerHTML = '';
    if (opts.motion === false) return;

    const k = Math.max(0.1, Math.min(1.3, (Number(opts.strength) || 60) / 100));
    const indoor = state.indoors && opts.indoorMode !== 'outdoor';
    const dim = state.precip === 'storm' ? 0.25 : state.precip !== 'none' ? 0.5 : state.overcast ? 0.45 : 1;
    const gothic = opts.themes && state.theme === 'gothic';
    const under = opts.themes && state.enclosed;

    // Sun through a gap, or moonlight through a window. Fewer, wider indoors.
    const n = under ? 1 : indoor ? 2 : (state.light === 'night' ? (gothic ? 2 : 1) : 3);
    const base = under ? 'linear-gradient(180deg, rgba(196,226,226,.34), rgba(150,190,196,.08) 45%, transparent 76%)'
        : (state.light === 'night' || gothic ? SHAFT.night : (SHAFT[state.light] || SHAFT.day));
    if (dim > 0.3) {
        for (let i = 0; i < n; i++) {
            const shaft = document.createElement('i');
            const w = indoor ? rnd(16, 26) : rnd(7, 15);
            const left = indoor ? rnd(8, 62) : rnd(4, 78);
            const rot = (state.light === 'dusk' ? -1 : 1) * rnd(9, 20);
            shaft.style.cssText = `left:${left.toFixed(1)}%;width:${w.toFixed(1)}vw;background:${base};`
                + `--rot:${rot.toFixed(1)}deg;--dur:${rnd(20, 34).toFixed(1)}s;`
                + `--o1:${(0.28 * dim * k).toFixed(2)};--o2:${(0.6 * dim * k).toFixed(2)};`
                + `animation-delay:-${rnd(0, 18).toFixed(1)}s;`;
            box.appendChild(shaft);
        }
    }

    // A fire in the room, or a warm street lamp below the frame.
    const gothicDark = state.theme === 'gothic' && (state.light === 'night' || state.light === 'dusk');
    if (opts.themes && (state.theme === 'tavern' || under || gothicDark)) {
        const glow = document.createElement('u');
        const warm = state.theme === 'tavern';
        const colour = warm ? 'rgba(255,164,74,.5)' : under ? 'rgba(120,200,200,.28)' : 'rgba(150,176,255,.32)';
        // strip lights underground twitch; a fire breathes
        glow.style.cssText = `background: radial-gradient(60% 100% at 50% 100%, ${colour}, transparent 72%);`
            + `--dur:${warm ? 6.5 : under ? 3.2 : 11}s;opacity:${(0.6 * k).toFixed(2)};`;
        box.appendChild(glow);
    }

    // The sky itself at dawn and dusk.
    if ((state.light === 'dawn' || state.light === 'dusk') && !indoor) {
        const bloom = document.createElement('em');
        bloom.style.cssText = state.light === 'dawn'
            ? 'background: radial-gradient(80% 60% at 18% 2%, rgba(255,206,140,.45), transparent 62%);'
            : 'background: radial-gradient(80% 60% at 82% 6%, rgba(255,150,96,.42), transparent 62%);';
        box.appendChild(bloom);
    }
}

/** Build the whole particle field once; CSS runs it from then on. */
function build(state, opts) {
    const el = ensureLayer();
    const far = el.querySelector('.rsc-wx-far');
    const near = el.querySelector('.rsc-wx-near');
    far.innerHTML = '';
    near.innerHTML = '';
    if (opts.motion === false) return;

    const k = Math.max(0.1, Math.min(1.3, (Number(opts.strength) || 60) / 100));
    const heavy = state.intensity === 'heavy';
    const lightIn = state.intensity === 'light';
    const indoor = state.indoors && opts.indoorMode !== 'outdoor';
    const mult = (heavy ? 1.7 : lightIn ? 0.55 : 1) * k * (indoor ? 0.3 : 1);
    const skew = state.wind === 'strong' ? -17 : state.wind === 'breezy' ? -8 : -3;

    if (state.precip === 'rain' || state.precip === 'storm') {
        const nFar = Math.max(3, Math.round((state.precip === 'storm' ? 22 : 16) * mult));
        const nNear = Math.max(2, Math.round((state.precip === 'storm' ? 14 : 10) * mult));
        lanes(nFar).forEach(l => far.appendChild(drop({
            w: 1.5, h: rnd(14, 26), lane: l, dur: rnd(1.0, 1.5), delay: -rnd(0, 1.5),
            colour: 'rgba(168,190,222,.45)', skew,
        })));
        lanes(nNear).forEach(l => near.appendChild(drop({
            w: 2.5, h: rnd(26, 46), lane: l, dur: rnd(0.5, 0.8), delay: -rnd(0, 0.8),
            colour: 'rgba(206,224,250,.8)', skew,
        })));
    } else if (state.precip === 'snow') {
        const nFar = Math.max(4, Math.round(18 * mult));
        const nNear = Math.max(3, Math.round(10 * mult));
        lanes(nFar).forEach(l => far.appendChild(flake({ r: rnd(2, 3.5), lane: l, dur: rnd(11, 17), delay: -rnd(0, 16), dx: rnd(-3, 6) })));
        lanes(nNear).forEach(l => near.appendChild(flake({ r: rnd(4, 6.5), lane: l, dur: rnd(6, 10), delay: -rnd(0, 9), dx: rnd(-2, 8) })));
    }

    // gusts cross the screen sideways, so the weather isn't only falling
    if (!indoor && (state.wind === 'strong' || state.precip === 'storm' || state.precip === 'snow')) {
        const n = state.wind === 'strong' ? 4 : 2;
        for (let i = 0; i < n; i++) far.appendChild(gust(rnd(8, 80), rnd(6, 11), -rnd(0, 9), rnd(1, 2.5)));
    }

    // dust in the light, or embers over a hearth
    const warm = opts.themes && state.theme === 'tavern';
    const motes = warm ? Math.round(14 * k)
        : (state.light === 'day' && !state.overcast && state.precip === 'none' ? Math.round(10 * k) : 0);
    lanes(motes).forEach(l => near.appendChild(mote(l, warm, rnd(9, 16), -rnd(0, 14), rnd(2, 4), rnd(-4, 4))));
}

/* ---------- light, fog, vignette, lightning ---------- */
const TINTS = {
    dawn: 'linear-gradient(180deg, rgba(255,190,140,.30), rgba(120,140,190,.14))',
    day: 'linear-gradient(180deg, rgba(255,250,235,.12), rgba(180,205,230,.08))',
    dusk: 'linear-gradient(180deg, rgba(255,150,110,.26), rgba(70,60,110,.22))',
    night: 'linear-gradient(180deg, rgba(40,60,110,.34), rgba(10,14,30,.30))',
};
const THEME_TINT = {
    gothic: 'linear-gradient(180deg, rgba(120,140,190,.22), rgba(20,20,40,.30))',
    tavern: 'linear-gradient(180deg, rgba(255,170,90,.22), rgba(90,45,20,.20))',
    clinic: 'linear-gradient(180deg, rgba(220,240,255,.20), rgba(170,200,220,.14))',
    forest: 'linear-gradient(180deg, rgba(150,200,140,.18), rgba(20,50,30,.22))',
    sea: 'linear-gradient(180deg, rgba(150,210,230,.20), rgba(20,60,90,.22))',
    underground: 'linear-gradient(180deg, rgba(120,170,175,.16), rgba(8,18,24,.34))',
};

function paintLayers(state, opts) {
    const el = ensureLayer();
    const tint = el.querySelector('.rsc-wx-tint');
    const vig = el.querySelector('.rsc-wx-vig');
    const fog = el.querySelector('.rsc-wx-fog');
    const glass = el.querySelector('.rsc-wx-glass');
    const k = Math.max(0, Math.min(1.5, (Number(opts.strength) || 60) / 100));

    const themeTint = opts.themes && state.theme ? THEME_TINT[state.theme] : '';
    tint.style.background = themeTint || TINTS[state.light] || TINTS.day;
    tint.style.opacity = String(0.55 + 0.45 * k);

    /* The vignette carries the hour and the walls: open daylight barely shows it,
       a cellar at midnight closes right in around the text. */
    const byHour = { night: 0.52, dusk: 0.38, dawn: 0.3, day: 0.2 }[state.light] ?? 0.22;
    const dark = Math.min(0.9, byHour * k
        + (state.precip === 'storm' ? 0.16 : state.overcast ? 0.07 : 0)
        + (state.enclosed ? 0.26 : 0)
        + (state.indoors && !state.enclosed ? 0.06 : 0));
    // tighter radius = the walls are closer
    const reach = state.enclosed ? '86% 66%' : (state.indoors ? '104% 80%' : '124% 94%');
    const clear = state.enclosed ? '26%' : (state.light === 'night' ? '36%' : '44%');
    vig.style.background = `radial-gradient(${reach} at 50% 46%, transparent ${clear}, rgba(0,0,0,${dark.toFixed(2)}) 100%)`;

    fog.classList.toggle('on', !!state.fog);
    fog.style.filter = state.fog && state.intensity === 'heavy' ? 'none' : 'opacity(.7)';

    // indoors: the rain is outside the window, so it is quieter and blurred at the edges
    const sheltered = state.indoors && opts.indoorMode !== 'outdoor' && state.precip !== 'none';
    glass.classList.toggle('on', sheltered);
    glass.style.background = sheltered
        ? 'radial-gradient(130% 100% at 50% 50%, transparent 55%, rgba(120,150,180,.18) 100%)'
        : 'none';

    el.classList.toggle('on', !!opts.enabled);
}

function scheduleLightning(state, opts) {
    clearTimeout(flashTimer);
    if (!opts.enabled || state.precip !== 'storm' || opts.motion === false) return;
    const el = document.getElementById(LAYER_ID);
    if (!el) return;
    const flash = el.querySelector('.rsc-wx-flash');
    const again = () => {
        flashTimer = setTimeout(() => {
            flash.classList.remove('fire');
            void flash.offsetWidth;
            flash.classList.add('fire');
            again();
        }, rnd(7000, 20000));
    };
    again();
}

/* ---------- the one entry point ---------- */
export function applyWeather(card, opts) {
    const o = Object.assign({ enabled: true, strength: 60, motion: true, themes: true, indoorMode: 'auto' }, opts || {});
    if (!o.enabled) { clearWeather(); return null; }
    if (!card) { clearWeather(); return null; }

    const state = readWeather(card);
    if (o.indoorMode === 'indoor') state.indoors = true;
    if (o.indoorMode === 'outdoor') state.indoors = false;

    const sig = weatherSignature(state, o);
    current = state;
    currentOpts = o;
    if (sig === lastSig && document.getElementById(LAYER_ID)) return state;   // nothing changed
    lastSig = sig;

    ensureLayer();
    paintLayers(state, o);
    build(state, o);
    buildLight(state, o);
    scheduleLightning(state, o);
    return state;
}

export function clearWeather() {
    clearTimeout(flashTimer);
    current = null;
    lastSig = '';
    const el = document.getElementById(LAYER_ID);
    if (el) {
        el.classList.remove('on');
        el.querySelector('.rsc-wx-far').innerHTML = '';
        el.querySelector('.rsc-wx-near').innerHTML = '';
        el.querySelector('.rsc-wx-light').innerHTML = '';
    }
}
