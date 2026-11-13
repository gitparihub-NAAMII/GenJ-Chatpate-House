// Customer page: menu from the QR link, choose table, enter name, send order to the shop.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LS_CUST = 'genj.cust.v1';

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 2600);
}

// ---- link data (saved so a page reload still works) ----
const saved = readJSON(LS_CUST, {});
const link = ShareLink.parse(location.hash);
if (link.s) saved.s = link.s;
if (link.t) saved.table = link.t;
saved.mine = saved.mine || [];
saved.cart = saved.cart || [];
const saveCust = () => writeJSON(LS_CUST, saved);
saveCust();
if (location.hash) history.replaceState(null, '', location.pathname); // keep the address bar short

const S = saved.s || {};
// QR links carry the connection; older cards (or a plain link) fall back to the shop's built-in Firebase
const FB = S.f || (typeof BUILTIN_FIREBASE !== 'undefined' ? JSON.parse(BUILTIN_FIREBASE) : null);
const C = {
  online: !!FB, root: null,
  menu: S.m ? ShareLink.menuFrom(S.m) : DEFAULT_MENU,  // shown at once; replaced by the live menu when connected
  tableCount: S.n || 6,
  tables: {},          // live occupancy when online
  statuses: {},        // my request id -> status
  cat: 'all',
  fixedTable: !!link.t,
};

// ---- theme / language ----
function applyTheme() {
  document.documentElement.dataset.theme = LOCAL.theme;
  $('#themeBtn').textContent = LOCAL.theme === 'dark' ? '☀' : '☾';
}
function applyLang() {
  document.documentElement.lang = LOCAL.lang;
  $('#langBtn').textContent = LOCAL.lang === 'ne' ? 'EN' : 'ने';
  $$('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
  document.title = t('shopName') + ' — ' + t('menu');
}
$('#themeBtn').onclick = () => { LOCAL.theme = LOCAL.theme === 'dark' ? 'light' : 'dark'; saveLocal(); applyTheme(); };
$('#langBtn').onclick = () => { LOCAL.lang = LOCAL.lang === 'ne' ? 'en' : 'ne'; saveLocal(); applyLang(); render(); };

// ---- rendering ----
const cartTotal = () => saved.cart.reduce((s, l) => s + l.price * l.qty, 0);
const cartCount = () => saved.cart.reduce((s, l) => s + l.qty, 0);

function tableButtons() {
  const n = C.tableCount;
  let html = '';
  for (let i = 1; i <= n; i++) {
    const tb = C.tables['t' + i];
    const busy = tb && tb.orders && tb.orders.length;
    const on = String(saved.table) === String(i);
    html += `<button class="tbl-pick ${on ? 'on' : ''} ${busy ? 'busy' : ''}" data-tb="${i}">
      <b>${num(tb && tb.name ? tb.name : i)}</b>${busy ? `<small>${t('occupied')}</small>` : ''}</button>`;
  }
  return html;
}

let renderLater = false;
function render() {
  // don't redraw under someone typing their name (live updates arrive any time)
  if (document.activeElement && document.activeElement.id === 'cName') { renderLater = true; renderCartBar(); return; }
  renderLater = false;
  const cats = ['all', ...new Set(C.menu.map(m => m.cat))];
  const items = C.menu.filter(m => C.cat === 'all' || m.cat === C.cat);
  $('#cMain').innerHTML = `
    ${saved.mine.length ? myOrdersHTML() : ''}
    <div class="card">
      <p style="margin:0 0 12px">${t('welcome')}</p>
      <div class="muted" style="font-size:.85rem;margin-bottom:6px">${t('chooseTable')}</div>
      <div class="tbl-picks">${tableButtons()}</div>
      <label class="field" style="margin-top:12px">${t('yourName')}<input id="cName" value="${esc(saved.name || '')}" autocomplete="name"></label>
    </div>
    <div class="card">
      <h3>${t('menu')}</h3>
      <div class="menu-cats seat-tabs">${cats.map(c => `<button data-c="${c}" class="${C.cat === c ? 'on' : ''}">${c === 'all' ? '★' : t('cat_' + c)}</button>`).join('')}</div>
      <div class="menu-grid">${items.length ? items.map(m => `
        <button class="menu-item" data-id="${esc(m.id)}">
          <span class="em">${m.emoji || '🍽'}</span>
          <span class="nm">${esc(itemName(m))}</span>
          <span class="pr">${rs(m.price)}${m.unit === 'piece' ? ' / ' + t('piece') : ''}</span>
          ${qtyIn(m.id) ? `<span class="in-cart">×${num(qtyIn(m.id))}</span>` : ''}
        </button>`).join('') : `<p class="muted">…</p>`}</div>
    </div>`;
  $$('.tbl-pick').forEach(b => b.onclick = () => { saved.table = b.dataset.tb; saveCust(); render(); });
  $('#cName').onchange = e => { saved.name = e.target.value.trim(); saveCust(); };
  $('#cName').onblur = () => { if (renderLater) setTimeout(render, 0); };
  $$('[data-c]').forEach(b => b.onclick = () => { C.cat = b.dataset.c; render(); });
  $$('.menu-item').forEach(b => b.onclick = () => pick(b.dataset.id));
  renderCartBar();
}
const qtyIn = id => saved.cart.filter(l => l.itemId === id).reduce((s, l) => s + l.qty, 0);

function renderCartBar() {
  const n = cartCount();
  $('#cartBar').classList.toggle('hidden', !n);
  $('#cartTot').textContent = `${num(n)} ${t('items')} · ${rs(cartTotal())}`;
  $('#cartOpen').textContent = '🧾 ' + t('yourOrder');
  $('#cartOpen').onclick = openCart;
}

function myOrdersHTML() {
  const recent = saved.mine.filter(r => Date.now() - r.at < 12 * 3600e3).slice(-5).reverse();
  if (!recent.length) return '';
  return `<div class="card">
    <h3>${t('myOrders')}</h3>
    ${recent.map(r => {
      const st = C.statuses[r.id] || r.status || 'pending';
      const cls = st === 'accepted' ? 'served' : st === 'rejected' ? 'danger' : 'new';
      const msg = st === 'accepted' ? t('orderAccepted') : st === 'rejected' ? t('orderRejected') : t('orderSent');
      return `<div class="k-line"><div class="info"><b>${t('table')} ${esc(num(r.tableName))} · ${hhmm(r.at)}</b>
        <div class="opt">${r.items.map(i => esc(LOCAL.lang === 'ne' && i.ne ? i.ne : i.name) + ' ×' + num(i.qty)).join(', ')} · ${rs(r.total)}</div></div>
        <span class="pill ${cls}">${msg}</span></div>`;
    }).join('')}
  </div>`;
}

// ---- item options ----
function pick(id) {
  const m = C.menu.find(x => x.id === id);
  if (!m) return;
  if (!m.sugar && !addonList(m).length) { addToCart(m, { qty: 1, sugar: '', addons: [], note: '' }); return; }
  const st = { qty: 1, sugar: m.sugar ? 'withSugar' : '', addons: [], note: '' };
  const draw = () => {
    const ads = addonList(m);
    $('#modalCard').innerHTML = `
      <h3 style="margin-top:0">${m.emoji || ''} ${esc(itemName(m))} <span class="muted">· ${rs(m.price)}</span></h3>
      ${ads.length ? `<div class="muted">${t('addons')}</div>
        <div class="opts">${ads.map(a => `<label class="opt-box ${st.addons.includes(a) ? 'on' : ''}"><input type="checkbox" data-a="${esc(a)}" ${st.addons.includes(a) ? 'checked' : ''}>${esc(biLabel(a))}</label>`).join('')}</div>` : ''}
      ${m.sugar ? `<div class="muted">${t('sugar')}</div>
        <div class="seg" style="margin:6px 0 12px">${['withSugar', 'lessSugar', 'noSugar'].map(s => `<button data-s="${s}" class="${st.sugar === s ? 'on' : ''}">${t(s)}</button>`).join('')}</div>` : ''}
      <div class="row" style="margin-bottom:12px">
        <span class="muted grow">${t('qty')}</span>
        <div class="qty"><button id="oqM">−</button><span>${num(st.qty)}</span><button id="oqP">+</button></div>
      </div>
      <label class="field">${t('note')}<input id="oNote" value="${esc(st.note)}" placeholder="${esc(t('notePh'))}"></label>
      <div class="row" style="justify-content:flex-end">
        <button class="btn" id="oCancel">${t('cancel')}</button>
        <button class="btn primary" id="oOk">${t('add')} · ${rs(m.price * st.qty)}</button>
      </div>`;
    const keepNote = () => { st.note = $('#oNote').value; };
    $$('#modalCard [data-a]').forEach(c => c.onchange = () => { keepNote(); st.addons = c.checked ? [...st.addons, c.dataset.a] : st.addons.filter(a => a !== c.dataset.a); draw(); });
    $$('#modalCard [data-s]').forEach(b => b.onclick = () => { keepNote(); st.sugar = b.dataset.s; draw(); });
    $('#oqM').onclick = () => { keepNote(); st.qty = Math.max(1, st.qty - 1); draw(); };
    $('#oqP').onclick = () => { keepNote(); st.qty++; draw(); };
    $('#oCancel').onclick = closeModal;
    $('#oOk').onclick = () => {
      st.note = $('#oNote').value.trim();
      st.addons = ads.filter(a => st.addons.includes(a));
      addToCart(m, st); closeModal();
    };
  };
  draw(); openModal();
}

function addToCart(m, st) {
  const same = saved.cart.find(l => l.itemId === m.id && l.sugar === st.sugar && l.note === st.note && JSON.stringify(l.addons) === JSON.stringify(st.addons));
  if (same) same.qty += st.qty;
  else saved.cart.push({ id: uid(), itemId: m.id, name: m.en, ne: m.ne, price: m.price, qty: st.qty, sugar: st.sugar, addons: st.addons, note: st.note });
  saveCust(); render();
  toast(`${t('sentToKitchen')}: ${itemName(m)} ×${num(st.qty)}`);
}

// ---- cart + sending ----
function openCart() {
  const draw = () => {
    if (!saved.cart.length) { closeModal(); render(); return; }
    $('#modalCard').innerHTML = `
      <h3 style="margin-top:0">🧾 ${t('yourOrder')}</h3>
      <div class="muted" style="margin-bottom:8px">${saved.table ? t('table') + ' ' + num(saved.table) : t('needTable')}${saved.name ? ' · ' + esc(saved.name) : ''}</div>
      ${saved.cart.map(l => `
        <div class="ord-line" data-l="${l.id}">
          <div class="info"><div class="nm">${esc(LOCAL.lang === 'ne' && l.ne ? l.ne : l.name)}</div><div class="opt">${esc(optText(l))}</div></div>
          <div class="qty"><button data-q="-1">−</button><span>${num(l.qty)}</span><button data-q="1">+</button></div>
          <div class="lt">${rs(l.price * l.qty)}</div>
        </div>`).join('')}
      <div class="row" style="justify-content:space-between;margin:10px 0;font-size:1.1rem"><b>${t('total')}</b><b>${rs(cartTotal())}</b></div>
      ${C.online ? '' : `<p class="muted" style="font-size:.85rem">${t('showWaiter')}</p>`}
      <div class="row" style="justify-content:flex-end">
        <button class="btn" id="cClose">${t('close')}</button>
        ${C.online ? `<button class="btn primary" id="cSend">📨 ${t('placeOrder')}</button>` : ''}
      </div>`;
    $$('#modalCard [data-q]').forEach(b => b.onclick = () => {
      const l = saved.cart.find(x => x.id === b.closest('[data-l]').dataset.l);
      l.qty += +b.dataset.q;
      if (l.qty <= 0) saved.cart = saved.cart.filter(x => x !== l);
      saveCust(); draw(); render();
    });
    $('#cClose').onclick = closeModal;
    if ($('#cSend')) $('#cSend').onclick = send;
  };
  draw(); openModal();
}

async function send() {
  saved.name = ($('#cName') && $('#cName').value.trim()) || saved.name || '';
  if (!saved.table) { toast(t('needTable')); closeModal(); return; }
  if (!saved.name) { toast(t('needName')); closeModal(); $('#cName').focus(); return; }
  const btn = $('#cSend'); btn.disabled = true;
  const tb = C.tables['t' + saved.table];
  const req = {
    id: uid(), date: dayKey(), at: Date.now(), status: 'pending',
    table: 't' + saved.table, tableName: tb && tb.name ? tb.name : String(saved.table),
    focal: saved.name, items: saved.cart, total: cartTotal(),
  };
  try {
    await Promise.race([
      C.root.collection('requests').doc(req.id).set(JSON.parse(JSON.stringify(req))),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000)),
    ]);
    saved.mine.push({ id: req.id, at: req.at, tableName: req.tableName, items: req.items, total: req.total, status: 'pending' });
    saved.cart = []; saveCust();
    watchMine(); closeModal(); render();
    window.scrollTo(0, 0);
    toast(t('orderSent'));
  } catch (e) {
    console.warn(e); btn.disabled = false; toast(t('sendFailed'));
  }
}

// ---- live data ----
const watched = new Set();
function watchMine() {
  if (!C.root) return;
  saved.mine.filter(r => Date.now() - r.at < 12 * 3600e3).forEach(r => {
    if (watched.has(r.id)) return;
    watched.add(r.id);
    C.root.collection('requests').doc(r.id).onSnapshot(d => {
      if (!d.exists) return;
      const st = d.data().status;
      if (C.statuses[r.id] && C.statuses[r.id] !== st && navigator.vibrate) navigator.vibrate(200);
      C.statuses[r.id] = st; r.status = st; saveCust(); render();
    }, () => { });
  });
}

async function connect() {
  if (!C.online) return;
  try {
    await Sync.loadScript(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-app-compat.js`);
    await Sync.loadScript(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-firestore-compat.js`);
    const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(FB);
    C.root = app.firestore().collection('shops').doc(String(S.c || 'genj').toLowerCase());
    C.root.collection('meta').doc('settings').onSnapshot(d => {
      if (!d.exists) return;
      const s = d.data();
      C.menu = s.menu || DEFAULT_MENU; C.tableCount = s.tableCount || C.tableCount;
      render();
    }, e => { console.warn(e); C.menu = DEFAULT_MENU; render(); });
    C.root.collection('tables').onSnapshot(snap => {
      snap.forEach(d => { C.tables[d.id] = d.data(); });
      render();
    }, () => { });
    watchMine();
  } catch (e) {
    console.warn('connect failed', e);
    C.online = false; C.menu = DEFAULT_MENU; render();
  }
}

function openModal() { $('#modal').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); $('#modalCard').innerHTML = ''; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

applyTheme(); applyLang(); render(); connect();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
