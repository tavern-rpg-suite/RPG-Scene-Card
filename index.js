import { getContext, extension_settings } from '../../../extensions.js';
import { eventSource, event_types, saveChatDebounced, saveSettingsDebounced, setExtensionPrompt, extension_prompt_roles } from '../../../../script.js';

const MODULE_NAME = 'rpg_info_box';
const PROMPT_KEY = 'rpg_info_box_injection';

let settings = {};

/* ===================== DEFAULTS ===================== */
const DEFAULT_PROMPT_EN =
`You are the in-world "Scene Card" logger for an immersive roleplay. Read the recent messages and report what the PROTAGONIST perceives about the CURRENT scene, right now.
Rules:
- Report the in-world date and a short weather forecast, the time span of the scene (start -> end), the location, and the major present characters.
- For characters: give a fitting emoji, the name, a short visible physical state, and one observable demeanour cue. NEVER include {{user}} ({{user_name}}). If there are no important NPCs present, return an empty list.
- Keep every value short and strictly in-world (no meta talk). Continue naturally from the previous Scene Card if one exists.`;

const DEFAULT_PROMPT_RU =
`Ты — внутриигровой логгер «Scene Card» для ролевой игры. Прочитай последние сообщения и опиши то, что ГЛАВНЫЙ ГЕРОЙ воспринимает о ТЕКУЩЕЙ сцене прямо сейчас.
Правила:
- Укажи внутриигровую дату и короткий прогноз погоды, промежуток времени сцены (начало -> конец), локацию и главных присутствующих персонажей.
- Для персонажей: подходящий эмодзи, имя, короткое видимое физическое состояние и одна заметная деталь поведения. НИКОГДА не включай {{user}} ({{user_name}}). Если важных NPC рядом нет — верни пустой список.
- Все значения короткие и строго внутриигровые (без мета-разговоров). Продолжай логично от предыдущего Scene Card, если он был.`;

const defaultSettings = {
    enabled: false,
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: '',
    model: 'google/gemma-4-31b-it',
    temperature: 0.8,
    scanCount: 10,
    statsCount: 1,
    injectContext: true,
    injectDepth: 0,
    onlyLast: false,
    language: 'en',
    title: 'Scene Card',
    dynamicPrompt: false,
    showDate: true,
    showTime: true,
    showLocation: true,
    showCharacters: true,
    showLevel: false,
    customFields: [],   // [{ id, emoji, label, hint, enabled }]
    prompt: DEFAULT_PROMPT_EN,
};

/* ===================== i18n ===================== */
const I18N = {
    en: {
        drawer: 'RPG Scene Card (top of message)', enable: 'Enable Scene Card',
        api: 'API Settings (secondary model)', url: 'URL', key: 'API Key', model: 'Model', temp: 'Temperature:',
        gen: 'Generation & Context', scan: 'Messages to analyse:', msgs: 'messages', statsScan: 'Previous Scene Cards to consider:', boxes: 'boxes',
        inject: 'Add Scene Card to the main model (inject)', depth: 'Injection depth:',
        fields: 'Fields to display',
        f_date: '🗓️ Date & weather', f_time: '⏳ Time', f_loc: '📍 Location',
        f_chars: '👥 Present characters', f_level: '⭐ Level',
        titleLbl: 'Box title:', promptLbl: 'Analysis prompt (editable):', promptReset: 'Reset prompt to default',
        lang: 'Language:', analysing: 'Analysing scene…', err: 'Scene Card error', lvl: 'Level',
        dynPrompt: 'Dynamic prompt (only generate shown fields)',
        onlyLast: 'Show only on the latest message', regen_lbl: 'Regenerate', exportBtn: 'Export settings', importBtn: 'Import settings', importErr: 'Import failed: invalid file',
        customTitle: 'Custom fields', addField: 'Add field',
        ph_emoji: 'emoji', ph_label: 'Label', ph_hint: 'Hint for the model (optional)', remove: 'Remove',
        edit_lbl: 'Edit', save_lbl: 'Save', cancel_lbl: 'Cancel',
        chars_hint: 'One per line: emoji | name | state | demeanour',
        lvl_v: 'Level', lvl_xp: 'XP', lvl_max: 'Max',
    },
    ru: {
        drawer: 'RPG Scene Card (сверху сообщения)', enable: 'Включить Scene Card',
        api: 'Настройки API (вторая модель)', url: 'URL', key: 'API-ключ', model: 'Модель', temp: 'Температура:',
        gen: 'Генерация и контекст', scan: 'Сообщений для анализа:', msgs: 'сообщений', statsScan: 'Предыдущих Scene Card учитывать:', boxes: 'боксов',
        inject: 'Добавлять Scene Card в основную модель (инъекция)', depth: 'Глубина вставки:',
        fields: 'Какие поля показывать',
        f_date: '🗓️ Дата и погода', f_time: '⏳ Время', f_loc: '📍 Локация',
        f_chars: '👥 Присутствующие', f_level: '⭐ Уровень',
        titleLbl: 'Заголовок блока:', promptLbl: 'Промпт анализа (редактируемый):', promptReset: 'Сбросить промпт',
        lang: 'Язык:', analysing: 'Анализ сцены…', err: 'Ошибка Scene Card', lvl: 'Уровень',
        dynPrompt: 'Динамичный промпт (генерировать только показанные поля)',
        onlyLast: 'Показывать только на последнем сообщении', regen_lbl: 'Перегенерировать', exportBtn: 'Экспорт настроек', importBtn: 'Импорт настроек', importErr: 'Ошибка импорта: неверный файл',
        customTitle: 'Свои поля', addField: 'Добавить поле',
        ph_emoji: 'эмодзи', ph_label: 'Название', ph_hint: 'Подсказка модели (необязательно)', remove: 'Удалить',
        edit_lbl: 'Изменить', save_lbl: 'Сохранить', cancel_lbl: 'Отмена',
        chars_hint: 'По одному в строке: эмодзи | имя | состояние | манера',
        lvl_v: 'Уровень', lvl_xp: 'Опыт', lvl_max: 'Макс',
    }
};
function t(key) { return (I18N[settings.language] || I18N.en)[key] || I18N.en[key] || key; }

/* ===================== SETTINGS IO ===================== */
function loadSettings() {
    if (!extension_settings[MODULE_NAME]) extension_settings[MODULE_NAME] = {};
    settings = Object.assign({}, defaultSettings, extension_settings[MODULE_NAME]);
    if (!Array.isArray(settings.customFields)) settings.customFields = [];
}
function saveSettings() { extension_settings[MODULE_NAME] = settings; saveSettingsDebounced(); }
function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function macros(str) {
    const ctx = getContext();
    return String(str || '')
        .replace(/\{\{user\}\}|\{\{user_name\}\}/g, ctx.name1 || 'User')
        .replace(/\{\{char\}\}/g, ctx.name2 || 'Character');
}

/* ===================== AI CALL ===================== */
async function analyseScene(historyText, prevBoxes) {
    const prevArr = Array.isArray(prevBoxes) ? prevBoxes.filter(Boolean) : (prevBoxes ? [prevBoxes] : []);
    const hasPrev = prevArr.length > 0;
    if (!settings.apiKey) throw new Error('API key is not set');
    const ctx = getContext();
    const user = ctx.name1 || 'User';
    const langLine = settings.language === 'ru' ? 'Пиши ВСЕ значения на русском языке.' : 'Write ALL values in English.';

    const std = [
        { on: settings.showDate, line: '"date": "Weekday, Month Day, Year", "weather": "emoji + short forecast + temperature"' },
        { on: settings.showTime, line: '"time": "HH:MM -> HH:MM"' },
        { on: settings.showLocation, line: '"location": "where the scene happens"' },
        { on: settings.showCharacters, line: '"characters": [ { "emoji": "🙂", "name": "Name", "state": "visible physical state", "demeanor": "observable demeanour cue" } ]' },
        { on: settings.showLevel, line: '"level": { "value": 1, "xp": 0, "max": 100 }' },
    ];
    const parts = [];
    std.forEach(s => { if (!settings.dynamicPrompt || s.on) parts.push(s.line); });

    const customOn = (settings.customFields || []).filter(f => f.enabled && f.id);
    if (customOn.length) {
        const cl = customOn.map(f => `"${f.id}": "${(f.hint || f.label || 'value').replace(/"/g, "'")}"`).join(', ');
        parts.push(`"custom": { ${cl} }`);
    }

    const dynLine = settings.dynamicPrompt ? `\nReport ONLY the fields present in the JSON below — do not add any others.` : '';
    const formatSpec =
`\n\nReturn ONLY valid minified JSON, no code fences, using EXACTLY these keys (empty "" or [] when unknown):${dynLine}
{
 ${parts.join(',\n ')}
}
The protagonist is "${user}". Do NOT list "${user}" inside "characters". ${langLine}${hasPrev ? `

CONTINUITY (IMPORTANT): a previous Scene Card is provided below. Keep "date" (INCLUDING the year), "weather" and "location" IDENTICAL to the previous one UNLESS the recent messages clearly show a change (a new day passes, travel to another place, the weather explicitly shifts). Normally ONLY "time" moves forward by a little. NEVER invent a new year and do NOT relocate or change the weather without a clear narrative reason.` : ''}`;

    const systemPrompt = macros(settings.prompt || DEFAULT_PROMPT_EN) + formatSpec;
    const endpointUrl = (settings.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/$/, '') + '/chat/completions';

    for (let i = 0; i < 2; i++) {
        try {
            const response = await fetch(endpointUrl, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${settings.apiKey.trim()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: settings.model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: `${hasPrev ? 'Previous Scene Card' + (prevArr.length > 1 ? 's (oldest to newest, continue from the newest)' : ' (continue from this)') + ':\n' + prevArr.map(b => JSON.stringify(b)).join('\n') + '\n\n' : ''}Recent scene:\n${historyText}\n\nOutput JSON:` }
                    ],
                    temperature: settings.temperature,
                    response_format: { type: 'json_object' }
                })
            });
            if (response.status === 429 && i === 0) { await new Promise(r => setTimeout(r, 2000)); continue; }
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            let content = (data.choices[0].message.content || '').trim();
            const m = content.match(/\{[\s\S]*\}/);
            return JSON.parse(m ? m[0] : content);
        } catch (e) { if (i === 1) throw e; }
    }
}

/* ===================== RENDER (VIEW) ===================== */
function rowHtml(emoji, html) {
    return `<div class="rpgib-row"><span class="rpgib-emoji">${emoji}</span><span class="rpgib-text">${html}</span></div>`;
}
function boxViewHtml(data) {
    const rows = [];
    if (settings.showDate && (data.date || data.weather)) {
        const parts = [];
        if (data.date) parts.push(escapeHtml(data.date));
        if (data.weather) parts.push(escapeHtml(data.weather));
        rows.push(rowHtml('🗓️', parts.join(' &nbsp;|&nbsp; ')));
    }
    if (settings.showTime && data.time) rows.push(rowHtml('⏳', escapeHtml(data.time)));
    if (settings.showLocation && data.location) rows.push(rowHtml('📍', escapeHtml(data.location)));
    if (settings.showCharacters) {
        const chars = Array.isArray(data.characters) ? data.characters : [];
        if (chars.length) {
            const parts = chars.map(c => {
                const bits = [c.name, c.state, c.demeanor].filter(Boolean).map(escapeHtml).join(', ');
                return `<span class="rpgib-char">${escapeHtml(c.emoji || '👤')} ${bits}</span>`;
            }).join('<span class="rpgib-sep"> | </span>');
            rows.push(rowHtml('👥', parts));
        } else rows.push(rowHtml('👥', '<span class="rpgib-muted">none</span>'));
    }
    if (settings.showLevel && data.level && typeof data.level === 'object') {
        const v = data.level.value ?? 1, xp = data.level.xp ?? 0, max = data.level.max ?? 100;
        const pct = Math.max(0, Math.min(100, max ? (xp / max) * 100 : 0));
        rows.push(rowHtml('⭐', `<b>${t('lvl')}:</b> ${escapeHtml(v)} <span class="rpgib-xp">[${escapeHtml(xp)}/${escapeHtml(max)}]</span>
            <span class="rpgib-bar"><span class="rpgib-bar-fill" style="width:${pct}%"></span></span>`));
    }
    (settings.customFields || []).filter(f => f.enabled && f.id).forEach(f => {
        const val = data.custom ? data.custom[f.id] : '';
        if (val) rows.push(rowHtml(escapeHtml(f.emoji || '🔹'), `<b>${escapeHtml(f.label || '')}:</b> ${escapeHtml(val)}`));
    });

    return `<div class="rpgib-head">
            <span class="rpgib-title">${escapeHtml(settings.title || 'Scene Card')}</span>
            <span class="rpgib-tools">
                <button class="rpgib-regenbtn" title="${escapeHtml(t('regen_lbl'))}"><i class="fa-solid fa-rotate"></i></button>
                <button class="rpgib-editbtn" title="${escapeHtml(t('edit_lbl'))}"><i class="fa-solid fa-pen"></i></button>
            </span>
        </div>
        <div class="rpgib-divider"></div>
        <div class="rpgib-rows">${rows.join('')}</div>`;
}

/* ===================== RENDER (EDIT) ===================== */
function charsToText(chars) {
    return (Array.isArray(chars) ? chars : []).map(c => `${c.emoji || '👤'} | ${c.name || ''} | ${c.state || ''} | ${c.demeanor || ''}`).join('\n');
}
function parseChars(text) {
    return String(text || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
        const p = l.split('|').map(s => s.trim());
        return { emoji: p[0] || '👤', name: p[1] || '', state: p[2] || '', demeanor: p[3] || '' };
    });
}
function field(labelKey, id, val) {
    return `<label class="rpgib-f"><span>${t(labelKey)}</span><input type="text" data-k="${id}" value="${escapeHtml(val)}"></label>`;
}
function boxEditHtml(data) {
    let f = '';
    if (settings.showDate) { f += field('f_date', 'date', data.date || ''); f += `<label class="rpgib-f"><span>🌦️</span><input type="text" data-k="weather" value="${escapeHtml(data.weather || '')}"></label>`; }
    if (settings.showTime) f += field('f_time', 'time', data.time || '');
    if (settings.showLocation) f += field('f_loc', 'location', data.location || '');
    if (settings.showCharacters) {
        f += `<label class="rpgib-f rpgib-f-col"><span>${t('f_chars')}</span>
            <textarea data-k="characters" rows="3" placeholder="${escapeHtml(t('chars_hint'))}">${escapeHtml(charsToText(data.characters))}</textarea>
            <small class="rpgib-hint">${escapeHtml(t('chars_hint'))}</small></label>`;
    }
    if (settings.showLevel) {
        const lv = data.level || {};
        f += `<div class="rpgib-f rpgib-lvlrow"><span>${t('f_level')}</span>
            <input type="number" data-k="lvl_value" value="${escapeHtml(lv.value ?? 1)}" title="${t('lvl_v')}" style="width:60px">
            <input type="number" data-k="lvl_xp" value="${escapeHtml(lv.xp ?? 0)}" title="${t('lvl_xp')}" style="width:70px">
            <input type="number" data-k="lvl_max" value="${escapeHtml(lv.max ?? 100)}" title="${t('lvl_max')}" style="width:70px"></div>`;
    }
    (settings.customFields || []).filter(c => c.enabled && c.id).forEach(c => {
        const val = data.custom ? (data.custom[c.id] || '') : '';
        f += `<label class="rpgib-f"><span>${escapeHtml((c.emoji || '🔹') + ' ' + (c.label || ''))}</span><input type="text" data-k="cf_${c.id}" value="${escapeHtml(val)}"></label>`;
    });

    return `<div class="rpgib-head"><span class="rpgib-title">${escapeHtml(settings.title || 'Scene Card')}</span></div>
        <div class="rpgib-divider"></div>
        <div class="rpgib-editform">${f}
            <div class="rpgib-edit-actions">
                <button class="rpgib-save menu_button"><i class="fa-solid fa-check"></i> ${escapeHtml(t('save_lbl'))}</button>
                <button class="rpgib-cancel menu_button"><i class="fa-solid fa-xmark"></i> ${escapeHtml(t('cancel_lbl'))}</button>
            </div>
        </div>`;
}

/* ===================== BOX PLACEMENT + WIRING ===================== */
function getBox(messageId) {
    const messageElement = document.querySelector(`.mes[mesid="${messageId}"]`);
    if (!messageElement) return null;
    const mesText = messageElement.querySelector('.mes_text');
    if (!mesText) return null;
    const parent = mesText.parentElement;
    let box = parent.querySelector(':scope > .rpgib-box');
    if (!box) {
        box = document.createElement('div');
        box.className = 'rpgib-box';
        parent.insertBefore(box, mesText);       // TOP, OUTSIDE .mes_text (survives edit mode)
    } else if (box.nextElementSibling !== mesText) {
        parent.insertBefore(box, mesText);
    }
    return box;
}

function renderInfoBox(messageId, data, isLoading = false, isError = false, editing = false) {
    const box = getBox(messageId);
    if (!box) return;

    if (isLoading) {
        box.className = 'rpgib-box rpgib-loading';
        box.innerHTML = `<div class="rpgib-head"><span class="rpgib-title">${escapeHtml(settings.title || 'Scene Card')}</span></div>
            <div class="rpgib-divider"></div>
            <div class="rpgib-status"><i class="fa-solid fa-spinner fa-spin"></i> ${escapeHtml(t('analysing'))}</div>`;
        return;
    }
    if (isError) {
        box.className = 'rpgib-box rpgib-error';
        box.innerHTML = `<div class="rpgib-head"><span class="rpgib-title">${escapeHtml(settings.title || 'Scene Card')}</span></div>
            <div class="rpgib-divider"></div>
            <div class="rpgib-status">⚠️ ${escapeHtml(t('err'))}: ${escapeHtml(data)}</div>`;
        return;
    }

    box.className = 'rpgib-box';
    if (editing) {
        box.innerHTML = boxEditHtml(data || {});
        box.querySelector('.rpgib-save')?.addEventListener('click', () => {
            const d = data || {};
            const q = k => box.querySelector(`[data-k="${k}"]`);
            const setv = (k) => { const el = q(k); if (el) d[k] = el.value; };
            ['date', 'weather', 'time', 'location'].forEach(setv);
            if (settings.showCharacters && q('characters')) d.characters = parseChars(q('characters').value);
            if (settings.showLevel && q('lvl_value')) d.level = { value: Number(q('lvl_value').value) || 0, xp: Number(q('lvl_xp').value) || 0, max: Number(q('lvl_max').value) || 100 };
            (settings.customFields || []).filter(c => c.enabled && c.id).forEach(c => {
                const el = q('cf_' + c.id); if (el) { d.custom = d.custom || {}; d.custom[c.id] = el.value; }
            });
            const msg = getContext().chat[messageId];
            if (msg) { if (!msg.extra) msg.extra = {}; msg.extra.rpg_info_box = d; saveChatDebounced(); }
            renderInfoBox(messageId, d);
            updateContextInjection();
        });
        box.querySelector('.rpgib-cancel')?.addEventListener('click', () => renderInfoBox(messageId, data));
        return;
    }

    box.innerHTML = boxViewHtml(data || {});
    box.querySelector('.rpgib-editbtn')?.addEventListener('click', () => renderInfoBox(messageId, data, false, false, true));
    box.querySelector('.rpgib-regenbtn')?.addEventListener('click', () => processMessage(messageId, true));
}

/* ===================== PROCESS ===================== */
function findPrevBoxes(messageId, count) {
    const chat = getContext().chat || [];
    const n = Math.max(0, parseInt(count) || 0);
    const out = [];
    for (let i = messageId - 1; i >= 0 && out.length < n; i--) {
        const d = chat[i] && chat[i].extra && chat[i].extra.rpg_info_box;
        if (d) out.push(d);
    }
    return out.reverse(); // oldest -> newest
}
function latestBotIndex() {
    const chat = getContext().chat || [];
    for (let i = chat.length - 1; i >= 0; i--) { const m = chat[i]; if (m && !m.is_user && !m.is_system) return i; }
    return -1;
}
function removeBox(messageId) {
    const mes = document.querySelector(`.mes[mesid="${messageId}"]`);
    const box = mes && mes.querySelector('.rpgib-box');
    if (box) box.remove();
}
function clearOtherBoxes(keepId) {
    document.querySelectorAll('.rpgib-box').forEach(b => {
        const mes = b.closest('.mes'); const id = mes ? parseInt(mes.getAttribute('mesid')) : -1;
        if (id !== keepId) b.remove();
    });
}
async function processMessage(messageId, forceUpdate = false) {
    if (!settings.enabled) return;
    const ctx = getContext();
    const chat = ctx.chat;
    const msg = chat[messageId];
    if (!msg || msg.is_user || msg.is_system) return;

    if (settings.onlyLast) {
        if (messageId !== latestBotIndex()) { removeBox(messageId); return; }
        clearOtherBoxes(messageId);
    }

    if (!forceUpdate && msg.extra?.rpg_info_box) {
        renderInfoBox(messageId, msg.extra.rpg_info_box);
        updateContextInjection();
        return;
    }
    try {
        const n = Math.max(1, parseInt(settings.scanCount) || 10);
        const startIdx = Math.max(0, messageId - n + 1);
        const slice = chat.slice(startIdx, messageId + 1).filter(m => !m.is_system);
        const historyText = slice.map(m => `${m.name}: ${m.mes}`).join('\n\n');

        const data = await analyseScene(historyText, findPrevBoxes(messageId, settings.statsCount));
        if (!msg.extra) msg.extra = {};
        msg.extra.rpg_info_box = data;
        saveChatDebounced();
        renderInfoBox(messageId, data);
        updateContextInjection();
    } catch (e) {
        console.error('[RPG Scene Card] failed:', e);
        renderInfoBox(messageId, e.message, false, true);
    }
}

/* ===================== INJECTION INTO MAIN MODEL ===================== */
function latestBoxText() {
    const chat = getContext().chat || [];
    for (let i = chat.length - 1; i >= 0; i--) {
        const d = chat[i]?.extra?.rpg_info_box;
        if (d) {
            const lines = [];
            if (d.date || d.weather) lines.push(`Date: ${[d.date, d.weather].filter(Boolean).join(' | ')}`);
            if (d.time) lines.push(`Time: ${d.time}`);
            if (d.location) lines.push(`Location: ${d.location}`);
            if (Array.isArray(d.characters) && d.characters.length) lines.push('Present: ' + d.characters.map(c => `${c.name}${c.state ? ' (' + c.state + ')' : ''}`).filter(Boolean).join('; '));
            if (d.custom) (settings.customFields || []).filter(f => f.enabled && f.id && d.custom[f.id]).forEach(f => lines.push(`${f.label}: ${d.custom[f.id]}`));
            return lines.join('\n');
        }
    }
    return '';
}
function updateContextInjection() {
    if (!settings.enabled || !settings.injectContext) { setExtensionPrompt(PROMPT_KEY, '', 0, 0, false); return; }
    const txt = latestBoxText();
    setExtensionPrompt(PROMPT_KEY, txt ? `\n[Scene Card]\n${txt}\n` : '', 2, settings.injectDepth, false, extension_prompt_roles.SYSTEM);
}

/* ===================== SETTINGS UI ===================== */
function settingsHtml() {
    return `
<div class="extension_settings rpg-infobox-settings">
    <div class="inline-drawer">
        <div class="rpgib-drawer-toggle inline-drawer-header" style="cursor:pointer;">
            <b><i class="fa-solid fa-clipboard-list"></i> <span data-i18n="drawer"></span></b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content" id="rpgib-drawer-content" style="display:none; padding-top:10px;">
            <label class="checkbox_label"><input type="checkbox" id="rpgib-enabled"> <span data-i18n="enable"></span></label>
            <div class="flex-container alignitemscenter flexgap5 margin-t-10 margin-b-10">
                <label style="min-width:80px;" data-i18n="lang"></label>
                <select id="rpgib-lang" class="text_pole"><option value="en">English</option><option value="ru">Русский</option></select>
            </div>
            <hr class="sysHR"><h4>🔌 <span data-i18n="api"></span></h4>
            <div class="flex-container alignitemscenter flexgap5 margin-b-10"><input type="text" id="rpgib-base-url" class="text_pole flex1" data-i18n-ph="url"></div>
            <div class="flex-container alignitemscenter flexgap5 margin-b-10"><input type="password" id="rpgib-api-key" class="text_pole flex1" data-i18n-ph="key"></div>
            <div class="flex-container alignitemscenter flexgap5 margin-b-10"><input type="text" id="rpgib-model" class="text_pole flex1" data-i18n-ph="model"></div>
            <div class="flex-container alignitemscenter flexgap5 margin-b-10">
                <label style="min-width:120px;" data-i18n="temp"></label>
                <input type="range" id="rpgib-temperature" min="0" max="2" step="0.1" style="flex:1;">
                <span id="rpgib-temp-val" style="min-width:30px; text-align:right;"></span>
            </div>
            <hr class="sysHR"><h4>⚙️ <span data-i18n="gen"></span></h4>
            <div class="flex-container alignitemscenter flexgap5 margin-b-10">
                <label data-i18n="scan"></label><input type="number" id="rpgib-scan" class="text_pole" min="1" max="50" style="width:55px;"><label data-i18n="msgs"></label>
            </div>
            <div class="flex-container alignitemscenter flexgap5 margin-b-10">
                <label data-i18n="statsScan"></label><input type="number" id="rpgib-stats" class="text_pole" min="0" max="20" style="width:55px;"><label data-i18n="boxes"></label>
            </div>
            <label class="checkbox_label"><input type="checkbox" id="rpgib-inject-context"> <b data-i18n="inject"></b></label>
            <div class="flex-container alignitemscenter flexgap5 margin-b-10 margin-t-10">
                <label data-i18n="depth"></label><input type="number" id="rpgib-inject-depth" class="text_pole" min="0" max="100" style="width:55px;">
            </div>
            <label class="checkbox_label"><input type="checkbox" id="rpgib-only-last"> <span data-i18n="onlyLast"></span></label>
            <hr class="sysHR"><h4>🧩 <span data-i18n="fields"></span></h4>
            <label class="checkbox_label"><input type="checkbox" id="rpgib-f-date"> <span data-i18n="f_date"></span></label>
            <label class="checkbox_label"><input type="checkbox" id="rpgib-f-time"> <span data-i18n="f_time"></span></label>
            <label class="checkbox_label"><input type="checkbox" id="rpgib-f-loc"> <span data-i18n="f_loc"></span></label>
            <label class="checkbox_label"><input type="checkbox" id="rpgib-f-chars"> <span data-i18n="f_chars"></span></label>
            <label class="checkbox_label"><input type="checkbox" id="rpgib-f-level"> <span data-i18n="f_level"></span></label>
            <div class="flex-container alignitemscenter flexgap5 margin-b-10 margin-t-10">
                <label style="min-width:90px;" data-i18n="titleLbl"></label><input type="text" id="rpgib-title" class="text_pole flex1">
            </div>
            <div class="rpgib-custom-block">
                <h4 style="margin-bottom:6px;">🧰 <span data-i18n="customTitle"></span></h4>
                <div id="rpgib-custom-list"></div>
                <div class="menu_button menu_button_icon" id="rpgib-add-field" style="margin-top:6px;"><i class="fa-solid fa-plus"></i> <span data-i18n="addField"></span></div>
            </div>
            <hr class="sysHR"><h4>📝 <span data-i18n="promptLbl"></span></h4>
            <label class="checkbox_label" style="margin-bottom:6px;"><input type="checkbox" id="rpgib-dyn"> <span data-i18n="dynPrompt"></span></label>
            <textarea id="rpgib-prompt" class="text_pole" rows="7" style="width:100%; resize:vertical;"></textarea>
            <div class="menu_button menu_button_icon" id="rpgib-prompt-reset" style="margin-top:6px;"><i class="fa-solid fa-rotate-left"></i> <span data-i18n="promptReset"></span></div>
            <hr class="sysHR">
            <div class="flex-container flexgap5">
                <div class="menu_button menu_button_icon" id="rpgib-export"><i class="fa-solid fa-file-export"></i> <span data-i18n="exportBtn"></span></div>
                <div class="menu_button menu_button_icon" id="rpgib-import"><i class="fa-solid fa-file-import"></i> <span data-i18n="importBtn"></span></div>
                <input type="file" id="rpgib-import-file" accept="application/json" style="display:none">
            </div>
        </div>
    </div>
</div>`;
}
function applyI18n(root) {
    root.find('[data-i18n]').each(function () { this.textContent = t(this.getAttribute('data-i18n')); });
    root.find('[data-i18n-ph]').each(function () { this.setAttribute('placeholder', t(this.getAttribute('data-i18n-ph'))); });
}
function renderCustomList() {
    const box = $('#rpgib-custom-list'); box.empty();
    (settings.customFields || []).forEach((f, idx) => {
        const row = $(`<div class="rpgib-cf-row flex-container alignitemscenter flexgap5 margin-b-10">
            <input type="checkbox" class="rpgib-cf-on" ${f.enabled ? 'checked' : ''} title="on/off">
            <input type="text" class="text_pole rpgib-cf-emoji" style="width:44px;text-align:center" value="${escapeHtml(f.emoji || '')}" placeholder="${escapeHtml(t('ph_emoji'))}">
            <input type="text" class="text_pole rpgib-cf-label" style="flex:1" value="${escapeHtml(f.label || '')}" placeholder="${escapeHtml(t('ph_label'))}">
            <input type="text" class="text_pole rpgib-cf-hint" style="flex:2" value="${escapeHtml(f.hint || '')}" placeholder="${escapeHtml(t('ph_hint'))}">
            <div class="menu_button rpgib-cf-del" title="${escapeHtml(t('remove'))}"><i class="fa-solid fa-trash"></i></div>
        </div>`);
        row.find('.rpgib-cf-on').on('change', function () { f.enabled = this.checked; saveSettings(); rerenderAll(); });
        row.find('.rpgib-cf-emoji').on('input', function () { f.emoji = $(this).val(); saveSettings(); rerenderAll(); });
        row.find('.rpgib-cf-label').on('input', function () { f.label = $(this).val(); saveSettings(); rerenderAll(); });
        row.find('.rpgib-cf-hint').on('input', function () { f.hint = $(this).val(); saveSettings(); });
        row.find('.rpgib-cf-del').on('click', function () { settings.customFields.splice(idx, 1); saveSettings(); renderCustomList(); rerenderAll(); });
        box.append(row);
    });
}
function exportSettings() {
    const cfg = Object.assign({}, settings); delete cfg.apiKey; // never export the API key
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'rpg-info-box-settings.json';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
function importSettings(file) {
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const obj = JSON.parse(reader.result);
            const key = settings.apiKey;                       // keep local key
            settings = Object.assign({}, defaultSettings, settings, obj);
            settings.apiKey = key;
            if (!Array.isArray(settings.customFields)) settings.customFields = [];
            saveSettings();
            rebuildSettingsUI();
            updateContextInjection();
            rerenderAll();
        } catch (e) { console.error('[RPG Scene Card] import failed', e); alert(t('importErr')); }
    };
    reader.readAsText(file);
}
function rebuildSettingsUI() {
    $('.rpg-infobox-settings').remove();
    setupUI();
    $('#rpgib-drawer-content').show();
    $('.rpg-infobox-settings .rpgib-drawer-toggle .inline-drawer-icon').removeClass('down').addClass('up');
}

function setupUI() {
    $('#extensions_settings2').append(settingsHtml());
    const root = $('.rpg-infobox-settings');
    root.find('.rpgib-drawer-toggle').on('click', function () { $('#rpgib-drawer-content').slideToggle(150); $(this).find('.inline-drawer-icon').toggleClass('down up'); });

    $('#rpgib-enabled').prop('checked', settings.enabled).on('change', function () { settings.enabled = this.checked; saveSettings(); updateContextInjection(); });
    $('#rpgib-lang').val(settings.language).on('change', function () { settings.language = this.value; saveSettings(); applyI18n(root); renderCustomList(); $('#rpgib-temp-val').text(settings.temperature); rerenderAll(); });
    $('#rpgib-base-url').val(settings.baseUrl).on('input', function () { settings.baseUrl = $(this).val(); saveSettings(); });
    $('#rpgib-api-key').val(settings.apiKey).on('input', function () { settings.apiKey = $(this).val(); saveSettings(); });
    $('#rpgib-model').val(settings.model).on('input', function () { settings.model = $(this).val(); saveSettings(); });
    $('#rpgib-temperature').val(settings.temperature).on('input', function () { const v = parseFloat($(this).val()); $('#rpgib-temp-val').text(v); settings.temperature = v; saveSettings(); });
    $('#rpgib-temp-val').text(settings.temperature);
    $('#rpgib-scan').val(settings.scanCount).on('change', function () { settings.scanCount = parseInt($(this).val()) || 10; saveSettings(); });
    $('#rpgib-stats').val(settings.statsCount).on('change', function () { settings.statsCount = Math.max(0, parseInt($(this).val()) || 0); saveSettings(); });
    $('#rpgib-inject-context').prop('checked', settings.injectContext).on('change', function () { settings.injectContext = this.checked; saveSettings(); updateContextInjection(); });
    $('#rpgib-inject-depth').val(settings.injectDepth).on('change', function () { settings.injectDepth = parseInt($(this).val()) || 0; saveSettings(); updateContextInjection(); });
    $('#rpgib-only-last').prop('checked', settings.onlyLast).on('change', function () { settings.onlyLast = this.checked; saveSettings(); rerenderAll(); });
    $('#rpgib-export').on('click', exportSettings);
    $('#rpgib-import').on('click', () => $('#rpgib-import-file').click());
    $('#rpgib-import-file').on('change', function () { if (this.files && this.files[0]) importSettings(this.files[0]); this.value = ''; });

    const bindField = (id, key) => $(id).prop('checked', settings[key]).on('change', function () { settings[key] = this.checked; saveSettings(); rerenderAll(); });
    bindField('#rpgib-f-date', 'showDate'); bindField('#rpgib-f-time', 'showTime'); bindField('#rpgib-f-loc', 'showLocation');
    bindField('#rpgib-f-chars', 'showCharacters'); bindField('#rpgib-f-level', 'showLevel');

    $('#rpgib-title').val(settings.title).on('input', function () { settings.title = $(this).val(); saveSettings(); rerenderAll(); });
    $('#rpgib-dyn').prop('checked', settings.dynamicPrompt).on('change', function () { settings.dynamicPrompt = this.checked; saveSettings(); });
    $('#rpgib-prompt').val(settings.prompt).on('input', function () { settings.prompt = $(this).val(); saveSettings(); });
    $('#rpgib-prompt-reset').on('click', function () { settings.prompt = settings.language === 'ru' ? DEFAULT_PROMPT_RU : DEFAULT_PROMPT_EN; $('#rpgib-prompt').val(settings.prompt); saveSettings(); });

    $('#rpgib-add-field').on('click', function () {
        settings.customFields.push({ id: 'cf' + Date.now().toString(36), emoji: '🔹', label: '', hint: '', enabled: true });
        saveSettings(); renderCustomList();
    });

    renderCustomList();
    applyI18n(root);
}

/* ===================== RE-RENDER CACHED ===================== */
function rerenderAll() {
    if (!settings.enabled) return;
    const chat = getContext().chat || [];
    const last = latestBotIndex();
    if (settings.onlyLast) clearOtherBoxes(last);
    chat.forEach((m, id) => {
        if (m && !m.is_user && !m.is_system && m.extra?.rpg_info_box) {
            if (!settings.onlyLast || id === last) renderInfoBox(id, m.extra.rpg_info_box);
        }
    });
}

/* ===================== INIT ===================== */
jQuery(() => {
    try {
        loadSettings();
        setupUI();
        updateContextInjection();

        eventSource.on(event_types.CHAT_CHANGED, () => { rerenderAll(); updateContextInjection(); });
        const reRender = (messageId) => {
            if (!settings.enabled) return;
            const msg = getContext().chat[messageId];
            if (!(msg && !msg.is_user && !msg.is_system)) return;
            if (settings.onlyLast && messageId !== latestBotIndex()) { removeBox(messageId); return; }
            if (msg.extra?.rpg_info_box) renderInfoBox(messageId, msg.extra.rpg_info_box);
        };
        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, reRender);
        eventSource.on(event_types.MESSAGE_EDITED, reRender);
        if (event_types.MESSAGE_UPDATED) eventSource.on(event_types.MESSAGE_UPDATED, reRender);

        eventSource.on(event_types.MESSAGE_RECEIVED, (messageId) => {
            const msg = getContext().chat[messageId];
            if (msg && !msg.is_user && !msg.is_system) setTimeout(() => processMessage(messageId, false), 50);
        });
        eventSource.on(event_types.MESSAGE_SWIPED, (messageId) => {
            const msg = getContext().chat[messageId];
            if (msg && !msg.is_user && !msg.is_system) setTimeout(() => processMessage(messageId, true), 50);
        });
    } catch (e) { console.error('[RPG Scene Card] Fatal init error:', e); }
});

/* ============================================================
   CROSS-EXTENSION BRIDGE — lets the Diary (and others) read the
   current in-game time / date / weather / location. Read-only,
   safe no-op for anyone who doesn't use it.
   ============================================================ */
function rpgSceneLatestData() {
    try {
        const chat = getContext().chat || [];
        for (let i = chat.length - 1; i >= 0; i--) {
            const d = chat[i] && chat[i].extra && chat[i].extra.rpg_info_box;
            if (d && typeof d === 'object') return d;
        }
    } catch (e) { /* ignore */ }
    return null;
}
function rpgSceneDayNumber(dateStr) {
    if (!dateStr) return null;
    const m = String(dateStr).match(/(\d{1,4})/);
    return m ? parseInt(m[1]) : null;
}
window.RPG = window.RPG || {};
window.RPG.scene = {
    available: true,
    isEnabled: () => !!settings.enabled,
    get: () => {
        const d = rpgSceneLatestData();
        if (!d) return null;
        const label = [d.date, d.time].filter(Boolean).join(' · ') || d.date || d.time || null;
        return {
            label, timeLabel: label,
            date: d.date || null, time: d.time || null,
            weather: d.weather || null, location: d.location || null,
            day: rpgSceneDayNumber(d.date),
            characters: Array.isArray(d.characters) ? d.characters : [],
            level: d.level || null,
            raw: d
        };
    },
    getRaw: () => rpgSceneLatestData()
};
