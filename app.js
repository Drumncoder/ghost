'use strict';

/* ============================================================
   Caraguá Ghostship — KPI de desempenho por posição
   Aplicação estática, sem backend. Dados em localStorage.
   ============================================================ */

const STORAGE_KEY = 'ghostship-kpi-v1';
const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'K', 'P'];
const UNIT_ORDER = ['Ataque', 'Defesa', 'Especial'];
const RATINGS = [
  { key: 'technique', label: 'Técnica' },
  { key: 'intensity', label: 'Intensidade' },
  { key: 'iq', label: 'Leitura de jogo' }
];
const PILLARS = [
  { key: 'production', label: 'Produção', weight: 0.4 },
  { key: 'efficiency', label: 'Eficiência', weight: 0.2 },
  { key: 'rating', label: 'Avaliação técnica', weight: 0.2 },
  { key: 'discipline', label: 'Disciplina', weight: 0.2 }
];

/* ------------------------------------------------------------
   Utilidades
   ------------------------------------------------------------ */

function n(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function avg(list) {
  const values = list.filter((value) => value != null && Number.isFinite(Number(value)));
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + Number(value), 0) / values.length;
}

function baseDiscipline(stats, extra = 0) {
  return 100 - n(stats.penalties) * 15 - extra;
}

const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

function fmt1(value) {
  return value == null || !Number.isFinite(Number(value)) ? '—' : nf1.format(Number(value));
}

function fmtInt(value) {
  return value == null || !Number.isFinite(Number(value)) ? '—' : nf0.format(Number(value));
}

function pct(part, total) {
  const base = n(total);
  if (!base) return '—';
  return `${Math.round((n(part) / base) * 100)}%`;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function norm(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function todayISO() {
  return toISODate(new Date());
}

function parseISODate(value) {
  const [year, month, day] = String(value || '').split('-').map(Number);
  if (!year || !month || !day) return new Date(2000, 0, 1, 12);
  return new Date(year, month - 1, day, 12);
}

function daysAgoISO(days) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return toISODate(date);
}

const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function fmtDateShort(value) {
  const date = parseISODate(value);
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getFullYear()).slice(-2)}`;
}

function fmtDateParts(value) {
  const date = parseISODate(value);
  return {
    day: String(date.getDate()).padStart(2, '0'),
    month: MONTHS_SHORT[date.getMonth()],
    full: `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`
  };
}

function roundHalf(value) {
  return Math.round(value * 2) / 2;
}

function indexLevel(value) {
  if (value == null) return 'level-mid';
  if (value >= 80) return 'level-high';
  if (value >= 65) return 'level-mid';
  if (value >= 45) return 'level-low';
  return 'level-poor';
}

function statusClass(status) {
  if (status === 'Ativo') return 'is-active';
  if (status === 'Lesionado') return 'is-injured';
  return 'is-inactive';
}

function posBadge(position) {
  const cfg = POSITIONS[position] || POSITIONS.QB;
  return `<span class="pos-badge" data-unit="${cfg.unit}"><i></i>${esc(position)}</span>`;
}

function typeChip(type) {
  return `<span class="type-chip ${type === 'Jogo' ? 'is-game' : 'is-training'}">${esc(type)}</span>`;
}

function statusChip(status) {
  return `<span class="status-chip ${statusClass(status)}">${esc(status)}</span>`;
}

/* ------------------------------------------------------------
   Configuração das posições
   Cada posição tem suas estatísticas, sua referência de produção
   e suas próprias medidas de eficiência e disciplina.
   ------------------------------------------------------------ */

const POSITIONS = {
  QB: {
    name: 'Quarterback',
    unit: 'Ataque',
    benchmark: 280,
    productionLabel: 'Jardas aéreas + TDs − interceptações',
    stats: [
      { key: 'passAtt', label: 'Passes tentados' },
      { key: 'passComp', label: 'Passes completos' },
      { key: 'passYds', label: 'Jardas aéreas' },
      { key: 'passTD', label: 'TDs por passe' },
      { key: 'ints', label: 'Interceptações' },
      { key: 'rushAtt', label: 'Corridas' },
      { key: 'rushYds', label: 'Jardas terrestres' },
      { key: 'sacks', label: 'Sacks sofridos' },
      { key: 'penalties', label: 'Penalidades' }
    ],
    production: (s) => s.passYds + s.passTD * 25 + s.rushYds * 0.9 - s.ints * 22 - s.sacks * 6 + s.passComp * 1.2,
    efficiency: (s) => {
      if (!s.passAtt) return null;
      const completion = s.passComp / s.passAtt;
      const yardsPerAttempt = s.passYds / s.passAtt;
      return clamp(completion / 0.62, 0, 1.15) * 55 + clamp(yardsPerAttempt / 7.3, 0, 1.15) * 45;
    },
    discipline: (s) => baseDiscipline(s, s.ints * 18)
  },
  RB: {
    name: 'Running back',
    unit: 'Ataque',
    benchmark: 140,
    productionLabel: 'Jardas + TDs − fumbles',
    stats: [
      { key: 'rushAtt', label: 'Corridas' },
      { key: 'rushYds', label: 'Jardas terrestres' },
      { key: 'rushTD', label: 'TDs terrestres' },
      { key: 'receptions', label: 'Recepções' },
      { key: 'recYds', label: 'Jardas recebidas' },
      { key: 'fumbles', label: 'Fumbles' },
      { key: 'penalties', label: 'Penalidades' }
    ],
    production: (s) => s.rushYds + s.rushTD * 25 + s.recYds * 0.9 + s.receptions * 3 - s.fumbles * 20,
    efficiency: (s) => {
      const touches = s.rushAtt + s.receptions;
      if (!touches) return null;
      const yardsPerCarry = s.rushYds / Math.max(1, s.rushAtt);
      const touchdownRate = s.rushTD / touches;
      return clamp(yardsPerCarry / 4.6, 0, 1.2) * 70 + clamp(touchdownRate / 0.06, 0, 1.2) * 30;
    },
    discipline: (s) => baseDiscipline(s, s.fumbles * 20)
  },
  WR: {
    name: 'Wide receiver',
    unit: 'Ataque',
    benchmark: 130,
    productionLabel: 'Jardas + recepções + TDs − drops',
    stats: [
      { key: 'targets', label: 'Alvos' },
      { key: 'receptions', label: 'Recepções' },
      { key: 'recYds', label: 'Jardas recebidas' },
      { key: 'recTD', label: 'TDs recebidos' },
      { key: 'drops', label: 'Drops' },
      { key: 'penalties', label: 'Penalidades' }
    ],
    production: (s) => s.recYds + s.recTD * 25 + s.receptions * 4 - s.drops * 10,
    efficiency: (s) => {
      if (!s.targets) return null;
      const catchRate = s.receptions / s.targets;
      const yardsPerTarget = s.recYds / s.targets;
      return clamp(catchRate / 0.65, 0, 1.2) * 70 + clamp(yardsPerTarget / 8.5, 0, 1.2) * 30;
    },
    discipline: (s) => baseDiscipline(s, s.drops * 8)
  },
  TE: {
    name: 'Tight end',
    unit: 'Ataque',
    benchmark: 120,
    productionLabel: 'Jardas + recepções + blocos − drops',
    stats: [
      { key: 'targets', label: 'Alvos' },
      { key: 'receptions', label: 'Recepções' },
      { key: 'recYds', label: 'Jardas recebidas' },
      { key: 'recTD', label: 'TDs recebidos' },
      { key: 'blocks', label: 'Blocos' },
      { key: 'drops', label: 'Drops' },
      { key: 'penalties', label: 'Penalidades' }
    ],
    production: (s) => s.recYds + s.recTD * 25 + s.receptions * 4 + s.blocks * 3 - s.drops * 10,
    efficiency: (s) => {
      if (!s.targets) return s.blocks ? clamp(s.blocks / 3, 0, 1.2) * 100 : null;
      const catchRate = s.receptions / s.targets;
      const yardsPerTarget = s.recYds / s.targets;
      return clamp(catchRate / 0.65, 0, 1.2) * 55 + clamp(yardsPerTarget / 7.5, 0, 1.2) * 25 + clamp(s.blocks / 3, 0, 1.2) * 20;
    },
    discipline: (s) => baseDiscipline(s, s.drops * 8)
  },
  OL: {
    name: 'Linha ofensiva',
    unit: 'Ataque',
    benchmark: 100,
    productionLabel: 'Blocos − sacks cedidos',
    stats: [
      { key: 'passBlocks', label: 'Blocos de passe' },
      { key: 'runBlocks', label: 'Blocos de corrida' },
      { key: 'sacksAllowed', label: 'Sacks cedidos' },
      { key: 'penalties', label: 'Penalidades' }
    ],
    production: (s) => s.passBlocks * 2 + s.runBlocks * 2 - s.sacksAllowed * 18,
    efficiency: (s) => 100 - s.sacksAllowed * 30 - s.penalties * 15,
    discipline: (s) => 100 - s.penalties * 20
  },
  DL: {
    name: 'Linha defensiva',
    unit: 'Defesa',
    benchmark: 80,
    productionLabel: 'Tackles + sacks + TFL + pressões',
    stats: [
      { key: 'tackles', label: 'Tackles' },
      { key: 'sacks', label: 'Sacks' },
      { key: 'tfl', label: 'TFL' },
      { key: 'pressures', label: 'Pressões' },
      { key: 'snaps', label: 'Participações' },
      { key: 'penalties', label: 'Penalidades' }
    ],
    production: (s) => s.tackles * 6 + s.sacks * 20 + s.tfl * 10 + s.pressures * 4,
    efficiency: (s) => {
      if (!s.snaps) return null;
      const impact = s.tackles + s.sacks * 1.5 + s.tfl * 1.2 + s.pressures * 0.6;
      return clamp(impact / s.snaps / 0.16, 0, 1.2) * 100;
    },
    discipline: (s) => baseDiscipline(s)
  },
  LB: {
    name: 'Linebacker',
    unit: 'Defesa',
    benchmark: 105,
    productionLabel: 'Tackles + assistências + impactos',
    stats: [
      { key: 'tackles', label: 'Tackles' },
      { key: 'assists', label: 'Assistências' },
      { key: 'tfl', label: 'TFL' },
      { key: 'sacks', label: 'Sacks' },
      { key: 'ints', label: 'Interceptações' },
      { key: 'pdef', label: 'Defesas de passe' },
      { key: 'snaps', label: 'Participações' },
      { key: 'penalties', label: 'Penalidades' }
    ],
    production: (s) => s.tackles * 6 + s.assists * 3 + s.tfl * 10 + s.sacks * 18 + s.ints * 25 + s.pdef * 6,
    efficiency: (s) => {
      if (!s.snaps) return null;
      const impact = s.tackles + s.assists * 0.5 + s.tfl * 1.5 + s.sacks * 2 + s.ints * 2.5 + s.pdef;
      return clamp(impact / s.snaps / 0.15, 0, 1.2) * 100;
    },
    discipline: (s) => baseDiscipline(s)
  },
  DB: {
    name: 'Defensive back',
    unit: 'Defesa',
    benchmark: 80,
    productionLabel: 'Tackles + INTs + defesas − passes cedidos',
    stats: [
      { key: 'tackles', label: 'Tackles' },
      { key: 'ints', label: 'Interceptações' },
      { key: 'pdef', label: 'Defesas de passe' },
      { key: 'passesAllowed', label: 'Passes cedidos' },
      { key: 'snaps', label: 'Participações' },
      { key: 'penalties', label: 'Penalidades' }
    ],
    production: (s) => s.tackles * 5 + s.ints * 25 + s.pdef * 8 - s.passesAllowed * 4,
    efficiency: (s) => {
      if (!s.snaps) return null;
      const impact = s.tackles + s.ints * 2 + s.pdef * 1.5;
      return clamp(impact / s.snaps / 0.13, 0, 1.15) * 100 - s.passesAllowed * 4;
    },
    discipline: (s) => baseDiscipline(s, s.passesAllowed * 4)
  },
  K: {
    name: 'Kicker',
    unit: 'Especial',
    benchmark: 55,
    productionLabel: 'FG + XP − chutes errados',
    stats: [
      { key: 'fgAtt', label: 'FG tentados' },
      { key: 'fgMade', label: 'FG convertidos' },
      { key: 'xpAtt', label: 'XP tentados' },
      { key: 'xpMade', label: 'XP convertidos' },
      { key: 'penalties', label: 'Penalidades' }
    ],
    production: (s) => s.fgMade * 14 + s.xpMade * 4 - (s.fgAtt - s.fgMade) * 12,
    efficiency: (s) => {
      if (!s.fgAtt && !s.xpAtt) return null;
      let score = 0;
      let weight = 0;
      if (s.fgAtt) {
        score += clamp((s.fgMade / s.fgAtt) / 0.8, 0, 1.15) * 70;
        weight += 70;
      }
      if (s.xpAtt) {
        score += clamp((s.xpMade / s.xpAtt) / 0.95, 0, 1.15) * 30;
        weight += 30;
      }
      return (score / weight) * 100;
    },
    discipline: (s) => baseDiscipline(s, (s.fgAtt - s.fgMade) * 10 + (s.xpAtt - s.xpMade) * 8)
  },
  P: {
    name: 'Punter',
    unit: 'Especial',
    benchmark: 110,
    productionLabel: 'Jardas de punt + inside 20 − touchbacks',
    stats: [
      { key: 'punts', label: 'Punts' },
      { key: 'puntYds', label: 'Jardas de punt' },
      { key: 'inside20', label: 'Inside 20' },
      { key: 'touchbacks', label: 'Touchbacks' },
      { key: 'penalties', label: 'Penalidades' }
    ],
    production: (s) => s.puntYds * 0.4 + s.inside20 * 8 - s.touchbacks * 4,
    efficiency: (s) => {
      if (!s.punts) return null;
      const average = s.puntYds / s.punts;
      const insideRate = s.inside20 / s.punts;
      return clamp(average / 40, 0, 1.2) * 70 + clamp(insideRate / 0.3, 0, 1.2) * 30;
    },
    discipline: (s) => baseDiscipline(s, s.touchbacks * 8)
  }
};

/* ------------------------------------------------------------
   Cálculo do índice
   ------------------------------------------------------------ */

function computeScore(session) {
  const cfg = POSITIONS[session.position] || POSITIONS.QB;
  const stats = session.stats || {};
  const factor = session.type === 'Treino' ? 0.62 : 1;
  const productionRaw = cfg.production(stats);
  const production = clamp((productionRaw / (cfg.benchmark * factor)) * 100, 0, 100);
  const efficiencyRaw = cfg.efficiency(stats);
  const efficiency = efficiencyRaw == null ? null : clamp(efficiencyRaw, 0, 100);
  const ratings = session.ratings || {};
  const rating = clamp(((n(ratings.technique) + n(ratings.intensity) + n(ratings.iq)) / 3) * 10, 0, 100);
  const discipline = clamp(cfg.discipline(stats), 0, 100);

  const parts = { production, rating, discipline };
  if (efficiency != null) parts.efficiency = efficiency;

  let totalWeight = 0;
  let weighted = 0;
  PILLARS.forEach((pillar) => {
    if (parts[pillar.key] == null) return;
    totalWeight += pillar.weight;
    weighted += parts[pillar.key] * pillar.weight;
  });

  const index = totalWeight ? Math.round(weighted / totalWeight) : 0;
  return {
    index,
    production: Math.round(production),
    efficiency: efficiency == null ? null : Math.round(efficiency),
    rating: Math.round(rating),
    discipline: Math.round(discipline),
    hasEfficiency: efficiency != null
  };
}

function quickRead(position, stats) {
  const s = stats || {};
  switch (position) {
    case 'QB':
      if (!s.passAtt) return 'Sem passes tentados nesta sessão.';
      return `${pct(s.passComp, s.passAtt)} de conclusão · ${fmt1(s.passYds / s.passAtt)} jardas/tentativa`;
    case 'RB':
      return `${fmt1(s.rushYds / Math.max(1, s.rushAtt))} jardas/corrida · ${fmtInt(s.rushTD)} TD(s)`;
    case 'WR':
      if (!s.targets) return 'Sem alvos registrados.';
      return `${pct(s.receptions, s.targets)} de recepção · ${fmt1(s.recYds / s.targets)} jardas/alvo`;
    case 'TE':
      if (!s.targets) return `${fmtInt(s.blocks)} bloco(s) registrados.`;
      return `${pct(s.receptions, s.targets)} de recepção · ${fmtInt(s.blocks)} bloco(s)`;
    case 'OL':
      return `${fmtInt(s.sacksAllowed)} sack(s) cedido(s) · ${fmtInt(s.penalties)} penalidade(s)`;
    case 'DL': {
      const impact = s.tackles + s.sacks * 1.5 + s.tfl * 1.2 + s.pressures * 0.6;
      return `${pct(impact, s.snaps)} de participações com impacto`;
    }
    case 'LB': {
      const impact = s.tackles + s.assists * 0.5 + s.tfl * 1.5 + s.sacks * 2 + s.ints * 2.5 + s.pdef;
      return `${pct(impact, s.snaps)} de participações com impacto`;
    }
    case 'DB': {
      const impact = s.tackles + s.ints * 2 + s.pdef * 1.5;
      return `${pct(impact, s.snaps)} de impacto · ${fmtInt(s.passesAllowed)} passe(s) cedido(s)`;
    }
    case 'K':
      return `${pct(s.fgMade, s.fgAtt)} em FG · ${pct(s.xpMade, s.xpAtt)} em XP`;
    case 'P':
      return `${fmt1(s.puntYds / Math.max(1, s.punts))} jardas/punt · ${fmtInt(s.inside20)} inside 20`;
    default:
      return '';
  }
}

function sanitizeStats(stats, position) {
  const cfg = POSITIONS[position] || POSITIONS.QB;
  const output = {};
  cfg.stats.forEach((stat) => {
    output[stat.key] = Math.max(0, Math.round(n(stats[stat.key])));
  });
  if (output.passComp != null) output.passComp = Math.min(output.passComp, output.passAtt || 0);
  if (output.fgMade != null) output.fgMade = Math.min(output.fgMade, output.fgAtt || 0);
  if (output.xpMade != null) output.xpMade = Math.min(output.xpMade, output.xpAtt || 0);
  if (output.receptions != null && output.targets != null) output.receptions = Math.min(output.receptions, output.targets);
  if (output.inside20 != null && output.punts != null) output.inside20 = Math.min(output.inside20, output.punts);
  return output;
}

/* ------------------------------------------------------------
   Estado e persistência
   ------------------------------------------------------------ */

const state = {
  athletes: [],
  sessions: [],
  tab: 'painel',
  filters: { type: 'todos', unit: 'todas', period: 'all' },
  rankingSearch: '',
  sort: { key: 'index', dir: 'desc' },
  sessionFilters: { type: 'todos', unit: 'todas', search: '' },
  drawerId: null,
  editingSessionId: null,
  editingAthleteId: null,
  modalOpen: false
};

let lastFocusDrawer = null;
let lastFocusModal = null;
let toastTimer = null;

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      athletes: state.athletes,
      sessions: state.sessions
    }));
  } catch (error) {
    toast('Não foi possível salvar neste navegador. Exporte um backup.', 'error');
  }
}

function load() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    raw = null;
  }
  if (!raw) {
    seedData();
    save();
    return;
  }
  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data.athletes) && Array.isArray(data.sessions)) {
      state.athletes = data.athletes;
      state.sessions = data.sessions;
      return;
    }
  } catch (error) {
    /* dados inválidos: recomeça com a demonstração */
  }
  seedData();
  save();
}

/* ------------------------------------------------------------
   Dados de demonstração
   ------------------------------------------------------------ */

function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateStats(position, type, skill, rng) {
  const scale = type === 'Treino' ? 0.6 : 1;
  const vol = (min, max) => Math.max(0, Math.round((min + rng() * (max - min)) * (0.85 + skill * 0.3) * scale));
  const chance = (probability) => rng() < probability;

  if (position === 'QB') {
    const passAtt = vol(20, 36);
    const completion = clamp(0.48 + skill * 0.22 + (rng() - 0.5) * 0.08, 0.4, 0.8);
    const passComp = Math.min(passAtt, Math.round(passAtt * completion));
    const passYds = Math.round(passComp * (5.8 + skill * 2.8 + rng() * 1.6));
    return {
      passAtt,
      passComp,
      passYds,
      passTD: Math.min(4, Math.round((rng() * 1.1 + skill * 1.8) * scale)),
      ints: chance(0.2) ? 1 : 0,
      rushAtt: vol(1, 5),
      rushYds: Math.round(vol(1, 5) * (2 + skill * 3 + rng() * 2)),
      sacks: chance(0.32) ? 1 : 0,
      penalties: chance(0.08) ? 1 : 0
    };
  }

  if (position === 'RB') {
    const rushAtt = vol(9, 21);
    const rushYds = Math.round(rushAtt * (3.1 + skill * 2.2 + rng() * 1.3));
    const receptions = vol(0, 4);
    return {
      rushAtt,
      rushYds,
      rushTD: chance(0.38) ? 1 : 0,
      receptions,
      recYds: Math.round(receptions * (5 + skill * 6 + rng() * 5)),
      fumbles: chance(0.1) ? 1 : 0,
      penalties: chance(0.08) ? 1 : 0
    };
  }

  if (position === 'WR') {
    const targets = vol(3, 10);
    const catchRate = clamp(0.42 + skill * 0.3 + rng() * 0.1, 0.35, 0.88);
    const receptions = Math.min(targets, Math.round(targets * catchRate));
    return {
      targets,
      receptions,
      recYds: Math.round(receptions * (8 + skill * 6 + rng() * 6)),
      recTD: chance(0.3) ? 1 : 0,
      drops: chance(0.16) ? 1 : 0,
      penalties: chance(0.06) ? 1 : 0
    };
  }

  if (position === 'TE') {
    const targets = vol(2, 7);
    const catchRate = clamp(0.45 + skill * 0.28 + rng() * 0.1, 0.35, 0.88);
    const receptions = Math.min(targets, Math.round(targets * catchRate));
    return {
      targets,
      receptions,
      recYds: Math.round(receptions * (7 + skill * 5 + rng() * 5)),
      recTD: chance(0.22) ? 1 : 0,
      blocks: vol(1, 5),
      drops: chance(0.12) ? 1 : 0,
      penalties: chance(0.06) ? 1 : 0
    };
  }

  if (position === 'OL') {
    return {
      passBlocks: vol(16, 32),
      runBlocks: vol(10, 22),
      sacksAllowed: chance(0.16) ? 1 : 0,
      penalties: chance(0.12) ? 1 : 0
    };
  }

  if (position === 'DL') {
    return {
      tackles: vol(1, 6),
      sacks: chance(0.24) ? 1 : 0,
      tfl: vol(0, 2),
      pressures: vol(0, 4),
      snaps: vol(24, 44),
      penalties: chance(0.1) ? 1 : 0
    };
  }

  if (position === 'LB') {
    return {
      tackles: vol(3, 9),
      assists: vol(1, 5),
      tfl: vol(0, 2),
      sacks: chance(0.12) ? 1 : 0,
      ints: chance(0.06) ? 1 : 0,
      pdef: vol(0, 2),
      snaps: vol(30, 58),
      penalties: chance(0.1) ? 1 : 0
    };
  }

  if (position === 'DB') {
    return {
      tackles: vol(2, 6),
      ints: chance(0.12) ? 1 : 0,
      pdef: vol(0, 3),
      passesAllowed: vol(0, 4),
      snaps: vol(28, 52),
      penalties: chance(0.1) ? 1 : 0
    };
  }

  if (position === 'K') {
    const fgAtt = vol(1, 3);
    const xpAtt = vol(1, 4);
    return {
      fgAtt,
      fgMade: Math.round(fgAtt * (0.62 + skill * 0.3)),
      xpAtt,
      xpMade: Math.round(xpAtt * (0.9 + skill * 0.08)),
      penalties: 0
    };
  }

  const punts = vol(3, 6);
  return {
    punts,
    puntYds: Math.round(punts * (32 + skill * 8 + rng() * 4)),
    inside20: vol(0, 2),
    touchbacks: chance(0.22) ? 1 : 0,
    penalties: 0
  };
}

function seedData() {
  const rng = mulberry32(20261025);
  const roster = [
    ['Rafael Muniz', 7, 'QB', 'Ativo', 186, 88, 'Capitão do ataque; leitura de cobertura.'],
    ['Diego Salles', 22, 'RB', 'Ativo', 178, 86, 'Explosão entre tackles.'],
    ['Caio Bertoldo', 28, 'RB', 'Lesionado', 175, 82, 'Recuperação de tornozelo.'],
    ['Kaique Ferraz', 11, 'WR', 'Ativo', 183, 79, 'Rota profunda e bola disputada.'],
    ['Nicolas Aguiar', 17, 'WR', 'Ativo', 180, 77, 'Slot e retorno de punt.'],
    ['Lucas Prado', 88, 'TE', 'Ativo', 190, 98, 'Bloqueio e red zone.'],
    ['Bruno Tavares', 65, 'OL', 'Ativo', 188, 120, 'Lado esquerdo da linha.'],
    ['Murilo Sampaio', 72, 'OL', 'Ativo', 185, 112, 'Lado direito da linha.'],
    ['Igor Nascimento', 91, 'DL', 'Ativo', 191, 108, 'Pressão interna.'],
    ['Thales Ribeiro', 54, 'LB', 'Ativo', 183, 96, 'Mike linebacker.'],
    ['Pedro Kauffmann', 58, 'LB', 'Ativo', 180, 92, 'Cobertura e blitz.'],
    ['Vitor Hugo', 24, 'DB', 'Ativo', 181, 84, 'Corner de pressão.'],
    ['Samuel Reis', 29, 'DB', 'Ativo', 178, 81, 'Safety de campo.'],
    ['Enzo Carvalho', 3, 'K', 'Ativo', 175, 72, 'Chutes de longa distância.'],
    ['Matheus Lira', 9, 'P', 'Ativo', 188, 85, 'Punt direcional.']
  ];

  const games = [
    { date: daysAgoISO(7), context: 'Litoral Sharks', local: 'Casa', teamScore: 28, oppScore: 14 },
    { date: daysAgoISO(21), context: 'Vale Titans', local: 'Fora', teamScore: 17, oppScore: 24 },
    { date: daysAgoISO(35), context: 'Serra Wolves', local: 'Casa', teamScore: 31, oppScore: 20 },
    { date: daysAgoISO(49), context: 'Cruzeiro Bears', local: 'Fora', teamScore: 14, oppScore: 14 },
    { date: daysAgoISO(63), context: 'Taubaté Falcons', local: 'Casa', teamScore: 24, oppScore: 21 }
  ];

  const trainings = [
    { date: daysAgoISO(2), context: 'Fundamentos por posição' },
    { date: daysAgoISO(9), context: 'Situacional de 3º down' },
    { date: daysAgoISO(16), context: 'Red zone e goal line' },
    { date: daysAgoISO(23), context: 'Proteção e pressão' },
    { date: daysAgoISO(30), context: 'Físico e velocidade' },
    { date: daysAgoISO(44), context: 'Revisão de filmagem' }
  ];

  state.athletes = [];
  state.sessions = [];

  roster.forEach((row, index) => {
    const [name, number, position, status, height, weight, notes] = row;
    const athlete = {
      id: `ath_seed_${index + 1}`,
      name,
      number,
      position,
      status,
      height,
      weight,
      notes,
      createdAt: Date.now() - (60 - index) * 86400000
    };
    state.athletes.push(athlete);
    const skill = clamp(0.32 + rng() * 0.62, 0.25, 0.95);

    games.forEach((game) => {
      const base = 5.8 + skill * 3 + rng() * 1.2;
      state.sessions.push({
        id: uid('ses'),
        athleteId: athlete.id,
        position,
        type: 'Jogo',
        date: game.date,
        context: game.context,
        local: game.local,
        teamScore: game.teamScore,
        oppScore: game.oppScore,
        duration: 150,
        stats: generateStats(position, 'Jogo', skill, rng),
        ratings: {
          technique: clamp(roundHalf(base + (rng() - 0.5) * 1.2), 4, 10),
          intensity: clamp(roundHalf(base + (rng() - 0.5) * 1.4), 4, 10),
          iq: clamp(roundHalf(base + (rng() - 0.5) * 1.2), 4, 10)
        },
        notes: '',
        createdAt: Date.now() - Math.round(rng() * 1000000)
      });
    });

    trainings.forEach((training) => {
      const base = 6 + skill * 2.8 + rng() * 1.2;
      state.sessions.push({
        id: uid('ses'),
        athleteId: athlete.id,
        position,
        type: 'Treino',
        date: training.date,
        context: training.context,
        local: null,
        teamScore: null,
        oppScore: null,
        duration: 90,
        stats: generateStats(position, 'Treino', skill, rng),
        ratings: {
          technique: clamp(roundHalf(base + (rng() - 0.5) * 1.2), 4, 10),
          intensity: clamp(roundHalf(base + (rng() - 0.5) * 1.4), 4, 10),
          iq: clamp(roundHalf(base + (rng() - 0.5) * 1.2), 4, 10)
        },
        notes: '',
        createdAt: Date.now() - Math.round(rng() * 1000000)
      });
    });
  });
}

/* ------------------------------------------------------------
   Seleção e agregação
   ------------------------------------------------------------ */

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function getFilteredSessions() {
  const { type, unit, period } = state.filters;
  let cutoff = null;
  if (period !== 'all') {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - Number(period));
    cutoff = date.getTime();
  }
  return state.sessions.filter((session) => {
    if (type !== 'todos' && session.type !== type) return false;
    if (unit !== 'todas') {
      const cfg = POSITIONS[session.position];
      if (!cfg || cfg.unit !== unit) return false;
    }
    if (cutoff != null && parseISODate(session.date).getTime() < cutoff) return false;
    return true;
  });
}

function scoreList(sessions) {
  return sessions.map((session) => ({ ...session, score: computeScore(session) }));
}

function athleteSummary(athlete, baseSessions = state.sessions) {
  const list = baseSessions
    .filter((session) => session.athleteId === athlete.id)
    .map((session) => ({ ...session, score: computeScore(session) }))
    .sort((a, b) => parseISODate(a.date) - parseISODate(b.date) || (a.createdAt || 0) - (b.createdAt || 0));

  const games = list.filter((session) => session.type === 'Jogo');
  const trainings = list.filter((session) => session.type === 'Treino');
  const gameIndex = avg(games.map((session) => session.score.index));
  const trainingIndex = avg(trainings.map((session) => session.score.index));

  let overall = null;
  if (gameIndex != null && trainingIndex != null) overall = gameIndex * 0.65 + trainingIndex * 0.35;
  else overall = gameIndex != null ? gameIndex : trainingIndex;

  const pillarAverages = (items) => {
    const output = {};
    PILLARS.forEach((pillar) => {
      output[pillar.key] = avg(items.map((session) => session.score[pillar.key]));
    });
    return output;
  };

  let trend = null;
  if (list.length >= 2) {
    const recent = list.slice(-3);
    const previous = list.slice(-6, -3);
    if (previous.length) {
      trend = avg(recent.map((session) => session.score.index)) - avg(previous.map((session) => session.score.index));
    }
  }

  return {
    athlete,
    list,
    total: list.length,
    games: games.length,
    trainings: trainings.length,
    minutes: list.reduce((sum, session) => sum + n(session.duration), 0),
    gameIndex,
    trainingIndex,
    overall,
    trend,
    spark: list.slice(-8).map((session) => session.score.index),
    pillars: { Jogo: pillarAverages(games), Treino: pillarAverages(trainings) },
    combinedPillars: pillarAverages(list),
    last: list.length ? list[list.length - 1] : null,
    record: recordText(games)
  };
}

function recordText(games) {
  let wins = 0;
  let losses = 0;
  let ties = 0;
  games.forEach((game) => {
    if (!Number.isFinite(Number(game.teamScore)) || !Number.isFinite(Number(game.oppScore))) return;
    if (Number(game.teamScore) > Number(game.oppScore)) wins += 1;
    else if (Number(game.teamScore) < Number(game.oppScore)) losses += 1;
    else ties += 1;
  });
  if (!wins && !losses && !ties) return '';
  return `${wins}V ${losses}D${ties ? ` ${ties}E` : ''}`;
}

function sparkline(values) {
  const width = 58;
  const height = 20;
  const pad = 3;
  if (!values.length) return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" aria-hidden="true"></svg>`;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : pad + (index / (values.length - 1)) * (width - pad * 2);
    const y = height - pad - ((value - min) / span) * (height - pad * 2);
    return [x, y];
  });
  const path = points.map((point, index) => `${index ? 'L' : 'M'}${point[0].toFixed(1)} ${point[1].toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" aria-hidden="true"><path d="${path}"/><circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="1.8"/></svg>`;
}

function trendHtml(trend) {
  if (trend == null || !Number.isFinite(trend)) return '<span class="trend flat">—</span>';
  const className = trend > 0.4 ? 'up' : trend < -0.4 ? 'down' : 'flat';
  const arrow = trend > 0.4 ? '▲' : trend < -0.4 ? '▼' : '–';
  const sign = trend > 0.4 ? '+' : '';
  return `<span class="trend ${className}">${arrow} ${sign}${fmt1(trend)}</span>`;
}

function indexCell(value) {
  if (value == null) return '<div class="index-cell"><span class="index-value">—</span></div>';
  return `<div class="index-cell ${indexLevel(value)}"><span class="index-value">${Math.round(value)}</span><span class="index-bar"><i style="width:${clamp(value, 0, 100)}%"></i></span></div>`;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

/* ------------------------------------------------------------
   Painel
   ------------------------------------------------------------ */

function renderDashboard() {
  const filtered = getFilteredSessions();
  renderSummary(filtered);
  renderRanking(filtered);
  renderPositionChart(filtered);
  renderRecent(filtered);
}

function renderSummary(filtered) {
  const scored = scoreList(filtered);
  const games = scored.filter((session) => session.type === 'Jogo');
  const trainings = scored.filter((session) => session.type === 'Treino');
  const allAverage = avg(scored.map((session) => session.score.index));
  const gameAverage = avg(games.map((session) => session.score.index));
  const trainingAverage = avg(trainings.map((session) => session.score.index));
  const activeAthletes = state.athletes.filter((athlete) => athlete.status === 'Ativo').length;
  const record = recordText(games);

  setText('sumIndex', allAverage == null ? '—' : Math.round(allAverage));
  setText('sumIndexSub', scored.length ? `${scored.length} sessões · 65% jogos / 35% treinos` : 'sem sessões no recorte');

  setText('sumGames', gameAverage == null ? '—' : Math.round(gameAverage));
  setText('sumGamesSub', games.length ? `${games.length} jogos${record ? ` · ${record}` : ''}` : 'sem jogos no recorte');

  setText('sumTraining', trainingAverage == null ? '—' : Math.round(trainingAverage));
  setText('sumTrainingSub', trainings.length ? `${trainings.length} treinos registrados` : 'sem treinos no recorte');

  setText('sumSessions', fmtInt(filtered.length));
  setText('sumSessionsSub', `${games.length} jogos · ${trainings.length} treinos`);

  setText('sumAthletes', fmtInt(activeAthletes));
  setText('sumAthletesSub', `${state.athletes.length} no elenco`);
}

function rankingRows(filtered = getFilteredSessions()) {
  let rows = state.athletes
    .map((athlete) => ({ athlete, summary: athleteSummary(athlete, filtered) }))
    .filter((row) => row.summary.total > 0);

  const query = norm(state.rankingSearch.trim());
  if (query) {
    rows = rows.filter((row) => {
      const cfg = POSITIONS[row.athlete.position];
      return norm(row.athlete.name).includes(query)
        || norm(row.athlete.number).includes(query)
        || norm(row.athlete.position).includes(query)
        || norm(cfg?.name).includes(query)
        || norm(cfg?.unit).includes(query);
    });
  }

  const direction = state.sort.dir === 'asc' ? 1 : -1;
  rows.sort((a, b) => {
    let first;
    let second;
    switch (state.sort.key) {
      case 'name':
        first = norm(a.athlete.name);
        second = norm(b.athlete.name);
        break;
      case 'position':
        first = POSITION_ORDER.indexOf(a.athlete.position);
        second = POSITION_ORDER.indexOf(b.athlete.position);
        break;
      case 'game':
        first = a.summary.gameIndex ?? -1;
        second = b.summary.gameIndex ?? -1;
        break;
      case 'training':
        first = a.summary.trainingIndex ?? -1;
        second = b.summary.trainingIndex ?? -1;
        break;
      case 'trend':
        first = a.summary.trend ?? -999;
        second = b.summary.trend ?? -999;
        break;
      default:
        first = a.summary.overall ?? -1;
        second = b.summary.overall ?? -1;
    }
    if (typeof first === 'string') {
      const comparison = first.localeCompare(second, 'pt-BR');
      if (comparison !== 0) return comparison * direction;
    } else if (first !== second) {
      return (first - second) * direction;
    }
    return norm(a.athlete.name).localeCompare(norm(b.athlete.name), 'pt-BR');
  });
  return rows;
}

function renderRankingHeader() {
  $$('.ranking-table .sort-btn').forEach((button) => {
    const active = button.dataset.sort === state.sort.key;
    button.classList.toggle('is-sorted', active);
    if (active) button.dataset.dir = state.sort.dir;
    else delete button.dataset.dir;
  });
}

function renderRanking(filtered = getFilteredSessions()) {
  const rows = rankingRows(filtered);
  renderRankingHeader();
  setText('rankingSub', rows.length
    ? `${rows.length} atletas no filtro · 65% jogos / 35% treinos`
    : 'Índice geral com 65% de peso para jogos e 35% para treinos.');

  const body = document.getElementById('rankingBody');
  const empty = document.getElementById('rankingEmpty');
  if (!body) return;

  if (!rows.length) {
    body.innerHTML = '';
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;

  body.innerHTML = rows.map((row, index) => {
    const { athlete, summary } = row;
    return `<tr data-open-athlete="${esc(athlete.id)}" tabindex="0" aria-label="Abrir detalhes de ${esc(athlete.name)}">
      <td><span class="rank ${index < 3 ? 'is-top' : ''}">${String(index + 1).padStart(2, '0')}</span></td>
      <td>
        <div class="player-cell">
          <span class="jersey">${esc(athlete.number)}</span>
          <span>
            <span class="player-name">${esc(athlete.name)}</span>
            <span class="player-meta">${summary.total} sessões · ${summary.games}J ${summary.trainings}T</span>
          </span>
        </div>
      </td>
      <td>${posBadge(athlete.position)}</td>
      <td class="num" title="${summary.games} jogos">${summary.gameIndex == null ? '—' : Math.round(summary.gameIndex)}</td>
      <td class="num" title="${summary.trainings} treinos">${summary.trainingIndex == null ? '—' : Math.round(summary.trainingIndex)}</td>
      <td class="num">${indexCell(summary.overall)}</td>
      <td>
        <div class="trend-cell">
          ${trendHtml(summary.trend)}
          ${sparkline(summary.spark)}
        </div>
      </td>
    </tr>`;
  }).join('');
}

function renderPositionChart(filtered = getFilteredSessions()) {
  const container = document.getElementById('positionChart');
  if (!container) return;

  const unitFilter = state.filters.unit;
  const positions = [...new Set(state.athletes.map((athlete) => athlete.position))]
    .filter((position) => POSITIONS[position] && (unitFilter === 'todas' || POSITIONS[position].unit === unitFilter));

  if (!positions.length) {
    container.innerHTML = '<div class="empty"><p>Nenhuma posição no filtro atual.</p></div>';
    return;
  }

  const scored = scoreList(filtered);
  const rows = positions.map((position) => {
    const sessions = scored.filter((session) => session.position === position);
    const games = sessions.filter((session) => session.type === 'Jogo');
    const trainings = sessions.filter((session) => session.type === 'Treino');
    return {
      position,
      game: avg(games.map((session) => session.score.index)),
      training: avg(trainings.map((session) => session.score.index)),
      overall: avg(sessions.map((session) => session.score.index)),
      athletes: state.athletes.filter((athlete) => athlete.position === position).length
    };
  }).sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1) || POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position));

  container.innerHTML = rows.map((row) => {
    const gameValue = row.game == null ? null : Math.round(row.game);
    const trainingValue = row.training == null ? null : Math.round(row.training);
    const muted = row.overall == null ? ' is-muted' : '';
    return `<div class="pos-row${muted}">
      <div class="pos-id">
        <b>${esc(row.position)}</b>
        <span>${row.athletes} atleta${row.athletes === 1 ? '' : 's'}</span>
      </div>
      <div class="pos-bars">
        <div class="pos-bar">
          <span class="bar-track"><i style="width:${clamp(gameValue ?? 0, 0, 100)}%"></i></span>
          <em>${gameValue == null ? '—' : gameValue}</em>
        </div>
        <div class="pos-bar">
          <span class="bar-track training"><i style="width:${clamp(trainingValue ?? 0, 0, 100)}%"></i></span>
          <em>${trainingValue == null ? '—' : trainingValue}</em>
        </div>
      </div>
    </div>`;
  }).join('');
}

function renderRecent(filtered = getFilteredSessions()) {
  const container = document.getElementById('recentList');
  if (!container) return;
  const recent = scoreList(filtered)
    .sort((a, b) => parseISODate(b.date) - parseISODate(a.date) || (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 6);

  if (!recent.length) {
    container.innerHTML = '<div class="empty"><p>Nenhuma sessão no recorte. Registre um jogo ou treino para começar.</p><button type="button" class="btn btn-primary" data-action="new-session">Registrar sessão</button></div>';
    return;
  }

  container.innerHTML = recent.map((session) => {
    const athlete = state.athletes.find((item) => item.id === session.athleteId);
    if (!athlete) return '';
    const date = fmtDateParts(session.date);
    return `<button type="button" class="recent-item" data-open-athlete="${esc(athlete.id)}">
      <span class="recent-date"><b>${date.day}</b><span>${date.month}</span></span>
      <span class="recent-main">
        <span class="recent-name">${esc(athlete.name)}</span>
        <span class="recent-context">${esc(session.context || session.type)} · ${esc(session.position)}</span>
      </span>
      <span class="recent-score">
        ${typeChip(session.type)}
        ${indexCell(session.score.index)}
      </span>
    </button>`;
  }).join('');
}

function renderBenchmarks() {
  const body = document.querySelector('#benchmarkTable tbody');
  if (!body) return;
  body.innerHTML = POSITION_ORDER.map((position) => {
    const cfg = POSITIONS[position];
    return `<tr>
      <td>${position}</td>
      <td>${esc(cfg.productionLabel)}</td>
      <td class="num">${cfg.benchmark}</td>
    </tr>`;
  }).join('');
}

/* ------------------------------------------------------------
   Elenco
   ------------------------------------------------------------ */

const ICON_EDIT = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.8 2.5l2.7 2.7L5.2 13.5l-3.4.7.7-3.4 8.3-8.3Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';
const ICON_TRASH = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.8 4.2h10.4M6.2 4.2V2.6h3.6v1.6M4.3 4.2l.5 9.2h6.4l.5-9.2M6.4 6.4v5M9.6 6.4v5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_CLOSE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

function renderRoster() {
  const grid = document.getElementById('rosterGrid');
  const empty = document.getElementById('rosterEmpty');
  if (!grid) return;

  const active = state.athletes.filter((athlete) => athlete.status === 'Ativo').length;
  const injured = state.athletes.filter((athlete) => athlete.status === 'Lesionado').length;
  const positions = new Set(state.athletes.map((athlete) => athlete.position)).size;
  const meta = document.getElementById('rosterMeta');
  if (meta) {
    meta.innerHTML = `
      <span class="meta-chip"><b>${state.athletes.length}</b> atletas</span>
      <span class="meta-chip"><b>${active}</b> ativos</span>
      <span class="meta-chip"><b>${injured}</b> lesionados</span>
      <span class="meta-chip"><b>${positions}</b> posições</span>`;
  }

  if (!state.athletes.length) {
    grid.innerHTML = '';
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;

  const athletes = [...state.athletes].sort((a, b) => {
    const positionDiff = POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position);
    if (positionDiff !== 0) return positionDiff;
    return a.name.localeCompare(b.name, 'pt-BR');
  });

  grid.innerHTML = athletes.map((athlete) => {
    const summary = athleteSummary(athlete);
    const cfg = POSITIONS[athlete.position] || POSITIONS.QB;
    return `<article class="roster-card" data-open-athlete="${esc(athlete.id)}" data-number="${esc(athlete.number)}" tabindex="0" role="button" aria-label="Abrir detalhes de ${esc(athlete.name)}">
      <div class="roster-top">
        <div class="roster-identity">
          <span class="roster-number">${esc(athlete.number)}</span>
          <span class="roster-name">
            <strong>${esc(athlete.name)}</strong>
            <span>${esc(cfg.name)} · ${esc(cfg.unit)}</span>
          </span>
        </div>
        ${statusChip(athlete.status)}
      </div>
      <div class="roster-score-row">
        <div class="roster-score">
          <span>Índice Ghost</span>
          <strong class="${indexLevel(summary.overall)}">${summary.overall == null ? '—' : Math.round(summary.overall)}</strong>
        </div>
        <div class="roster-split">
          <span>Jogos <b>${summary.gameIndex == null ? '—' : Math.round(summary.gameIndex)}</b></span>
          <span>Treinos <b>${summary.trainingIndex == null ? '—' : Math.round(summary.trainingIndex)}</b></span>
        </div>
      </div>
      <div class="roster-foot">
        ${posBadge(athlete.position)}
        ${sparkline(summary.spark)}
      </div>
    </article>`;
  }).join('') + `<button type="button" class="roster-add" data-action="new-athlete">
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
    Adicionar atleta
  </button>`;
}

/* ------------------------------------------------------------
   Sessões
   ------------------------------------------------------------ */

function filteredSessionRows() {
  const { type, unit, search } = state.sessionFilters;
  const query = norm(search.trim());
  return state.sessions
    .filter((session) => {
      if (type !== 'todos' && session.type !== type) return false;
      if (unit !== 'todas') {
        const cfg = POSITIONS[session.position];
        if (!cfg || cfg.unit !== unit) return false;
      }
      if (query) {
        const athlete = state.athletes.find((item) => item.id === session.athleteId);
        const haystack = [
          athlete?.name,
          athlete?.number,
          session.position,
          POSITIONS[session.position]?.name,
          session.context,
          session.type,
          session.notes
        ].map(norm).join(' ');
        if (!haystack.includes(query)) return false;
      }
      return true;
    })
    .map((session) => ({ ...session, score: computeScore(session) }))
    .sort((a, b) => parseISODate(b.date) - parseISODate(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
}

function renderSessions() {
  const body = document.getElementById('sessionsBody');
  const empty = document.getElementById('sessionsEmpty');
  if (!body) return;

  const rows = filteredSessionRows();
  setText('sessionCount', `${rows.length} de ${state.sessions.length} sessões`);

  if (!rows.length) {
    body.innerHTML = '';
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;

  body.innerHTML = rows.map((session) => {
    const athlete = state.athletes.find((item) => item.id === session.athleteId);
    if (!athlete) return '';
    const context = session.context || session.type;
    const fullContext = [context, session.local].filter(Boolean).join(' · ');
    return `<tr>
      <td><time datetime="${esc(session.date)}">${fmtDateShort(session.date)}</time></td>
      <td>
        <div class="player-cell">
          <span class="jersey">${esc(athlete.number)}</span>
          <span>
            <span class="player-name">${esc(athlete.name)}</span>
            <span class="player-meta">${session.duration ? `${esc(session.duration)} min` : 'sem duração'}</span>
          </span>
        </div>
      </td>
      <td>${posBadge(session.position)}</td>
      <td>${typeChip(session.type)}</td>
      <td class="context" title="${esc(fullContext)}">${esc(fullContext)}</td>
      <td class="num">${session.duration ? `${esc(session.duration)} min` : '—'}</td>
      <td class="num">${indexCell(session.score.index)}</td>
      <td>
        <div class="row-actions">
          <button type="button" class="icon-btn" data-edit-session="${esc(session.id)}" aria-label="Editar sessão de ${esc(athlete.name)} em ${fmtDateShort(session.date)}">${ICON_EDIT}</button>
          <button type="button" class="icon-btn danger" data-delete-session="${esc(session.id)}" aria-label="Excluir sessão de ${esc(athlete.name)} em ${fmtDateShort(session.date)}">${ICON_TRASH}</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

/* ------------------------------------------------------------
   Drawer do atleta
   ------------------------------------------------------------ */

function openDrawer(athleteId) {
  const athlete = state.athletes.find((item) => item.id === athleteId);
  if (!athlete) return;
  state.drawerId = athleteId;
  lastFocusDrawer = document.activeElement;
  renderDrawerContent(athleteId);
  const layer = document.getElementById('drawerLayer');
  if (layer) layer.hidden = false;
  document.body.classList.add('no-scroll');
  const closeButton = document.querySelector('#drawer [data-action="close-drawer"]');
  if (closeButton) closeButton.focus();
}

function closeDrawer(restoreFocus = true) {
  const layer = document.getElementById('drawerLayer');
  if (layer) layer.hidden = true;
  state.drawerId = null;
  if (!state.modalOpen) document.body.classList.remove('no-scroll');
  if (restoreFocus && lastFocusDrawer && lastFocusDrawer.isConnected) lastFocusDrawer.focus();
}

function renderDrawerContent(athleteId) {
  const drawer = document.getElementById('drawer');
  const athlete = state.athletes.find((item) => item.id === athleteId);
  if (!drawer) return;
  if (!athlete) {
    closeDrawer(false);
    return;
  }

  const summary = athleteSummary(athlete);
  const cfg = POSITIONS[athlete.position] || POSITIONS.QB;
  const hasGame = summary.games > 0;
  const hasTraining = summary.trainings > 0;
  const lastDate = summary.last ? fmtDateParts(summary.last.date).full : 'sem sessões';
  const meta = [
    athlete.height ? `${athlete.height} cm` : null,
    athlete.weight ? `${athlete.weight} kg` : null,
    summary.record || null
  ].filter(Boolean);

  const sessionsHtml = summary.list.length
    ? summary.list.slice(-6).reverse().map((session) => {
      const date = fmtDateParts(session.date);
      return `<div class="drawer-session">
        <div class="date"><b>${date.day}</b>${date.month}</div>
        <div class="what">
          <strong>${esc(session.context || session.type)}</strong>
          <span>${esc(session.type)} · ${esc(session.position)}${session.duration ? ` · ${esc(session.duration)} min` : ''}</span>
        </div>
        ${indexCell(session.score.index)}
      </div>`;
    }).join('')
    : `<div class="drawer-empty">
        <p>Nenhuma sessão registrada para este atleta.</p>
        <p style="margin-top:8px"><button type="button" class="btn btn-primary btn-sm" data-action="open-session-for-athlete" data-athlete-id="${esc(athlete.id)}">Registrar primeira sessão</button></p>
      </div>`;

  drawer.innerHTML = `
    <div class="drawer-head">
      <div class="drawer-title">
        <span class="jersey">${esc(athlete.number)}</span>
        <div>
          <h2 id="drawerTitle">${esc(athlete.name)}</h2>
          <p>${esc(cfg.name)} · ${esc(cfg.unit)} · ${summary.total} sessões</p>
        </div>
      </div>
      <button type="button" class="icon-btn" data-action="close-drawer" aria-label="Fechar detalhes">${ICON_CLOSE}</button>
    </div>
    <div class="drawer-body">
      <div class="roster-meta">
        ${statusChip(athlete.status)}
        ${meta.map((item) => `<span class="meta-chip">${esc(item)}</span>`).join('')}
      </div>
      ${athlete.notes ? `<p class="form-hint">${esc(athlete.notes)}</p>` : ''}
      <div class="hero-index">
        <div>
          <span class="label">Índice Ghost</span>
          <div class="value ${summary.overall == null ? 'is-empty' : indexLevel(summary.overall)}">${summary.overall == null ? '—' : Math.round(summary.overall)}</div>
        </div>
        <div class="split">
          <span>Jogos <b>${summary.gameIndex == null ? '—' : Math.round(summary.gameIndex)}</b></span>
          <span>Treinos <b>${summary.trainingIndex == null ? '—' : Math.round(summary.trainingIndex)}</b></span>
          <span>Última: <b>${esc(lastDate)}</b></span>
        </div>
      </div>
      ${summary.total ? `
      <div class="drawer-section">
        <h3>Perfil por pilar</h3>
        <div class="radar-wrap">
          ${radarSvg(summary.pillars.Jogo, summary.pillars.Treino, hasGame, hasTraining)}
          <div class="radar-legend">
            ${hasGame ? '<span><i class="line"></i>Jogos</span>' : ''}
            ${hasTraining ? '<span><i class="line training"></i>Treinos</span>' : ''}
          </div>
        </div>
        <div class="pillar-list">
          ${PILLARS.map((pillar) => {
            const value = summary.combinedPillars[pillar.key];
            return `<div class="pillar-row">
              <span>${pillar.label}</span>
              <b>${value == null ? '—' : Math.round(value)}</b>
              <span class="bar-track"><i style="width:${clamp(value ?? 0, 0, 100)}%"></i></span>
            </div>`;
          }).join('')}
        </div>
      </div>` : ''}
      <div class="drawer-section">
        <h3>Últimas sessões</h3>
        <div class="drawer-sessions">${sessionsHtml}</div>
      </div>
    </div>
    <div class="drawer-foot">
      ${summary.total ? `<button type="button" class="btn btn-primary" data-action="open-session-for-athlete" data-athlete-id="${esc(athlete.id)}">Registrar sessão</button>` : '<span></span>'}
      <div class="head-actions">
        <button type="button" class="btn btn-quiet" data-action="edit-athlete">Editar atleta</button>
        <button type="button" class="btn btn-danger" data-action="delete-athlete">Excluir</button>
      </div>
    </div>`;
}

function radarSvg(game, training, hasGame, hasTraining) {
  const cx = 160;
  const cy = 146;
  const radius = 86;
  const labelRadius = 104;
  const axes = [
    { key: 'production', label: 'Produção', angle: -Math.PI / 2, anchor: 'middle', dx: 0, dy: -9 },
    { key: 'efficiency', label: 'Eficiência', angle: 0, anchor: 'start', dx: 10, dy: 4 },
    { key: 'rating', label: 'Técnica', angle: Math.PI / 2, anchor: 'middle', dx: 0, dy: 16 },
    { key: 'discipline', label: 'Disciplina', angle: Math.PI, anchor: 'end', dx: -10, dy: 4 }
  ];
  const point = (angle, value) => {
    const r = (radius * clamp(value ?? 0, 0, 100)) / 100;
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
  };
  const ring = (value) => axes.map((axis) => point(axis.angle, value).map((coord) => coord.toFixed(1)).join(',')).join(' ');
  const polygon = (values) => axes.map((axis) => point(axis.angle, values?.[axis.key] ?? 0).map((coord) => coord.toFixed(1)).join(',')).join(' ');

  return `<svg class="radar" viewBox="0 0 320 300" role="img" aria-label="Perfil de desempenho por pilar">
    ${[25, 50, 75, 100].map((value) => `<polygon class="grid-line" points="${ring(value)}" />`).join('')}
    ${axes.map((axis) => `<line class="axis-line" x1="${cx}" y1="${cy}" x2="${point(axis.angle, 100)[0].toFixed(1)}" y2="${point(axis.angle, 100)[1].toFixed(1)}" />`).join('')}
    ${hasGame ? `<polygon class="poly-game" points="${polygon(game)}" />` : ''}
    ${hasTraining ? `<polygon class="poly-training" points="${polygon(training)}" />` : ''}
    ${axes.map((axis) => {
      const x = cx + Math.cos(axis.angle) * labelRadius + axis.dx;
      const y = cy + Math.sin(axis.angle) * labelRadius + axis.dy;
      return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${axis.anchor}">${axis.label}</text>`;
    }).join('')}
  </svg>`;
}

/* ------------------------------------------------------------
   Modais
   ------------------------------------------------------------ */

function showModal(html, narrow = false) {
  const modal = document.getElementById('modal');
  const layer = document.getElementById('modalLayer');
  if (!modal || !layer) return;
  lastFocusModal = document.activeElement;
  modal.innerHTML = html;
  modal.classList.toggle('is-narrow', narrow);
  layer.hidden = false;
  state.modalOpen = true;
  document.body.classList.add('no-scroll');
  const target = modal.querySelector('[data-autofocus]') || modal.querySelector('button, input, select, textarea');
  requestAnimationFrame(() => {
    if (target) target.focus();
  });
}

function closeModal() {
  const layer = document.getElementById('modalLayer');
  const modal = document.getElementById('modal');
  if (layer) layer.hidden = true;
  if (modal) modal.innerHTML = '';
  state.modalOpen = false;
  state.editingSessionId = null;
  state.editingAthleteId = null;
  if (!state.drawerId) document.body.classList.remove('no-scroll');
  if (lastFocusModal && lastFocusModal.isConnected) lastFocusModal.focus();
}

function athleteOptions(selectedId) {
  return UNIT_ORDER.map((unit) => {
    const athletes = state.athletes
      .filter((athlete) => POSITIONS[athlete.position]?.unit === unit)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    if (!athletes.length) return '';
    return `<optgroup label="${unit}">${athletes.map((athlete) => (
      `<option value="${esc(athlete.id)}"${athlete.id === selectedId ? ' selected' : ''}>#${esc(athlete.number)} ${esc(athlete.name)} — ${esc(athlete.position)}</option>`
    )).join('')}</optgroup>`;
  }).join('');
}

function openSessionModal(sessionId = null, athleteId = null) {
  if (!state.athletes.length) {
    toast('Cadastre um atleta antes de registrar a primeira sessão.', 'error');
    openAthleteModal();
    return;
  }

  const editing = sessionId ? state.sessions.find((session) => session.id === sessionId) : null;
  if (sessionId && !editing) return;

  const selectedAthlete = editing
    ? state.athletes.find((athlete) => athlete.id === editing.athleteId)
    : state.athletes.find((athlete) => athlete.id === athleteId)
      || state.athletes.find((athlete) => athlete.status === 'Ativo')
      || state.athletes[0];

  if (!selectedAthlete) return;

  const type = editing?.type || 'Jogo';
  const samePosition = editing && editing.position === selectedAthlete.position;
  const stats = samePosition ? editing.stats : {};
  const ratings = editing?.ratings || { technique: 7, intensity: 7, iq: 7 };
  const date = editing?.date || todayISO();
  const context = editing?.context || '';
  const local = editing?.local || 'Casa';
  const teamScore = editing?.teamScore ?? '';
  const oppScore = editing?.oppScore ?? '';
  const duration = editing?.duration || (type === 'Jogo' ? 150 : 90);
  const notes = editing?.notes || '';

  state.editingSessionId = editing?.id || null;

  const html = `
    <div class="modal-head">
      <div>
        <h2 id="modalTitle">${editing ? 'Editar sessão' : 'Registrar sessão'}</h2>
        <p>${editing ? 'Ajuste os números e a avaliação. O índice é recalculado na hora.' : 'Jogo ou treino, com as métricas da posição do atleta.'}</p>
      </div>
      <button type="button" class="icon-btn" data-action="close-modal" aria-label="Fechar formulário">${ICON_CLOSE}</button>
    </div>
    <form id="sessionForm" class="${type === 'Treino' ? 'is-training' : ''}" novalidate>
      <input type="hidden" id="sessionTypeInput" value="${esc(type)}" />
      <div class="modal-body session-layout">
        <div>
          <section class="form-section">
            <h3>Contexto</h3>
            <div class="form-grid">
              <label class="field is-wide">
                <span>Atleta</span>
                <select id="sessionAthlete" data-autofocus>${athleteOptions(selectedAthlete.id)}</select>
              </label>
              <div class="field is-wide">
                <span>Tipo de sessão</span>
                <div class="segmented-block">
                  <button type="button" data-type-choice="Jogo" class="${type === 'Jogo' ? 'is-active' : ''}">Jogo</button>
                  <button type="button" data-type-choice="Treino" class="${type === 'Treino' ? 'is-active' : ''}">Treino</button>
                </div>
              </div>
              <label class="field">
                <span>Data</span>
                <input type="date" id="sessionDate" value="${esc(date)}" required />
              </label>
              <label class="field">
                <span>Duração (min)</span>
                <input type="number" id="sessionDuration" min="0" step="5" inputmode="numeric" value="${esc(duration)}" />
              </label>
              <label class="field is-wide">
                <span id="contextLabel">${type === 'Jogo' ? 'Adversário' : 'Foco do treino'}</span>
                <input type="text" id="sessionContext" maxlength="80" value="${esc(context)}" placeholder="${type === 'Jogo' ? 'Ex.: Litoral Sharks' : 'Ex.: Situacional de 3º down'}" />
              </label>
              <label class="field game-only">
                <span>Local</span>
                <select id="sessionLocal">
                  ${['Casa', 'Fora', 'Neutro'].map((option) => `<option value="${option}"${option === local ? ' selected' : ''}>${option}</option>`).join('')}
                </select>
              </label>
              <div class="field game-only">
                <span>Placar</span>
                <div class="score-row">
                  <input type="number" id="teamScore" min="0" step="1" inputmode="numeric" value="${esc(teamScore)}" aria-label="Pontos do Ghostship" placeholder="Nós" />
                  <span class="vs">×</span>
                  <input type="number" id="oppScore" min="0" step="1" inputmode="numeric" value="${esc(oppScore)}" aria-label="Pontos do adversário" placeholder="Eles" />
                </div>
              </div>
            </div>
          </section>

          <section class="form-section">
            <div class="form-section-head">
              <h3>Estatísticas</h3>
              <span id="positionHint"></span>
            </div>
            <div class="stats-grid" id="statFields"></div>
            <p class="form-hint">Campos específicos da posição. Deixe zero quando não houver registro.</p>
          </section>

          <section class="form-section">
            <h3>Avaliação da comissão</h3>
            <div class="rating-grid">
              ${RATINGS.map((rating) => `
                <div class="rating-row">
                  <label for="rating-${rating.key}">${rating.label}</label>
                  <input type="range" id="rating-${rating.key}" min="0" max="10" step="0.5" value="${esc(ratings[rating.key] ?? 7)}" data-rating="${rating.key}" />
                  <output data-output-for="${rating.key}">${fmt1(ratings[rating.key] ?? 7)}</output>
                </div>`).join('')}
            </div>
            <p class="form-hint">Notas de 0 a 10. A média dos três critérios forma o pilar de avaliação técnica.</p>
          </section>

          <section class="form-section">
            <label class="field">
              <span>Observações</span>
              <textarea id="sessionNotes" maxlength="500" placeholder="Ex.: boa leitura de pressão; precisa ajustar o tempo de bola.">${esc(notes)}</textarea>
            </label>
          </section>
        </div>
        <aside class="preview" id="sessionPreview" aria-live="polite"></aside>
      </div>
      <div class="modal-foot">
        <span class="foot-note">O índice é recalculado ao vivo.</span>
        <button type="button" class="btn btn-quiet" data-action="close-modal">Cancelar</button>
        <button type="submit" class="btn btn-primary">${editing ? 'Salvar alterações' : 'Salvar sessão'}</button>
      </div>
    </form>`;

  showModal(html);
  renderStatFields(selectedAthlete.position, stats);
  setFormType(type);
  updatePreview();
}

function setFormType(type) {
  const form = document.getElementById('sessionForm');
  if (!form) return;
  form.classList.toggle('is-training', type === 'Treino');
  const hidden = document.getElementById('sessionTypeInput');
  if (hidden) hidden.value = type;
  $$('[data-type-choice]', form).forEach((button) => {
    button.classList.toggle('is-active', button.dataset.typeChoice === type);
  });
  const contextLabel = document.getElementById('contextLabel');
  if (contextLabel) contextLabel.textContent = type === 'Jogo' ? 'Adversário' : 'Foco do treino';
  const contextInput = document.getElementById('sessionContext');
  if (contextInput) contextInput.placeholder = type === 'Jogo' ? 'Ex.: Litoral Sharks' : 'Ex.: Situacional de 3º down';
  updatePreview();
}

function renderStatFields(position, values = {}) {
  const container = document.getElementById('statFields');
  const cfg = POSITIONS[position] || POSITIONS.QB;
  if (!container) return;
  container.innerHTML = cfg.stats.map((stat) => `
    <label class="stat-field">
      <span>${esc(stat.label)}</span>
      <input type="number" min="0" step="1" inputmode="numeric" data-stat="${esc(stat.key)}" value="${Math.max(0, Math.round(n(values?.[stat.key])))}" />
    </label>`).join('');

  const hint = document.getElementById('positionHint');
  if (hint) {
    hint.innerHTML = `${posBadge(position)} <span>${esc(cfg.name)} · ${esc(cfg.unit)}</span>`;
  }
}

function readSessionForm() {
  const athleteId = document.getElementById('sessionAthlete')?.value || '';
  const athlete = state.athletes.find((item) => item.id === athleteId);
  const type = document.getElementById('sessionTypeInput')?.value || 'Jogo';
  const stats = {};
  $$('#statFields [data-stat]').forEach((input) => {
    stats[input.dataset.stat] = n(input.value);
  });
  const ratings = {};
  RATINGS.forEach((rating) => {
    ratings[rating.key] = clamp(n(document.querySelector(`[data-rating="${rating.key}"]`)?.value), 0, 10);
  });
  const teamRaw = document.getElementById('teamScore')?.value;
  const oppRaw = document.getElementById('oppScore')?.value;

  return {
    athleteId,
    athlete,
    position: athlete?.position || 'QB',
    type,
    date: document.getElementById('sessionDate')?.value || '',
    context: document.getElementById('sessionContext')?.value || '',
    local: document.getElementById('sessionLocal')?.value || 'Casa',
    duration: Math.max(0, Math.round(n(document.getElementById('sessionDuration')?.value))),
    teamScore: type === 'Jogo' && teamRaw !== '' ? Math.max(0, Math.round(n(teamRaw))) : null,
    oppScore: type === 'Jogo' && oppRaw !== '' ? Math.max(0, Math.round(n(oppRaw))) : null,
    stats: sanitizeStats(stats, athlete?.position || 'QB'),
    ratings,
    notes: document.getElementById('sessionNotes')?.value || ''
  };
}

function previewBar(label, value) {
  return `<div class="preview-bar">
    <span>${label}</span>
    <b>${value == null ? '—' : Math.round(value)}</b>
    <span class="bar-track"><i style="width:${clamp(value ?? 0, 0, 100)}%"></i></span>
  </div>`;
}

function previewHtml(score, draft) {
  const note = score.hasEfficiency
    ? 'Pesos: produção 40% · eficiência 20% · avaliação 20% · disciplina 20%.'
    : 'Sem volume para eficiência nesta sessão; o peso dela é redistribuído entre os outros pilares.';
  return `
    <span class="preview-label">${draft.type === 'Jogo' ? 'Índice do jogo' : 'Índice do treino'}</span>
    <div class="preview-index"><strong>${score.index}</strong><span>/100</span></div>
    <div class="preview-bars">
      ${previewBar('Produção', score.production)}
      ${previewBar('Eficiência', score.efficiency)}
      ${previewBar('Avaliação', score.rating)}
      ${previewBar('Disciplina', score.discipline)}
    </div>
    <p class="preview-read">${esc(quickRead(draft.position, draft.stats))}</p>
    <p class="preview-note">${note}</p>`;
}

function updatePreview() {
  const container = document.getElementById('sessionPreview');
  if (!container) return;
  const draft = readSessionForm();
  const score = computeScore(draft);
  container.innerHTML = previewHtml(score, draft);
}

function saveSession(event) {
  event.preventDefault();
  const draft = readSessionForm();
  if (!draft.athlete || !draft.athleteId) {
    toast('Selecione um atleta.', 'error');
    return;
  }
  if (!draft.date) {
    toast('Informe a data da sessão.', 'error');
    document.getElementById('sessionDate')?.focus();
    return;
  }

  const editing = state.editingSessionId
    ? state.sessions.find((session) => session.id === state.editingSessionId)
    : null;
  const type = draft.type === 'Treino' ? 'Treino' : 'Jogo';
  const session = {
    id: editing?.id || uid('ses'),
    athleteId: draft.athleteId,
    position: draft.athlete.position,
    type,
    date: draft.date,
    context: draft.context.trim() || (type === 'Jogo' ? 'Jogo' : 'Treino'),
    local: type === 'Jogo' ? draft.local : null,
    duration: draft.duration || (type === 'Jogo' ? 150 : 90),
    teamScore: type === 'Jogo' ? draft.teamScore : null,
    oppScore: type === 'Jogo' ? draft.oppScore : null,
    stats: draft.stats,
    ratings: draft.ratings,
    notes: draft.notes.trim(),
    createdAt: editing?.createdAt || Date.now()
  };

  if (editing) {
    const index = state.sessions.findIndex((item) => item.id === editing.id);
    if (index >= 0) state.sessions[index] = session;
  } else {
    state.sessions.push(session);
  }

  save();
  closeModal();
  renderAll();
  const score = computeScore(session);
  toast(`${editing ? 'Sessão atualizada' : 'Sessão registrada'} para ${draft.athlete.name} · índice ${score.index}.`);
}

function deleteSession(sessionId) {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) return;
  const athlete = state.athletes.find((item) => item.id === session.athleteId);
  const label = athlete ? athlete.name : 'atleta';
  if (!window.confirm(`Excluir a sessão de ${label} em ${fmtDateParts(session.date).full}?`)) return;
  state.sessions = state.sessions.filter((item) => item.id !== sessionId);
  save();
  renderAll();
  toast('Sessão excluída.');
}

/* ------------------------------------------------------------
   Formulário de atleta
   ------------------------------------------------------------ */

function openAthleteModal(athleteId = null) {
  const editing = athleteId ? state.athletes.find((athlete) => athlete.id === athleteId) : null;
  state.editingAthleteId = editing?.id || null;
  const position = editing?.position || 'WR';
  const cfg = POSITIONS[position] || POSITIONS.WR;

  const html = `
    <div class="modal-head">
      <div>
        <h2 id="modalTitle">${editing ? 'Editar atleta' : 'Novo atleta'}</h2>
        <p>${editing ? 'Dados cadastrais e posição atual.' : 'O histórico começa vazio e cresce a cada sessão.'}</p>
      </div>
      <button type="button" class="icon-btn" data-action="close-modal" aria-label="Fechar formulário">${ICON_CLOSE}</button>
    </div>
    <form id="athleteForm" novalidate>
      <div class="modal-body">
        <div class="form-grid">
          <label class="field is-wide">
            <span>Nome do atleta</span>
            <input type="text" id="athleteName" maxlength="60" value="${esc(editing?.name || '')}" placeholder="Ex.: Rafael Muniz" data-autofocus required />
          </label>
          <label class="field">
            <span>Número da camisa</span>
            <input type="number" id="athleteNumber" min="0" max="99" step="1" inputmode="numeric" value="${esc(editing?.number ?? '')}" placeholder="0" />
          </label>
          <label class="field">
            <span>Posição</span>
            <select id="athletePosition">
              ${POSITION_ORDER.map((key) => `<option value="${key}"${key === position ? ' selected' : ''}>${key} — ${esc(POSITIONS[key].name)}</option>`).join('')}
            </select>
          </label>
          <div class="field is-wide">
            <span>Unidade</span>
            <p class="form-hint" id="athleteUnitHint">${esc(cfg.name)} · ${esc(cfg.unit)}</p>
          </div>
          <label class="field">
            <span>Status</span>
            <select id="athleteStatus">
              ${['Ativo', 'Lesionado', 'Inativo'].map((status) => `<option value="${status}"${status === (editing?.status || 'Ativo') ? ' selected' : ''}>${status}</option>`).join('')}
            </select>
          </label>
          <label class="field">
            <span>Altura (cm)</span>
            <input type="number" id="athleteHeight" min="0" max="250" step="1" inputmode="numeric" value="${esc(editing?.height ?? '')}" placeholder="Opcional" />
          </label>
          <label class="field">
            <span>Peso (kg)</span>
            <input type="number" id="athleteWeight" min="0" max="250" step="1" inputmode="numeric" value="${esc(editing?.weight ?? '')}" placeholder="Opcional" />
          </label>
          <label class="field is-wide">
            <span>Observações</span>
            <textarea id="athleteNotes" maxlength="400" placeholder="Ex.: capitão do ataque; trabalha leitura de cobertura.">${esc(editing?.notes || '')}</textarea>
          </label>
        </div>
        ${editing && state.sessions.some((session) => session.athleteId === editing.id)
          ? '<p class="form-hint" style="margin-top:12px">Alterar a posição não reescreve sessões antigas: cada sessão mantém a posição registrada na época.</p>'
          : ''}
      </div>
      <div class="modal-foot">
        <span class="foot-note">${editing ? 'As sessões anteriores são preservadas.' : 'Você pode editar esses dados depois.'}</span>
        <button type="button" class="btn btn-quiet" data-action="close-modal">Cancelar</button>
        <button type="submit" class="btn btn-primary">${editing ? 'Salvar alterações' : 'Cadastrar atleta'}</button>
      </div>
    </form>`;

  showModal(html, true);
}

function saveAthlete(event) {
  event.preventDefault();
  const name = (document.getElementById('athleteName')?.value || '').trim();
  if (!name) {
    toast('Informe o nome do atleta.', 'error');
    document.getElementById('athleteName')?.focus();
    return;
  }

  const position = document.getElementById('athletePosition')?.value || 'WR';
  const editing = state.editingAthleteId
    ? state.athletes.find((athlete) => athlete.id === state.editingAthleteId)
    : null;
  const previousPosition = editing?.position;
  const numberRaw = document.getElementById('athleteNumber')?.value;
  const heightRaw = document.getElementById('athleteHeight')?.value;
  const weightRaw = document.getElementById('athleteWeight')?.value;

  const athlete = {
    id: editing?.id || uid('ath'),
    name,
    number: clamp(Math.round(n(numberRaw)), 0, 99),
    position,
    status: document.getElementById('athleteStatus')?.value || 'Ativo',
    height: heightRaw === '' ? null : Math.max(0, Math.round(n(heightRaw))),
    weight: weightRaw === '' ? null : Math.max(0, Math.round(n(weightRaw))),
    notes: (document.getElementById('athleteNotes')?.value || '').trim(),
    createdAt: editing?.createdAt || Date.now()
  };

  if (editing) {
    const index = state.athletes.findIndex((item) => item.id === editing.id);
    if (index >= 0) state.athletes[index] = athlete;
  } else {
    state.athletes.push(athlete);
  }

  save();
  closeModal();
  renderAll();
  const positionChanged = editing && previousPosition !== position && state.sessions.some((session) => session.athleteId === athlete.id);
  toast(positionChanged
    ? `${name} atualizado. As sessões anteriores mantêm a posição original.`
    : `${editing ? 'Atleta atualizado' : 'Atleta cadastrado'}: ${name}.`);
}

function deleteAthlete(athleteId) {
  const athlete = state.athletes.find((item) => item.id === athleteId);
  if (!athlete) return;
  const count = state.sessions.filter((session) => session.athleteId === athleteId).length;
  const message = count
    ? `Excluir ${athlete.name}? As ${count} sessões do atleta também serão removidas.`
    : `Excluir ${athlete.name}?`;
  if (!window.confirm(message)) return;
  state.athletes = state.athletes.filter((item) => item.id !== athleteId);
  state.sessions = state.sessions.filter((session) => session.athleteId !== athleteId);
  save();
  closeDrawer(false);
  renderAll();
  toast('Atleta excluído.');
}

/* ------------------------------------------------------------
   Menu, exportação e importação
   ------------------------------------------------------------ */

function closeMenu() {
  const menu = document.getElementById('exportMenu');
  const button = document.getElementById('exportBtn');
  if (menu) menu.hidden = true;
  if (button) button.setAttribute('aria-expanded', 'false');
}

function toggleMenu() {
  const menu = document.getElementById('exportMenu');
  const button = document.getElementById('exportBtn');
  if (!menu || !button) return;
  const willOpen = menu.hidden;
  menu.hidden = !willOpen;
  button.setAttribute('aria-expanded', String(willOpen));
}

function resetFilters() {
  state.filters = { type: 'todos', unit: 'todas', period: 'all' };
  $$('[data-filter-type]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.filterType === 'todos');
  });
  const unit = document.getElementById('filterUnit');
  const period = document.getElementById('filterPeriod');
  if (unit) unit.value = 'todas';
  if (period) period.value = 'all';
  renderDashboard();
}

function handleAction(action, element) {
  switch (action) {
    case 'close-drawer':
      closeDrawer();
      break;
    case 'close-modal':
      closeModal();
      break;
    case 'new-athlete':
      openAthleteModal();
      break;
    case 'new-session':
      if (state.drawerId) closeDrawer(false);
      openSessionModal();
      break;
    case 'edit-athlete':
      if (state.drawerId) openAthleteModal(state.drawerId);
      break;
    case 'delete-athlete':
      if (state.drawerId) deleteAthlete(state.drawerId);
      break;
    case 'open-session-for-athlete':
      if (element?.dataset.athleteId) {
        closeDrawer(false);
        openSessionModal(null, element.dataset.athleteId);
      }
      break;
    case 'clear-filters':
      resetFilters();
      break;
    case 'export-csv':
      exportCsv();
      break;
    case 'export-json':
      exportJson();
      break;
    case 'import-json':
      document.getElementById('importInput')?.click();
      break;
    case 'reset-demo':
      resetDemo();
      break;
    default:
      break;
  }
}

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function exportCsv() {
  const header = [
    'Data', 'Atleta', 'Número', 'Posição', 'Unidade', 'Tipo', 'Contexto', 'Local',
    'Duração (min)', 'Índice', 'Produção', 'Eficiência', 'Avaliação', 'Disciplina',
    'Técnica (0-10)', 'Intensidade (0-10)', 'Leitura (0-10)', 'Estatísticas', 'Observações'
  ];
  const rows = state.sessions
    .map((session) => ({ ...session, score: computeScore(session) }))
    .sort((a, b) => parseISODate(b.date) - parseISODate(a.date) || (b.createdAt || 0) - (a.createdAt || 0));

  const lines = [header.map(csvCell).join(';')];
  rows.forEach((session) => {
    const athlete = state.athletes.find((item) => item.id === session.athleteId);
    const cfg = POSITIONS[session.position] || POSITIONS.QB;
    const statsText = cfg.stats
      .map((stat) => `${stat.label}: ${n(session.stats?.[stat.key])}`)
      .join(' | ');
    const ratings = session.ratings || {};
    lines.push([
      fmtDateShort(session.date),
      athlete?.name || 'Atleta removido',
      athlete?.number ?? '',
      session.position,
      cfg.unit,
      session.type,
      session.context || '',
      session.local || '',
      session.duration || '',
      session.score.index,
      session.score.production,
      session.score.efficiency ?? '',
      session.score.rating,
      session.score.discipline,
      fmt1(ratings.technique),
      fmt1(ratings.intensity),
      fmt1(ratings.iq),
      statsText,
      session.notes || ''
    ].map(csvCell).join(';'));
  });

  download(`ghostship-sessoes-${todayISO()}.csv`, `\uFEFF${lines.join('\r\n')}`, 'text/csv;charset=utf-8');
  toast('Planilha CSV exportada.');
}

function exportJson() {
  download(
    `ghostship-backup-${todayISO()}.json`,
    JSON.stringify({
      app: 'caragua-ghostship-kpi',
      version: 1,
      exportedAt: new Date().toISOString(),
      athletes: state.athletes,
      sessions: state.sessions
    }, null, 2),
    'application/json'
  );
  toast('Backup completo gerado.');
}

function importJsonFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result));
      if (!data || !Array.isArray(data.athletes) || !Array.isArray(data.sessions)) {
        throw new Error('formato');
      }
      const athleteIds = new Set(data.athletes.map((athlete) => athlete.id));
      const sessions = data.sessions.filter((session) => athleteIds.has(session.athleteId));
      if (!window.confirm(`Importar ${data.athletes.length} atletas e ${sessions.length} sessões? Os dados atuais serão substituídos.`)) return;
      state.athletes = data.athletes;
      state.sessions = sessions;
      save();
      closeModal();
      closeDrawer(false);
      renderAll();
      setTab('painel');
      toast('Backup importado.');
    } catch (error) {
      toast('Arquivo inválido. Use um backup JSON gerado por este painel.', 'error');
    }
  };
  reader.readAsText(file);
}

function resetDemo() {
  if (!window.confirm('Restaurar os dados de exemplo? Todo o histórico atual será substituído.')) return;
  seedData();
  save();
  closeModal();
  closeDrawer(false);
  renderAll();
  setTab('painel');
  toast('Dados de exemplo restaurados.');
}

/* ------------------------------------------------------------
   Renderização geral e navegação
   ------------------------------------------------------------ */

function renderAll() {
  renderDashboard();
  renderRoster();
  renderSessions();
  if (state.drawerId) {
    if (state.athletes.some((athlete) => athlete.id === state.drawerId)) renderDrawerContent(state.drawerId);
    else closeDrawer(false);
  }
}

function setTab(tab) {
  if (!['painel', 'atletas', 'sessoes'].includes(tab)) return;
  state.tab = tab;
  $$('.tab').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.tab === tab);
  });
  $$('.view').forEach((view) => {
    view.hidden = view.id !== `view-${tab}`;
  });
  closeMenu();
  if (tab === 'painel') renderDashboard();
  if (tab === 'atletas') renderRoster();
  if (tab === 'sessoes') renderSessions();
}

/* ------------------------------------------------------------
   Toast e foco
   ------------------------------------------------------------ */

function toast(message, tone = 'ok') {
  const element = document.getElementById('toast');
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('is-error', tone === 'error');
  element.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    element.hidden = true;
  }, 3800);
}

function trapFocus(event, container) {
  if (event.key !== 'Tab') return;
  const focusables = $$('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', container)
    .filter((element) => element.offsetParent !== null);
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/* ------------------------------------------------------------
   Eventos
   ------------------------------------------------------------ */

function bindEvents() {
  document.addEventListener('click', (event) => {
    const target = event.target;

    const tabButton = target.closest('[data-tab]');
    if (tabButton) {
      event.preventDefault();
      setTab(tabButton.dataset.tab);
      return;
    }

    if (target.closest('#exportBtn')) {
      toggleMenu();
      return;
    }

    const menuItem = target.closest('#exportMenu [data-action]');
    if (menuItem) {
      closeMenu();
      handleAction(menuItem.dataset.action, menuItem);
      return;
    }

    const filterType = target.closest('[data-filter-type]');
    if (filterType) {
      state.filters.type = filterType.dataset.filterType;
      $$('[data-filter-type]').forEach((button) => {
        button.classList.toggle('is-active', button === filterType);
      });
      renderDashboard();
      return;
    }

    const sortButton = target.closest('[data-sort]');
    if (sortButton) {
      const key = sortButton.dataset.sort;
      if (state.sort.key === key) {
        state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sort = { key, dir: ['name', 'position'].includes(key) ? 'asc' : 'desc' };
      }
      renderRanking();
      return;
    }

    const typeChoice = target.closest('[data-type-choice]');
    if (typeChoice) {
      setFormType(typeChoice.dataset.typeChoice);
      return;
    }

    const openAthlete = target.closest('[data-open-athlete]');
    if (openAthlete) {
      openDrawer(openAthlete.dataset.openAthlete);
      return;
    }

    const editSessionButton = target.closest('[data-edit-session]');
    if (editSessionButton) {
      openSessionModal(editSessionButton.dataset.editSession);
      return;
    }

    const deleteSessionButton = target.closest('[data-delete-session]');
    if (deleteSessionButton) {
      deleteSession(deleteSessionButton.dataset.deleteSession);
      return;
    }

    const actionElement = target.closest('[data-action]');
    if (actionElement) {
      handleAction(actionElement.dataset.action, actionElement);
      return;
    }
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.menu-wrap')) closeMenu();
  });

  document.addEventListener('input', (event) => {
    const target = event.target;
    if (target.id === 'rankingSearch') {
      state.rankingSearch = target.value;
      renderRanking();
      return;
    }
    if (target.id === 'sessionSearch') {
      state.sessionFilters.search = target.value;
      renderSessions();
      return;
    }
    if (target.matches('[data-rating]')) {
      const output = document.querySelector(`[data-output-for="${target.dataset.rating}"]`);
      if (output) output.textContent = fmt1(target.value);
    }
    if (target.closest('#sessionForm')) updatePreview();
  });

  document.addEventListener('change', (event) => {
    const target = event.target;
    if (target.id === 'filterUnit') {
      state.filters.unit = target.value;
      renderDashboard();
      return;
    }
    if (target.id === 'filterPeriod') {
      state.filters.period = target.value;
      renderDashboard();
      return;
    }
    if (target.id === 'sessionType') {
      state.sessionFilters.type = target.value;
      renderSessions();
      return;
    }
    if (target.id === 'sessionUnit') {
      state.sessionFilters.unit = target.value;
      renderSessions();
      return;
    }
    if (target.id === 'sessionAthlete') {
      const athlete = state.athletes.find((item) => item.id === target.value);
      if (athlete) {
        renderStatFields(athlete.position, {});
        updatePreview();
      }
      return;
    }
    if (target.id === 'athletePosition') {
      const cfg = POSITIONS[target.value];
      const hint = document.getElementById('athleteUnitHint');
      if (cfg && hint) hint.textContent = `${cfg.name} · ${cfg.unit}`;
      return;
    }
    if (target.id === 'importInput') {
      importJsonFile(target.files?.[0]);
      target.value = '';
    }
  });

  document.addEventListener('submit', (event) => {
    if (event.target.id === 'sessionForm') saveSession(event);
    if (event.target.id === 'athleteForm') saveAthlete(event);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!document.getElementById('exportMenu')?.hidden) {
        closeMenu();
        return;
      }
      if (state.modalOpen) {
        closeModal();
        return;
      }
      if (state.drawerId) {
        closeDrawer();
        return;
      }
    }

    if (event.key === 'Tab') {
      if (state.modalOpen) {
        const modal = document.getElementById('modal');
        if (modal) trapFocus(event, modal);
      } else if (state.drawerId) {
        const drawer = document.getElementById('drawer');
        if (drawer) trapFocus(event, drawer);
      }
    }

    if (event.key === 'Enter' || event.key === ' ') {
      const target = event.target;
      if (target.matches('tr[data-open-athlete], article[data-open-athlete]')) {
        event.preventDefault();
        openDrawer(target.dataset.openAthlete);
      }
    }
  });
}

/* ------------------------------------------------------------
   Inicialização
   ------------------------------------------------------------ */

function init() {
  bindEvents();
  load();
  renderBenchmarks();
  renderAll();
  setTab('painel');
}

document.addEventListener('DOMContentLoaded', init);




