#!/usr/bin/env node
// Commit Chess — renders chess/board.svg from a GitHub contribution calendar.
//
// The whole game is replayed from the calendar on every run, so there is no
// state file to drift or corrupt:
//   • every active day moves the next pawn one square up the board;
//     on rank 8 it promotes to a queen. Promote all 8 to win the board.
//   • a chess clock guards the game: +3:00 per active day (increment),
//     −10:00 per idle day. If the flag falls, the board resets.
//
// Usage:
//   GITHUB_TOKEN=… GITHUB_USERNAME=aarussh22 node chess/generate.mjs
//   node chess/generate.mjs --demo        # synthetic data, no network

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'board.svg');

const RULES = {
  startDate: process.env.START_DATE || '2026-10-12', // the game is replayed from this day
  clockMax: 60,
  increment: 3,
  idlePenalty: 10,
  order: [4, 3, 5, 2, 6, 1, 7, 0], // centre pawns first: e d f c g b h a
};

// Contributions in a day → piece shown in the "last 14 days" rank.
const TIERS = [[15, 'king'], [10, 'queen'], [7, 'rook'], [5, 'bishop'], [3, 'knight'], [1, 'pawn']];
const FILES = 'abcdefgh';
const DAY_MS = 86_400_000;

const isoDay = (d) => d.toISOString().slice(0, 10);
const addDays = (date, n) => isoDay(new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS));
const shortDate = (date) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

// ───────────────────────────── data ─────────────────────────────

async function fetchCalendar(login, token, start, end) {
  const query = `query($login:String!,$from:DateTime!,$to:DateTime!){
    user(login:$login){ contributionsCollection(from:$from,to:$to){
      contributionCalendar{ weeks{ contributionDays{ date contributionCount } } } } } }`;
  const days = new Map();
  // contributionsCollection spans at most one year per request.
  for (let from = start; from <= end; from = addDays(from, 365)) {
    const to = addDays(from, 364) < end ? addDays(from, 364) : end;
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { login, from: `${from}T00:00:00Z`, to: `${to}T23:59:59Z` } }),
    });
    const json = await res.json();
    if (!res.ok || json.errors) throw new Error(`GitHub API: ${JSON.stringify(json.errors ?? json)}`);
    for (const week of json.data.user.contributionsCollection.contributionCalendar.weeks)
      for (const d of week.contributionDays)
        if (d.date >= start && d.date <= end) days.set(d.date, d.contributionCount);
  }
  return fillDays(days, start, end);
}

function demoCalendar(start, end) {
  let seed = 22;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const days = new Map();
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const weekend = [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());
    days.set(d, rand() < (weekend ? 0.45 : 0.85) ? Math.floor(rand() ** 2 * 18) + 1 : 0);
  }
  return fillDays(days, start, end);
}

function fillDays(map, start, end) {
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push({ date: d, count: map.get(d) ?? 0 });
  return out;
}

// ───────────────────────────── game ─────────────────────────────

function play(days, today) {
  const s = { clock: RULES.clockMax, wins: 0, losses: 0, moves: 0, lastEvent: null };
  const newBoard = () =>
    Object.assign(s, { ranks: Array(8).fill(2), queens: Array(8).fill(false), idx: 0, complete: false, lastMove: null });
  newBoard();

  for (const { date, count } of days) {
    if (count > 0) {
      if (s.complete) newBoard();
      const file = RULES.order[s.idx];
      const from = s.ranks[file]++;
      const promo = s.ranks[file] === 8;
      if (promo) {
        s.queens[file] = true;
        s.idx++;
      }
      if (s.idx === 8) {
        s.complete = true;
        s.wins++;
      }
      s.clock = Math.min(RULES.clockMax, s.clock + RULES.increment);
      s.moves++;
      s.lastMove = { file, from, to: from + 1, promo, date };
      s.lastEvent = { type: 'move', date };
    } else if (date !== today) {
      // Today is still in progress, so it is never penalised.
      s.clock -= RULES.idlePenalty;
      if (s.clock <= 0) {
        s.losses++;
        s.clock = RULES.clockMax;
        newBoard();
        s.lastEvent = { type: 'flag', date };
      } else {
        s.lastEvent = { type: 'idle', date };
      }
    }
  }

  let i = days.length - 1;
  if (days[i]?.date === today && days[i].count === 0) i--;
  s.streak = 0;
  while (i >= 0 && days[i].count > 0) s.streak++, i--;
  return s;
}

// ───────────────────────────── render ─────────────────────────────

// Hand-drawn piece silhouettes on a 40×40 grid (no font dependency, so they
// look identical everywhere and never fall back to emoji).
const BASE = '<rect x="10" y="32.5" width="20" height="4.5" rx="1.6"/>';
const PIECES = {
  pawn: `<circle cx="20" cy="11.5" r="5.6"/><path d="M14 33c0-5.6 2.6-8.8 4.6-11.2h-3v-3h8.8v3h-3c2 2.4 4.6 5.6 4.6 11.2z"/>${BASE}`,
  knight: `<path d="M13 33c-.4-4.4 1.4-7.6 4.6-10.6.9-.9 1.5-2 1.6-3.1-1.7 1.4-3.6 2.1-5.6 2.4-1.7.3-3.3-.4-3.9-1.8-.6-1.4.2-2.6 1.4-3.6 1.8-1.5 3.1-3.6 4-5.8l-.3-3.6 2.7 2.1 1.4-2.8 1.4 3.3c5.2 1.6 8.6 6.4 8.6 14.1V33z"/><circle cx="18.4" cy="11.6" r="1.1" class="eye"/>${BASE}`,
  bishop: `<circle cx="20" cy="6.6" r="2.4"/><path d="M20 8.8c-3.9 2.6-6.2 6-6.2 9.2 0 2.8 1.8 4.4 3.6 5h5.2c1.8-.6 3.6-2.2 3.6-5 0-3.2-2.3-6.6-6.2-9.2z"/><path d="M15.4 23h9.2v2.8h-9.2zM15 33c.8-3.2 2-5.4 2.6-7.2h4.8c.6 1.8 1.8 4 2.6 7.2z"/><path d="M21.6 12.6l-3.4 3.4" class="cut"/>${BASE}`,
  rook: `<path d="M11.5 17.5V9.6h3.6v3h2.9v-3h4v3h2.9v-3h3.6v7.9z"/><path d="M13.2 33l1.6-15.5h10.4L26.8 33z"/>${BASE}`,
  queen: `<path d="M12 33 9 14.4l5.2 9L15.4 10l3 12.4L20 8.4l1.6 14L24.6 10l1.2 13.4 5.2-9L28 33z"/><circle cx="9" cy="13.4" r="2.2"/><circle cx="15.4" cy="9" r="2.2"/><circle cx="20" cy="7.2" r="2.2"/><circle cx="24.6" cy="9" r="2.2"/><circle cx="31" cy="13.4" r="2.2"/>${BASE}`,
  king: `<path d="M19 3.4h2v3.2h3v2h-3v4.2h-2V8.6h-3v-2h3z"/><path d="M12.4 33c-2.6-6.2-4.4-12.4-.4-14.6 3.4-1.8 6.4 1 8 3.4 1.6-2.4 4.6-5.2 8-3.4 4 2.2 2.2 8.4-.4 14.6z"/><path d="M13.6 27h12.8" class="cut"/>${BASE}`,
};

function render(s, days, login, today) {
  const W = 860, H = 440;
  const SQ = 40, BX = 28, BY = 92;
  const sqX = (f) => BX + f * SQ;
  const sqY = (r) => BY + (8 - r) * SQ;
  const T = 6; // seconds per animation loop
  const parts = [];
  const add = (str) => parts.push(str);

  // ── board ──
  for (let r = 1; r <= 8; r++)
    for (let f = 0; f < 8; f++)
      add(`<rect x="${sqX(f)}" y="${sqY(r)}" width="${SQ}" height="${SQ}" class="${(f + r) % 2 ? 'dk' : 'lt'}"/>`);
  for (let f = 0; f < 8; f++)
    add(`<text x="${sqX(f) + SQ - 3}" y="${BY + 8 * SQ - 3}" class="coord ${f % 2 ? 'on-lt' : 'on-dk'}" text-anchor="end">${FILES[f]}</text>`);
  for (let r = 1; r <= 8; r++)
    add(`<text x="${BX + 3}" y="${sqY(r) + 10}" class="coord ${r % 2 ? 'on-dk' : 'on-lt'}">${r}</text>`);

  const lm = s.lastMove;
  if (lm) {
    add(`<rect x="${sqX(lm.file)}" y="${sqY(lm.from)}" width="${SQ}" height="${SQ}" class="hl"/>`);
    add(`<rect x="${sqX(lm.file)}" y="${sqY(lm.to)}" width="${SQ}" height="${SQ}" class="hl"/>`);
  }

  // Hint dot on the square the next commit will move to.
  if (!s.complete) {
    const f = RULES.order[s.idx];
    const cx = sqX(f) + SQ / 2, cy = sqY(s.ranks[f] + 1) + SQ / 2;
    add(`<circle cx="${cx}" cy="${cy}" r="6" class="hint">
      <animate attributeName="r" values="5;8;5" dur="1.8s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values=".35;.7;.35" dur="1.8s" repeatCount="indefinite"/></circle>`);
  }

  const ease = 'calcMode="spline" keySplines="0 0 1 1;.45 0 .2 1;0 0 1 1"';
  for (let f = 0; f < 8; f++) {
    const x = sqX(f), y = sqY(s.ranks[f]);
    const isLast = lm && lm.file === f;
    if (s.queens[f]) {
      add(`<circle cx="${x + SQ / 2}" cy="${y + SQ / 2}" r="19" fill="url(#glow)" opacity=".3">
        <animate attributeName="opacity" values=".15;.75;.15" dur="3s" begin="${(f * 0.37).toFixed(2)}s" repeatCount="indefinite"/></circle>`);
    }
    if (isLast) {
      // Replay the most recent move on a loop: slide in from the previous square.
      add(`<g transform="translate(${x} ${y})"><g>
        <animateTransform attributeName="transform" type="translate" values="0 ${SQ};0 ${SQ};0 0;0 0" keyTimes="0;.14;.34;1" ${ease} dur="${T}s" repeatCount="indefinite"/>`);
      if (lm.promo) {
        add(`<use href="#pawn" width="${SQ}" height="${SQ}" class="pc">
          <animate attributeName="opacity" values="1;1;0;0" keyTimes="0;.36;.44;1" dur="${T}s" repeatCount="indefinite"/></use>
          <use href="#queen" width="${SQ}" height="${SQ}" class="pc" opacity="1">
          <animate attributeName="opacity" values="0;0;1;1" keyTimes="0;.36;.44;1" dur="${T}s" repeatCount="indefinite"/></use>`);
      } else {
        add(`<use href="#pawn" width="${SQ}" height="${SQ}" class="pc"/>`);
      }
      add('</g>');
      if (lm.promo)
        add(`<circle cx="${SQ / 2}" cy="${SQ / 2}" r="8" class="burst" opacity="0">
          <animate attributeName="r" values="8;8;30;30" keyTimes="0;.36;.6;1" dur="${T}s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0;.95;0;0" keyTimes="0;.36;.6;1" dur="${T}s" repeatCount="indefinite"/></circle>`);
      add('</g>');
    } else {
      add(`<use href="#${s.queens[f] ? 'queen' : 'pawn'}" x="${x}" y="${y}" width="${SQ}" height="${SQ}" class="pc"/>`);
    }
  }

  if (s.complete) {
    add(`<g opacity="0"><animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;.3;.4;.9;1" dur="${T}s" repeatCount="indefinite"/>
      <rect x="${BX + 40}" y="${BY + 138}" width="240" height="44" rx="10" class="banner"/>
      <text x="${BX + 160}" y="${BY + 166}" text-anchor="middle" class="banner-t">Board won · 8/8 queens</text></g>`);
  }

  // ── clock ──
  const CX = 470, CY = 186, R = 56;
  const C = 2 * Math.PI * R;
  const frac = s.clock / RULES.clockMax;
  const low = s.clock <= 15;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * 2 * Math.PI;
    const r1 = R + 9, r2 = R + (i % 3 ? 12 : 15);
    add(`<line x1="${(CX + r1 * Math.sin(a)).toFixed(1)}" y1="${(CY - r1 * Math.cos(a)).toFixed(1)}" x2="${(CX + r2 * Math.sin(a)).toFixed(1)}" y2="${(CY - r2 * Math.cos(a)).toFixed(1)}" class="tick"/>`);
  }
  add(`<circle cx="${CX}" cy="${CY}" r="${R}" class="track"/>`);
  add(`<circle cx="${CX}" cy="${CY}" r="${R}" class="arc${low ? ' low' : ''}" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${(C * (1 - frac)).toFixed(2)}" transform="rotate(-90 ${CX} ${CY})">
    <animate attributeName="stroke-dashoffset" values="0;${(C * (1 - frac)).toFixed(2)}" dur="1.8s" calcMode="spline" keySplines=".3 0 .2 1" fill="freeze"/>
    ${low ? '<animate attributeName="opacity" values="1;.35;1" dur="1s" repeatCount="indefinite"/>' : ''}</circle>`);
  // A bead orbits the dial like a sweeping second hand.
  add(`<g><animateTransform attributeName="transform" type="rotate" from="0 ${CX} ${CY}" to="360 ${CX} ${CY}" dur="${T}s" repeatCount="indefinite"/>
    <circle cx="${CX}" cy="${CY - R}" r="3.2" class="bead"/></g>`);
  const mm = String(s.clock).padStart(2, '0');
  add(`<text x="${CX - 5}" y="${CY + 9}" text-anchor="end" class="digits">${mm}</text>
    <text x="${CX}" y="${CY + 7}" text-anchor="middle" class="digits">:<animate attributeName="opacity" values="1;1;.15;.15" keyTimes="0;.5;.5;1" dur="1s" repeatCount="indefinite"/></text>
    <text x="${CX + 5}" y="${CY + 9}" class="digits">00</text>
    <text x="${CX}" y="${CY + 28}" text-anchor="middle" class="muted xs">on the clock</text>`);
  add(`<text x="${CX}" y="${CY + R + 36}" text-anchor="middle" class="muted xs">+${RULES.increment}:00 active day · −${RULES.idlePenalty}:00 idle day</text>`);

  // ── stats ──
  const stats = [
    ['Boards won', s.wins, ''],
    ['Flags fallen', s.losses, ''],
    ['Day streak', s.streak, s.streak >= 7 ? ' hot' : ''],
    ['Moves played', s.moves, ''],
  ];
  stats.forEach(([label, value, cls], i) => {
    const x = 580 + (i % 2) * 132, y = 102 + Math.floor(i / 2) * 70;
    add(`<g opacity="0"><animate attributeName="opacity" values="0;0;1" keyTimes="0;${(0.25 + i * 0.1).toFixed(2)};1" dur="${(0.6 + i * 0.12).toFixed(2)}s" fill="freeze"/>
      <rect x="${x}" y="${y}" width="122" height="60" rx="10" class="tile"/>
      <text x="${x + 12}" y="${y + 22}" class="muted xs">${label}</text>
      <text x="${x + 12}" y="${y + 48}" class="stat${cls}">${value}</text></g>`);
  });

  // Last event line under the stats.
  const ev = s.lastEvent;
  let evText = 'Waiting for the first move…';
  if (ev?.type === 'move' && lm) evText = `Last move ${FILES[lm.file]}${lm.to}${lm.promo ? '=Q' : ''} · ${shortDate(lm.date)}`;
  else if (ev?.type === 'move') evText = `Board won on ${shortDate(ev.date)}`;
  else if (ev?.type === 'idle') evText = `Idle on ${shortDate(ev.date)} · clock −${RULES.idlePenalty}:00`;
  else if (ev?.type === 'flag') evText = `Flag fell on ${shortDate(ev.date)} · new game`;
  add(`<text x="580" y="262" class="body">${evText}</text>`);
  const queens = s.queens.filter(Boolean).length;
  add(`<g transform="translate(580 272)">${Array.from({ length: 8 }, (_, i) =>
    `<use href="#queen" x="${i * 31}" width="26" height="26" class="${i < queens ? 'pc' : 'ghost'}"/>`).join('')}</g>`);

  // ── last 14 days as a rank of squares ──
  const SX = 382, SY = 342, ST = 32;
  add(`<text x="${SX}" y="${SY - 10}" class="muted xs">Last 14 days</text>`);
  const recent = days.slice(-14);
  recent.forEach(({ date, count }, i) => {
    const x = SX + i * ST;
    const tier = TIERS.find(([min]) => count >= min)?.[1];
    const isToday = date === today;
    add(`<g opacity="0"><animate attributeName="opacity" values="0;0;1" keyTimes="0;${(i / (i + 6)).toFixed(2)};1" dur="${(0.35 + i * 0.06).toFixed(2)}s" fill="freeze"/>
      <title>${date}: ${count} contribution${count === 1 ? '' : 's'}</title>
      <rect x="${x}" y="${SY}" width="${ST}" height="${ST}" class="${i % 2 ? 'dk' : 'lt'}"/>`);
    if (tier) {
      add(`<g><animateTransform attributeName="transform" type="translate" values="0 0;0 0;0 -7;0 0;0 0" keyTimes="0;.5;.56;.62;1" dur="${T}s" begin="${(i * 0.07).toFixed(2)}s" repeatCount="indefinite"/>
        <use href="#${tier}" x="${x + 2}" y="${SY + 2}" width="${ST - 4}" height="${ST - 4}" class="pc"/></g>`);
    } else {
      add(`<circle cx="${x + ST / 2}" cy="${SY + ST / 2}" r="3" class="empty"/>`);
    }
    if (isToday) add(`<rect x="${x + 1}" y="${SY + 1}" width="${ST - 2}" height="${ST - 2}" class="today"/>`);
    add(`<text x="${x + ST / 2}" y="${SY + ST + 13}" text-anchor="middle" class="muted xs">${isToday ? '•' : 'SMTWTFS'[new Date(`${date}T00:00:00Z`).getUTCDay()]}</text></g>`);
  });
  // Tier legend.
  const legend = [...TIERS].reverse();
  add(`<g transform="translate(${SX} ${SY + ST + 22})">${legend.map(([min, piece], i) =>
    `<text x="${i * 52 + 8}" y="14" text-anchor="end" class="muted xs">${min}${i === legend.length - 1 ? '+' : ''}</text><use href="#${piece}" x="${i * 52 + 10}" y="-1" width="20" height="20" class="pc sm"/>`).join('')}
    <text x="${legend.length * 52 + 4}" y="14" class="muted xs">contributions</text></g>`);

  // ── header ──
  let status;
  if (s.complete) status = `All 8 pawns promoted — board #${s.wins} won. The next commit starts a new game.`;
  else {
    const f = RULES.order[s.idx], left = 8 - s.ranks[f];
    status = `Pawn ${FILES[f]}${s.ranks[f]} is ${left} move${left === 1 ? '' : 's'} from promotion · ${queens}/8 queens · promote them all before the flag falls`;
  }

  const defs = Object.entries(PIECES)
    .map(([name, body]) => `<symbol id="${name}" viewBox="0 0 40 40">${body}</symbol>`).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="t d">
<title id="t">Commit Chess — ${login}</title>
<desc id="d">${status} Clock: ${s.clock} minutes. Boards won: ${s.wins}. Flags fallen: ${s.losses}. Day streak: ${s.streak}.</desc>
<style>
  :root { --bg:#ffffff; --border:#d0d7de; --fg:#1f2328; --muted:#656d76; --tile:#f6f8fa; --track:#eaeef2; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0d1117; --border:#30363d; --fg:#e6edf3; --muted:#8d96a0; --tile:#161b22; --track:#21262d; } }
  text { font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans",Helvetica,Arial,sans-serif; fill:var(--fg); }
  .card { fill:var(--bg); stroke:var(--border); }
  .title { font-size:22px; font-weight:700; }
  .body { font-size:13px; }
  .muted { fill:var(--muted); }
  .xs { font-size:11px; }
  .lt { fill:#f0d9b5; } .dk { fill:#b58863; }
  .coord { font-size:9px; font-weight:700; }
  .on-lt { fill:#b58863; } .on-dk { fill:#f0d9b5; }
  .hl { fill:#f6e05e; opacity:.5; }
  .hint { fill:#1f2328; }
  .pc { fill:#fbf8f1; stroke:#1f2328; stroke-width:1.6; stroke-linejoin:round; }
  .pc.sm { stroke-width:2; }
  .ghost { fill:var(--muted); opacity:.22; }
  .eye { fill:#1f2328; stroke:none; }
  .cut { fill:none; stroke:#1f2328; stroke-width:1.4; stroke-linecap:round; }
  .burst { fill:none; stroke:#f2b705; stroke-width:3; }
  .banner { fill:#1f2328; opacity:.88; } .banner-t { fill:#f2b705; font-size:18px; font-weight:700; }
  .track { fill:none; stroke:var(--track); stroke-width:10; }
  .arc { fill:none; stroke:#3fb950; stroke-width:10; stroke-linecap:round; }
  .arc.low { stroke:#f85149; }
  .tick { stroke:var(--muted); stroke-width:2; stroke-linecap:round; }
  .bead { fill:#f2b705; stroke:var(--bg); stroke-width:1.5; }
  .digits { font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:30px; font-weight:700; }
  .tile { fill:var(--tile); stroke:var(--border); }
  .stat { font-size:24px; font-weight:700; } .stat.hot { fill:#f0883e; }
  .empty { fill:#1f2328; opacity:.25; }
  .today { fill:none; stroke:#f2b705; stroke-width:2; stroke-dasharray:4 3; }
</style>
<defs>${defs}
  <radialGradient id="glow"><stop offset="0" stop-color="#ffd84d"/><stop offset="1" stop-color="#ffd84d" stop-opacity="0"/></radialGradient>
</defs>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="16" class="card"/>
<use href="#pawn" x="24" y="20" width="36" height="36" class="pc"/>
<text x="64" y="46" class="title">Commit Chess</text>
<text x="${W - 28}" y="46" text-anchor="end" class="muted xs">@${login} · updated ${shortDate(today)}</text>
<text x="28" y="74" class="muted body">${status}</text>
<rect x="${BX - 4}" y="${BY - 4}" width="${8 * SQ + 8}" height="${8 * SQ + 8}" rx="6" fill="#7a5a3a"/>
${parts.join('\n')}
</svg>
`;
}

// ───────────────────────────── main ─────────────────────────────

const today = isoDay(new Date());
const demo = process.argv.includes('--demo');
const login = process.env.GITHUB_USERNAME || 'aarussh22';
const start = demo ? addDays(today, -200) : RULES.startDate;
// Always fetch at least two weeks so the "last 14 days" rank is full.
const fetchFrom = addDays(today, -13) < start ? addDays(today, -13) : start;

const days = demo ? demoCalendar(fetchFrom, today) : await fetchCalendar(login, process.env.GITHUB_TOKEN, fetchFrom, today);
const state = play(days.filter((d) => d.date >= start), today);
writeFileSync(OUT, render(state, days, login, today));
console.log(`board.svg written — clock ${state.clock}:00, ${state.queens.filter(Boolean).length}/8 queens, W${state.wins} L${state.losses}, streak ${state.streak}`);
