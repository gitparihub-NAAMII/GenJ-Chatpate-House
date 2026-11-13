// Data store: keeps everything in localStorage (works offline) and hands changes to Sync.
const LS_DATA = 'genj.data.v1';
const LS_LOCAL = 'genj.local.v1';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, '0');
function dayKey(d = new Date()) { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function hhmm(d) { d = new Date(d); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }

const DEFAULT_MENU = [
  { id: 'milktea', en: 'Milk Tea', ne: 'दूध चिया', price: 20, cat: 'tea', emoji: '☕', sugar: true, addons: '' },
  { id: 'lemontea', en: 'Lemon Tea', ne: 'कागती चिया', price: 10, cat: 'tea', emoji: '🍋', sugar: true, addons: 'Marich/मरिच, Black salt/कालो नुन, Lemon/कागती' },
  { id: 'doughnut', en: 'Doughnut', ne: 'डोनट', price: 10, cat: 'snack', emoji: '🍩', sugar: false, addons: '', unit: 'piece' },
  { id: 'momo', en: 'Momo', ne: 'म:म:', price: 120, cat: 'food', emoji: '🥟', sugar: false, addons: '' },
  { id: 'chowmein', en: 'Chowmein', ne: 'चाउमिन', price: 100, cat: 'food', emoji: '🍜', sugar: false, addons: '' },
  { id: 'chatpate', en: 'Chatpate', ne: 'चटपटे', price: 50, cat: 'snack', emoji: '🌶️', sugar: false, addons: '' },
  { id: 'panipuri', en: 'Pani Puri', ne: 'पानीपुरी', price: 50, cat: 'snack', emoji: '🥙', sugar: false, addons: '' },
];

const DEFAULT_DATA = () => ({
  settings: { menu: DEFAULT_MENU, tableCount: 6, defaultChairs: 4, updatedAt: 0 },
  tables: {},
  bills: [],
  cancels: [],
});

const DEFAULT_LOCAL = {
  lang: 'en', theme: (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light',
  waiter: '', autoExcel: true, closingTime: '21:00', exported: {}, fbConfig: '', shopCode: 'genj',
};

function readJSON(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; }
}
function writeJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { console.warn(e); } }

window.LOCAL = Object.assign({}, DEFAULT_LOCAL, readJSON(LS_LOCAL, {}));
function saveLocal() { writeJSON(LS_LOCAL, LOCAL); }

// "English/नेपाली" -> label in current language
function biLabel(s) {
  const [en, ne] = String(s).split('/').map(x => x.trim());
  return LOCAL.lang === 'ne' && ne ? ne : en;
}
function itemName(it) { return LOCAL.lang === 'ne' && it.ne ? it.ne : it.en; }
function addonList(it) { return String(it.addons || '').split(',').map(s => s.trim()).filter(Boolean); }

const Store = {
  state: Object.assign(DEFAULT_DATA(), readJSON(LS_DATA, {})),
  listeners: [],

  onChange(fn) { this.listeners.push(fn); },
  emit() { this.listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); },
  persist() { writeJSON(LS_DATA, this.state); },

  get settings() { return this.state.settings; },
  get menu() { return this.state.settings.menu; },

  ensureTables() {
    const s = this.state.settings;
    for (let i = 1; i <= s.tableCount; i++) {
      const id = 't' + i;
      if (!this.state.tables[id]) this.state.tables[id] = this.blankTable(id, i);
    }
    // drop extra tables only if they are empty
    Object.keys(this.state.tables).forEach(id => {
      const n = +id.slice(1);
      if (n > s.tableCount && !this.state.tables[id].orders.length) delete this.state.tables[id];
    });
  },
  blankTable(id, n) {
    return { id, name: String(n), chairs: this.state.settings.defaultChairs, focal: '', orders: [], openedAt: 0, updatedAt: 0 };
  },
  tableList() {
    return Object.values(this.state.tables).sort((a, b) => +a.id.slice(1) - +b.id.slice(1));
  },

  updateTable(id, fn) {
    const tb = this.state.tables[id];
    if (!tb) return;
    fn(tb);
    if (tb.orders.length && !tb.openedAt) tb.openedAt = Date.now();
    tb.updatedAt = Date.now();
    this.persist(); this.emit();
    Sync.pushTable(tb);
  },
  setSettings(fn) {
    fn(this.state.settings);
    this.state.settings.updatedAt = Date.now();
    this.ensureTables();
    this.persist(); this.emit();
    Sync.pushSettings(this.state.settings);
    this.tableList().forEach(tb => Sync.pushTable(tb));
  },
  addBill(bill) {
    this.state.bills.push(bill);
    this.persist(); this.emit();
    Sync.pushRecord('bills', bill);
  },
  addCancel(rec) {
    this.state.cancels.push(rec);
    this.persist();
    Sync.pushRecord('cancels', rec);
  },

  // ---- remote updates (from Sync) ----
  applyRemoteTable(tb) {
    const cur = this.state.tables[tb.id];
    if (cur && (cur.updatedAt || 0) > (tb.updatedAt || 0)) return;
    this.state.tables[tb.id] = tb;
    this.persist(); this.emit();
  },
  applyRemoteSettings(s) {
    if ((this.state.settings.updatedAt || 0) > (s.updatedAt || 0)) return;
    this.state.settings = s;
    this.ensureTables();
    this.persist(); this.emit();
  },
  applyRemoteRecord(kind, rec) {
    const arr = this.state[kind];
    if (arr.some(r => r.id === rec.id)) return;
    arr.push(rec);
    this.persist(); this.emit();
  },

  billsOn(day) { return this.state.bills.filter(b => b.date === day).sort((a, b) => a.at - b.at); },
  cancelsOn(day) { return this.state.cancels.filter(c => c.date === day).sort((a, b) => a.at - b.at); },
};

Store.ensureTables();

function lineTotal(o) { return o.price * o.qty; }
function tableTotal(tb) { return tb.orders.reduce((s, o) => s + lineTotal(o), 0); }
function tableCount(tb) { return tb.orders.reduce((s, o) => s + o.qty, 0); }
function tableStatus(tb) {
  if (!tb.orders.length) return 'free';
  return tb.orders.every(o => o.status === 'served') ? 'ready' : 'busy';
}
function optText(o) {
  const parts = [];
  if (o.sugar) parts.push(t(o.sugar));
  (o.addons || []).forEach(a => parts.push(biLabel(a)));
  if (o.note) parts.push('“' + o.note + '”');
  return parts.join(' · ');
}
