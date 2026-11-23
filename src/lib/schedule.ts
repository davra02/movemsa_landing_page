/**
 * Horario editable desde Google Sheets.
 *
 * La hoja tiene tres columnas: Día · Hora · Clase (una fila por clase).
 * Se comparte como "Cualquier persona con el enlace: Lector" y se pega su ID
 * en SHEET_ID. Si está vacío o la hoja falla, se usa src/data/horario.csv.
 */

// ID de la hoja: lo que va entre /d/ y /edit en la URL de Google Sheets.
export const SHEET_ID = '1caBDDUMa3x8i1kDLXSR15CIJlnXzBNYIjN2p0E5KWEo';
// Pestaña de la hoja: el número que aparece tras "gid=" en la URL.
export const SHEET_GID = '1867494187';

export const sheetCsvUrl = (id: string) =>
  `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${SHEET_GID}`;

export type Lang = 'es' | 'en';

export interface ScheduleRow {
  day: number; // 0 = lunes … 6 = domingo
  minutes: number;
  time: string;
  name: string;
}

const DAY_KEYS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const DAY_NAMES: Record<Lang, string[]> = {
  es: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'],
  en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
};

const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/* ---------- CSV ---------- */

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function parseDay(s: string): number {
  const n = normalize(s);
  return DAY_KEYS.findIndex((d) => n.startsWith(d.slice(0, 3)));
}

function parseTime(s: string): { minutes: number; time: string } | null {
  const m = s.trim().match(/^(\d{1,2})(?:[:.h](\d{2}))?/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  return { minutes: h * 60 + min, time: `${h}:${String(min).padStart(2, '0')}` };
}

export function parseSchedule(csv: string): ScheduleRow[] {
  const rows = parseCsv(csv).filter((r) => r.some((c) => c.trim()));
  if (!rows.length) return [];

  // Localiza las columnas por su cabecera; si no hay cabecera reconocible, asume Día, Hora, Clase.
  const header = rows[0].map(normalize);
  let iDay = header.findIndex((h) => h.startsWith('dia') || h.startsWith('day'));
  let iTime = header.findIndex((h) => h.startsWith('hora') || h.startsWith('time'));
  let iName = header.findIndex((h) => h.startsWith('clase') || h.startsWith('class') || h.startsWith('actividad'));
  const hasHeader = iDay >= 0 && iTime >= 0 && iName >= 0;
  if (!hasHeader) [iDay, iTime, iName] = [0, 1, 2];

  const out: ScheduleRow[] = [];
  for (const r of rows.slice(hasHeader ? 1 : 0)) {
    const day = parseDay(r[iDay] ?? '');
    const t = parseTime(r[iTime] ?? '');
    const name = (r[iName] ?? '').trim();
    if (day < 0 || !t || !name) continue;
    out.push({ day, ...t, name });
  }
  return out;
}

/* ---------- Colores ---------- */

const KNOWN_COLORS: Record<string, string> = {
  'grupo funcional': '#6670C2',
  'barre fit': '#F3AD77',
  'hatha yoga': '#86BFF8',
  'vinyasa yoga': '#93CDE2',
  'entrenamiento y movimiento consciente': '#26C29E',
  'danza contemporanea': '#F78AAE',
  'pilates suelo': '#C291F5',
  'bailes latinos': '#E8409A',
  'yoga para liberar tensiones': '#6EEDC6',
};
const EXTRA_COLORS = ['#4BBFB5', '#E9A23B', '#7C8CF8', '#E26D5C', '#9BC53D', '#B57EDC', '#3FA7D6', '#F2C14E'];

function colorFor(name: string): string {
  const key = normalize(name);
  if (KNOWN_COLORS[key]) return KNOWN_COLORS[key];
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return EXTRA_COLORS[h % EXTRA_COLORS.length];
}

function textColorFor(bg: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.3 ? '#163330' : '#FFFFFF';
}

/* ---------- Render ---------- */

export function renderSchedule(rows: ScheduleRow[], lang: Lang): string {
  const days = DAY_NAMES[lang];
  // Lunes–viernes siempre; sábado y domingo solo si tienen clases.
  const maxDay = Math.max(4, ...rows.map((r) => r.day));
  const dayIdx = Array.from({ length: maxDay + 1 }, (_, i) => i);
  const times = [...new Map(rows.map((r) => [r.minutes, r.time])).entries()].sort((a, b) => a[0] - b[0]);

  const pill = (r: ScheduleRow) => {
    const bg = colorFor(r.name);
    return `<span class="tt-class" style="background:${bg};color:${textColorFor(bg)}">${escapeHtml(r.name)}</span>`;
  };

  // Tabla (escritorio)
  let table = `<div class="tt-table" role="table" style="--tt-days:${dayIdx.length}">`;
  table += `<div class="tt-row tt-head" role="row"><span role="columnheader"></span>${dayIdx
    .map((d) => `<span class="tt-day" role="columnheader">${days[d]}</span>`).join('')}</div>`;
  let prev = -1;
  for (const [minutes, time] of times) {
    const gap = prev >= 0 && prev < 14 * 60 && minutes >= 14 * 60;
    prev = minutes;
    table += `<div class="tt-row${gap ? ' tt-row--gap' : ''}" role="row"><span class="tt-time" role="rowheader">${time}</span>`;
    for (const d of dayIdx) {
      const cell = rows.filter((r) => r.day === d && r.minutes === minutes);
      table += `<span class="tt-cell" role="cell">${cell.map(pill).join('')}</span>`;
    }
    table += `</div>`;
  }
  table += `</div>`;

  // Móvil: pestañas por día y solo se muestra el día elegido
  const empty = lang === 'es' ? 'No hay clases este día.' : 'No classes on this day.';
  let list = `<div class="tt-list"><div class="tt-tabs" role="tablist">${dayIdx
    .map((d) => `<button type="button" class="tt-tab" role="tab" data-day="${d}" aria-selected="${d === 0}">${days[d].slice(0, 3)}</button>`)
    .join('')}</div>`;
  for (const d of dayIdx) {
    const items = rows.filter((r) => r.day === d).sort((a, b) => a.minutes - b.minutes);
    list += `<div class="tt-list-day${d === 0 ? ' is-active' : ''}" role="tabpanel" data-day="${d}"><h3>${days[d]}</h3>${
      items.length
        ? `<ul>${items.map((r) => `<li><span class="tt-time">${r.time}</span>${pill(r)}</li>`).join('')}</ul>`
        : `<p class="tt-empty">${empty}</p>`
    }</div>`;
  }
  list += `</div>`;

  return table + list;
}

/** "Lunes y miércoles · 20:00<br/>Jueves · 12:00" para una clase concreta. */
export function classTimes(rows: ScheduleRow[], className: string, lang: Lang): string {
  const key = normalize(className);
  const days = DAY_NAMES[lang];
  const and = lang === 'es' ? ' y ' : ' & ';
  const byTime = new Map<number, { time: string; days: number[] }>();
  for (const r of rows) {
    if (normalize(r.name) !== key) continue;
    const g = byTime.get(r.minutes) ?? { time: r.time, days: [] };
    if (!g.days.includes(r.day)) g.days.push(r.day);
    byTime.set(r.minutes, g);
  }
  return [...byTime.values()]
    .sort((a, b) => a.days[0] - b.days[0])
    .map(({ time, days: ds }) => {
      const names = ds.sort().map((d, i) => (i === 0 ? days[d] : lang === 'es' ? days[d].toLowerCase() : days[d]));
      const joined = names.length > 1 ? names.slice(0, -1).join(', ') + and + names.at(-1) : names[0];
      return `${joined} · ${time}`;
    })
    .join('<br/>');
}
