// GenJ ChatPate Shop — UI
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WALLETS = ['eSewa', 'Khalti', 'Fonepay QR', 'Mobile Banking', 'IME Pay', 'Other'];

let currentView = 'tables';
let cur = { table: null, seat: 0, cat: 'all' };
let kitchenFilter = 'active';
let reportDay = dayKey();

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 2200);
}

// ---------- theme & language ----------
function applyTheme() {
  document.documentElement.dataset.theme = LOCAL.theme;
  $('meta[name="theme-color"]').content = LOCAL.theme === 'dark' ? '#211a15' : '#e8551f';
  $('#themeBtn').textContent = LOCAL.theme === 'dark' ? '☀' : '☾';
}
function applyLang() {
  document.documentElement.lang = LOCAL.lang;
  $('#langBtn').textContent = LOCAL.lang === 'ne' ? 'EN' : 'ने';
  $$('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
  document.title = t('shopName');
  Sync.setStatus();
}
$('#themeBtn').onclick = () => { LOCAL.theme = LOCAL.theme === 'dark' ? 'light' : 'dark'; saveLocal(); applyTheme(); };
$('#langBtn').onclick = () => { LOCAL.lang = LOCAL.lang === 'ne' ? 'en' : 'ne'; saveLocal(); applyLang(); renderAll(); };

// ---------- navigation ----------
$$('.bottomnav button').forEach(b => b.onclick = () => showView(b.dataset.view));
function showView(v) {
  currentView = v;
  $$('.bottomnav button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  $$('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
  renderView();
  window.scrollTo(0, 0);
}
function renderView() {
  ({ tables: renderTables, kitchen: renderKitchen, reports: renderReports, settings: renderSettings })[currentView]();
}
function renderAll() {
  // don't wipe a settings form the user is typing in when another phone syncs a change
  const typing = currentView === 'settings' && $('#view-settings').contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  if (!typing) renderView();
  updateBadge();
  if (cur.table) refreshSheet();
}

function updateBadge() {
  const n = Store.tableList().reduce((s, tb) => s + tb.orders.filter(o => o.status === 'new').length, 0) + Requests.list().length;
  const b = $('#kitchenBadge');
  b.textContent = num(n); b.classList.toggle('hidden', !n);
}

// ---------- table drawing ----------
function tableSVG(tb, { selSeat = null, interactive = false } = {}) {
  const W = 220, C = W / 2, R = 48, CR = 20, dist = R + 34;
  const n = Math.max(1, tb.chairs);
  let chairs = '';
  for (let i = 0; i < n; i++) {
    const seat = i + 1;
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    const x = C + dist * Math.cos(a), y = C + dist * Math.sin(a);
    const cnt = tb.orders.filter(o => o.seat === seat).reduce((s, o) => s + o.qty, 0);
    const cls = `chair${cnt ? ' has' : ''}${selSeat === seat ? ' sel' : ''}${interactive ? ' clickable' : ''}`;
    chairs += `<g data-seat="${seat}" class="${interactive ? 'clickable' : ''}">
      <circle class="${cls}" cx="${x}" cy="${y}" r="${CR}"></circle>
      <text class="chair-text${cnt ? ' on' : ''}" x="${x}" y="${y + (cnt ? -2 : 4)}" text-anchor="middle">${num(seat)}</text>
      ${cnt ? `<text class="chair-text on" x="${x}" y="${y + 13}" text-anchor="middle" font-size="10">×${num(cnt)}</text>` : ''}
    </g>`;
  }
  const whole = tb.orders.filter(o => !o.seat).reduce((s, o) => s + o.qty, 0);
  const total = tableCount(tb);
  return `<svg viewBox="0 0 ${W} ${W}" role="img" aria-label="${esc(t('table'))} ${esc(tb.name)}">
    ${chairs}
    <g data-seat="0" class="${interactive ? 'clickable' : ''}">
      <circle class="tbl" cx="${C}" cy="${C}" r="${R}" ${selSeat === 0 ? 'style="stroke:var(--text);stroke-width:5"' : ''}></circle>
      <text class="tbl-text" x="${C}" y="${C - 6}" text-anchor="middle" font-size="22">${esc(num(tb.name))}</text>
      <text class="tbl-text" x="${C}" y="${C + 16}" text-anchor="middle" font-size="12">${total ? num(total) + ' ' + t('items') : t('free')}</text>
      ${interactive && whole ? `<text class="tbl-text" x="${C}" y="${C + 32}" text-anchor="middle" font-size="10">${t('wholeTable')} ×${num(whole)}</text>` : ''}
    </g>
  </svg>`;
}

function renderTables() {
  const el = $('#view-tables');
  const list = Store.tableList();
  const busy = list.filter(tb => tb.orders.length);
  el.innerHTML = `
    <div class="section-head">
      <h2>${t('tables')} <span class="muted" style="font-size:.85rem">· ${num(busy.length)}/${num(list.length)} ${t('busy')}</span></h2>
      <div class="legend">
        <span><i style="background:var(--chair)"></i>${t('free')}</span>
        <span><i style="background:var(--warn)"></i>${t('busy')}</span>
        <span><i style="background:var(--info)"></i>${t('ready')}</span>
        <span><i style="background:var(--brand)"></i>${t('chair')} + ${t('orders')}</span>
      </div>
      <button class="btn small" id="qrQuick">📱 ${t('qrMenu')}</button>
    </div>
    <div class="floor">
      ${list.map(tb => `
        <div class="table-card ${tableStatus(tb)}" data-id="${tb.id}" role="button" tabindex="0">
          ${tableSVG(tb)}
          <div class="focal">${tb.focal ? '👤 ' + esc(tb.focal) : '&nbsp;'}</div>
          <div class="amt">${tb.orders.length ? rs(tableTotal(tb)) : '<span class="muted">' + t('free') + '</span>'}</div>
        </div>`).join('')}
    </div>`;
  $('#qrQuick').onclick = openQR;
  $$('.table-card', el).forEach(c => {
    c.onclick = () => openTable(c.dataset.id);
    c.onkeydown = e => { if (e.key === 'Enter') openTable(c.dataset.id); };
  });
}

// ---------- table order sheet ----------
function openTable(id) {
  cur.table = id; cur.seat = 0;
  const tb = Store.state.tables[id];
  $('#sheetCard').innerHTML = `
    <div class="sheet-head">
      <button class="icon-btn" id="shClose" aria-label="${t('close')}">←</button>
      <h2 id="shTitle"></h2>
      <button class="btn small danger" id="shCancelAll">${t('cancelOrder')}</button>
    </div>
    <div class="sheet-body">
      <div class="order-layout">
        <div>
          <div class="card">
            <label class="field">${t('focal')}<input id="focalIn" placeholder="${esc(t('focalPh'))}" value="${esc(tb.focal)}"></label>
            <div class="row" style="justify-content:space-between">
              <span class="muted">${t('chairs')}: <b id="chairN"></b></span>
              <div class="row">
                <button class="btn small" id="chairMinus" title="${t('removeChair')}">− ${t('chair')}</button>
                <button class="btn small" id="chairPlus" title="${t('addChair')}">+ ${t('chair')}</button>
              </div>
            </div>
            <div class="seat-picker" id="seatPicker"></div>
            <div class="seat-tabs" id="seatTabs"></div>
          </div>
          <div class="card">
            <h3>${t('currentOrder')}</h3>
            <div id="orderList"></div>
          </div>
        </div>
        <div class="card">
          <h3>${t('menu')} <span class="muted" id="addingFor" style="font-weight:500;font-size:.85rem"></span></h3>
          <div class="menu-cats seat-tabs" id="menuCats"></div>
          <div class="menu-grid" id="menuGrid"></div>
        </div>
      </div>
    </div>
    <div class="sheet-foot">
      <div class="tot" id="shTotal"></div>
      <button class="btn primary" id="shBill">🧾 ${t('generateBill')}</button>
    </div>`;
  $('#sheet').classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  $('#shClose').onclick = closeSheet;
  $('#focalIn').onchange = e => Store.updateTable(id, tb => { tb.focal = e.target.value.trim(); });
  $('#chairPlus').onclick = () => Store.updateTable(id, tb => { tb.chairs = Math.min(16, tb.chairs + 1); });
  $('#chairMinus').onclick = () => {
    const tb = Store.state.tables[id];
    if (tb.chairs <= 1) return;
    if (tb.orders.some(o => o.seat === tb.chairs)) { toast(t('chair') + ' ' + num(tb.chairs) + ': ' + t('orders')); return; }
    Store.updateTable(id, tb => { tb.chairs -= 1; if (cur.seat > tb.chairs) cur.seat = 0; });
  };
  $('#shCancelAll').onclick = () => cancelAll(id);
  $('#shBill').onclick = () => openBill(id);
  refreshSheet();
}
function closeSheet() {
  cur.table = null;
  $('#sheet').classList.add('hidden');
  document.body.style.overflow = '';
}

function refreshSheet() {
  const id = cur.table, tb = Store.state.tables[id];
  if (!tb) return closeSheet();
  $('#shTitle').textContent = `${t('table')} ${num(tb.name)}${tb.focal ? ' · ' + tb.focal : ''}`;
  if (document.activeElement !== $('#focalIn')) $('#focalIn').value = tb.focal;
  $('#chairN').textContent = num(tb.chairs);
  $('#seatPicker').innerHTML = tableSVG(tb, { selSeat: cur.seat, interactive: true });
  $$('#seatPicker [data-seat]').forEach(g => g.onclick = () => { cur.seat = +g.dataset.seat; refreshSheet(); });
  const seats = [0, ...Array.from({ length: tb.chairs }, (_, i) => i + 1)];
  $('#seatTabs').innerHTML = seats.map(s => `<button data-s="${s}" class="${cur.seat === s ? 'on' : ''}">${s ? '🪑 ' + num(s) : '🍽 ' + t('wholeTable')}</button>`).join('');
  $$('#seatTabs button').forEach(b => b.onclick = () => { cur.seat = +b.dataset.s; refreshSheet(); });
  $('#addingFor').textContent = '→ ' + (cur.seat ? t('chair') + ' ' + num(cur.seat) : t('wholeTable'));

  // menu
  const cats = ['all', ...new Set(Store.menu.map(m => m.cat))];
  $('#menuCats').innerHTML = cats.map(c => `<button data-c="${c}" class="${cur.cat === c ? 'on' : ''}">${c === 'all' ? '★' : t('cat_' + c)}</button>`).join('');
  $$('#menuCats button').forEach(b => b.onclick = () => { cur.cat = b.dataset.c; refreshSheet(); });
  const items = Store.menu.filter(m => cur.cat === 'all' || m.cat === cur.cat);
  $('#menuGrid').innerHTML = items.map(m => `
    <button class="menu-item" data-id="${m.id}">
      <span class="em">${m.emoji || '🍽'}</span>
      <span class="nm">${esc(itemName(m))}</span>
      <span class="pr">${rs(m.price)}${m.unit === 'piece' ? ' / ' + t('piece') : ''}</span>
    </button>`).join('');
  $$('#menuGrid .menu-item').forEach(b => b.onclick = () => pickItem(b.dataset.id));

  // order list grouped by seat
  const groups = {};
  tb.orders.forEach(o => { (groups[o.seat || 0] = groups[o.seat || 0] || []).push(o); });
  const keys = Object.keys(groups).map(Number).sort((a, b) => a - b);
  $('#orderList').innerHTML = keys.length ? keys.map(k => `
    <div class="ord-group">
      <h4>${k ? '🪑 ' + t('chair') + ' ' + num(k) : '🍽 ' + t('wholeTable')}</h4>
      ${groups[k].map(o => `
        <div class="ord-line" data-o="${o.id}">
          <div class="info">
            <div class="nm">${esc(LOCAL.lang === 'ne' && o.ne ? o.ne : o.name)} <button class="pill ${o.status}" data-act="status" style="border:0">${t('st_' + o.status)}</button></div>
            <div class="opt">${esc(optText(o))}${optText(o) ? ' · ' : ''}${rs(o.price)} ${t('each')}</div>
          </div>
          <div class="qty"><button data-act="minus">−</button><span>${num(o.qty)}</span><button data-act="plus">+</button></div>
          <div class="lt">${rs(lineTotal(o))}</div>
          <button class="mini" data-act="edit" title="${t('revise')}">✎</button>
          <button class="mini" data-act="del" title="${t('cancelItem')}" style="color:var(--danger)">✕</button>
        </div>`).join('')}
    </div>`).join('') : `<p class="muted">${t('noOrders')}</p>`;
  $$('#orderList .ord-line').forEach(line => {
    const oid = line.dataset.o;
    $$('[data-act]', line).forEach(b => b.onclick = () => orderAction(id, oid, b.dataset.act));
  });
  $('#shTotal').textContent = `${t('total')}: ${rs(tableTotal(tb))}`;
  $('#shBill').disabled = !tb.orders.length;
  $('#shCancelAll').classList.toggle('hidden', !tb.orders.length);
}

function pickItem(itemId) {
  const m = Store.menu.find(x => x.id === itemId);
  if (!m) return;
  if (m.sugar || addonList(m).length) openOptions({ item: m });
  else addOrder(cur.table, m, { qty: 1 });
}

function addOrder(tid, m, { qty = 1, sugar = '', addons = [], note = '', seat = cur.seat }) {
  Store.updateTable(tid, tb => {
    const same = tb.orders.find(o => o.itemId === m.id && o.seat === seat && o.status === 'new' &&
      o.sugar === sugar && o.note === note && JSON.stringify(o.addons) === JSON.stringify(addons));
    if (same) same.qty += qty;
    else tb.orders.push({ id: uid(), itemId: m.id, name: m.en, ne: m.ne, price: m.price, qty, seat, sugar, addons, note, status: 'new', at: Date.now(), by: LOCAL.waiter || '' });
  });
  toast(`${t('sentToKitchen')}: ${itemName(m)} ×${num(qty)}`);
}

// Option dialog — used for new items and for revising an existing line
function openOptions({ item, order }) {
  const m = item || Store.menu.find(x => x.id === order.itemId) || { en: order.name, ne: order.ne, price: order.price, sugar: !!order.sugar, addons: (order.addons || []).join(',') };
  const tb = Store.state.tables[cur.table];
  const st = {
    qty: order ? order.qty : 1,
    sugar: order ? order.sugar : (m.sugar ? 'withSugar' : ''),
    addons: order ? [...order.addons] : [],
    note: order ? order.note : '',
    seat: order ? (order.seat || 0) : cur.seat,
  };
  const draw = () => {
    const ads = addonList(m);
    $('#modalCard').innerHTML = `
      <h3 style="margin-top:0">${m.emoji || ''} ${esc(itemName(m))} <span class="muted">· ${rs(order ? order.price : m.price)}</span></h3>
      ${ads.length ? `<div class="muted">${t('addons')}</div>
        <div class="opts">${ads.map(a => `<label class="opt-box ${st.addons.includes(a) ? 'on' : ''}"><input type="checkbox" data-a="${esc(a)}" ${st.addons.includes(a) ? 'checked' : ''}>${esc(biLabel(a))}</label>`).join('')}</div>` : ''}
      ${m.sugar ? `<div class="muted">${t('sugar')}</div>
        <div class="seg" style="margin:6px 0 12px">${['withSugar', 'lessSugar', 'noSugar'].map(s => `<button data-s="${s}" class="${st.sugar === s ? 'on' : ''}">${t(s)}</button>`).join('')}</div>` : ''}
      <div class="row" style="margin-bottom:12px">
        <span class="muted grow">${t('qty')}</span>
        <div class="qty"><button id="oqM">−</button><span id="oqN">${num(st.qty)}</span><button id="oqP">+</button></div>
      </div>
      ${order ? `<label class="field">${t('moveTo')}<select id="oSeat">${[0, ...Array.from({ length: tb.chairs }, (_, i) => i + 1)].map(s => `<option value="${s}" ${st.seat === s ? 'selected' : ''}>${s ? t('chair') + ' ' + num(s) : t('wholeTable')}</option>`).join('')}</select></label>` : ''}
      <label class="field">${t('note')}<input id="oNote" value="${esc(st.note)}" placeholder="${esc(t('notePh'))}"></label>
      <div class="row" style="justify-content:flex-end">
        <button class="btn" id="oCancel">${t('cancel')}</button>
        <button class="btn primary" id="oOk">${order ? t('save') : t('add') + ' · ' + rs((order ? order.price : m.price) * st.qty)}</button>
      </div>`;
    $$('#modalCard [data-a]').forEach(c => c.onchange = () => {
      st.note = $('#oNote').value;
      st.addons = c.checked ? [...st.addons, c.dataset.a] : st.addons.filter(a => a !== c.dataset.a);
      draw();
    });
    $$('#modalCard [data-s]').forEach(b => b.onclick = () => { st.note = $('#oNote').value; st.sugar = b.dataset.s; draw(); });
    $('#oqM').onclick = () => { st.note = $('#oNote').value; st.qty = Math.max(1, st.qty - 1); draw(); };
    $('#oqP').onclick = () => { st.note = $('#oNote').value; st.qty += 1; draw(); };
    if ($('#oSeat')) $('#oSeat').onchange = e => { st.seat = +e.target.value; };
    $('#oCancel').onclick = closeModal;
    $('#oOk').onclick = () => {
      st.note = $('#oNote').value.trim();
      // keep add-ons in menu order
      st.addons = addonList(m).filter(a => st.addons.includes(a)).concat(st.addons.filter(a => !addonList(m).includes(a)));
      if (order) {
        Store.updateTable(cur.table, tb => {
          const o = tb.orders.find(x => x.id === order.id);
          if (!o) return;
          Object.assign(o, { qty: st.qty, sugar: st.sugar, addons: st.addons, note: st.note, seat: st.seat });
        });
      } else addOrder(cur.table, m, st);
      closeModal();
    };
  };
  draw();
  openModal();
}

function orderAction(tid, oid, act) {
  const tb = Store.state.tables[tid];
  const o = tb.orders.find(x => x.id === oid);
  if (!o) return;
  if (act === 'plus') Store.updateTable(tid, tb => { tb.orders.find(x => x.id === oid).qty++; });
  if (act === 'minus') {
    if (o.qty <= 1) return cancelLine(tid, oid);
    Store.updateTable(tid, tb => { tb.orders.find(x => x.id === oid).qty--; });
    logCancel(tb, o, 1, '');
  }
  if (act === 'status') {
    const next = { new: 'cooking', cooking: 'served', served: 'new' }[o.status];
    Store.updateTable(tid, tb => { tb.orders.find(x => x.id === oid).status = next; });
  }
  if (act === 'edit') openOptions({ order: o });
  if (act === 'del') cancelLine(tid, oid);
}

function logCancel(tb, o, qty, reason) {
  Store.addCancel({ id: uid(), date: dayKey(), at: Date.now(), tableName: tb.name, name: o.name, opts: optText(o), qty, amount: o.price * qty, reason, by: LOCAL.waiter || '' });
}

function confirmBox(msg, withReason, onYes) {
  $('#modalCard').innerHTML = `
    <h3 style="margin-top:0">${esc(msg)}</h3>
    ${withReason ? `<label class="field">${t('reason')}<input id="cReason"></label>` : ''}
    <div class="row" style="justify-content:flex-end">
      <button class="btn" id="cNo">${t('close')}</button>
      <button class="btn primary" id="cYes" style="background:var(--danger);border-color:var(--danger)">${t('cancel')}</button>
    </div>`;
  $('#cNo').onclick = closeModal;
  $('#cYes').onclick = () => { const r = withReason ? $('#cReason').value.trim() : ''; closeModal(); onYes(r); };
  openModal();
}
function cancelLine(tid, oid) {
  confirmBox(t('confirmCancelItem'), true, reason => {
    const tb = Store.state.tables[tid];
    const o = tb.orders.find(x => x.id === oid);
    if (!o) return;
    logCancel(tb, o, o.qty, reason);
    Store.updateTable(tid, tb => { tb.orders = tb.orders.filter(x => x.id !== oid); });
  });
}
function cancelAll(tid) {
  confirmBox(t('confirmCancelAll'), true, reason => {
    const tb = Store.state.tables[tid];
    tb.orders.forEach(o => logCancel(tb, o, o.qty, reason));
    Store.updateTable(tid, tb => { tb.orders = []; tb.focal = ''; tb.openedAt = 0; });
  });
}

// ---------- modal helpers ----------
function openModal() { $('#modal').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); $('#modalCard').innerHTML = ''; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!$('#modal').classList.contains('hidden')) closeModal();
  else if (cur.table) closeSheet();
});

// ---------- billing ----------
function billPaperHTML(b) {
  return `<div class="bill-paper">
    <h3>${esc(I18N.en.shopName)}</h3>
    <div class="c">${esc(I18N.ne.shopName)}</div>
    <hr>
    <div>${t('billNo')}: <b>${esc(b.no)}</b></div>
    <div>${t('date')}: ${b.date} ${hhmm(b.at)}</div>
    <div>${t('table')}: ${esc(b.tableName)}${b.focal ? ' · ' + esc(b.focal) : ''}</div>
    <hr>
    <table>
      ${b.lines.map(l => `<tr><td>${esc(l.label || l.name)}${l.opts ? `<br><small>${esc(l.opts)}</small>` : ''}</td><td class="r">${l.qty}×${l.price}</td><td class="r">${l.amount}</td></tr>`).join('')}
    </table>
    <hr>
    <table>
      <tr><td>${t('subtotal')}</td><td class="r">${b.subtotal}</td></tr>
      ${b.discount ? `<tr><td>${t('discount')}</td><td class="r">−${b.discount}</td></tr>` : ''}
      <tr><td><b>${t('grandTotal')}</b></td><td class="r"><b>Rs. ${b.total}</b></td></tr>
      ${b.method ? `<tr><td>${t('paidVia')}</td><td class="r">${b.method === 'cash' ? t('cash') : t('online') + (b.wallet ? ' (' + esc(b.wallet) + ')' : '')}</td></tr>` : ''}
    </table>
    <hr>
    <div class="c">${t('thanks')}</div>
  </div>`;
}

function buildBill(tb, discount, method, wallet) {
  const lines = tb.orders.map(o => ({
    name: o.name, label: LOCAL.lang === 'ne' && o.ne ? o.ne : o.name, opts: optText(o),
    qty: o.qty, price: o.price, amount: o.price * o.qty, seat: o.seat ? 'Chair ' + o.seat : '',
  }));
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  discount = Math.min(Math.max(0, +discount || 0), subtotal);
  const date = dayKey();
  const no = date.slice(2).replace(/-/g, '') + '-' + String(Store.billsOn(date).length + 1).padStart(3, '0');
  return { id: uid(), no, date, at: Date.now(), tableId: tb.id, tableName: tb.name, focal: tb.focal, lines, subtotal, discount, total: subtotal - discount, method, wallet, by: LOCAL.waiter || '' };
}

function openBill(tid) {
  const tb = Store.state.tables[tid];
  if (!tb.orders.length) return toast(t('emptyBill'));
  const st = { discount: 0, method: 'cash', wallet: WALLETS[0] };
  const draw = () => {
    const b = buildBill(tb, st.discount, st.method, st.method === 'online' ? st.wallet : '');
    $('#modalCard').innerHTML = `
      ${billPaperHTML(b)}
      <label class="field">${t('discount')} (Rs.)<input id="bDisc" type="number" min="0" inputmode="numeric" value="${st.discount || ''}"></label>
      <div class="muted">${t('payMethod')}</div>
      <div class="seg" style="margin:6px 0 10px;width:100%">
        <button data-m="cash" class="${st.method === 'cash' ? 'on' : ''}" style="flex:1">💵 ${t('cash')}</button>
        <button data-m="online" class="${st.method === 'online' ? 'on' : ''}" style="flex:1">📱 ${t('online')}</button>
      </div>
      ${st.method === 'online' ? `<label class="field">${t('wallet')}<select id="bWallet">${WALLETS.map(w => `<option ${w === st.wallet ? 'selected' : ''}>${w}</option>`).join('')}</select></label>` : ''}
      <div class="row" style="justify-content:flex-end">
        <button class="btn" id="bClose">${t('close')}</button>
        <button class="btn" id="bPrint">🖨 ${t('print')}</button>
        <button class="btn ok" id="bPaid">✔ ${t('markPaid')}</button>
      </div>`;
    $('#bDisc').onchange = e => { st.discount = +e.target.value || 0; draw(); };
    $$('#modalCard [data-m]').forEach(x => x.onclick = () => { st.discount = +$('#bDisc').value || 0; st.method = x.dataset.m; draw(); });
    if ($('#bWallet')) $('#bWallet').onchange = e => { st.wallet = e.target.value; };
    $('#bClose').onclick = closeModal;
    $('#bPrint').onclick = () => printBill(buildBill(tb, +$('#bDisc').value || 0, st.method, st.method === 'online' ? st.wallet : ''));
    $('#bPaid').onclick = () => {
      const bill = buildBill(Store.state.tables[tid], +$('#bDisc').value || 0, st.method, st.method === 'online' ? st.wallet : '');
      Store.addBill(bill);
      Store.updateTable(tid, tb => { tb.orders = []; tb.focal = ''; tb.openedAt = 0; });
      closeModal(); closeSheet();
      toast(`${t('billSaved')} · ${rs(bill.total)} · ${bill.method === 'cash' ? t('cash') : t('online')}`);
    };
  };
  draw();
  openModal();
}
function billText(b) {
  const L = [I18N.en.shopName, `${t('billNo')}: ${b.no}`, `${b.date} ${hhmm(b.at)} · ${t('table')} ${b.tableName}${b.focal ? ' · ' + b.focal : ''}`, '----------------'];
  b.lines.forEach(l => L.push(`${l.label || l.name}${l.opts ? ' (' + l.opts + ')' : ''}  ${l.qty}x${l.price} = ${l.amount}`));
  L.push('----------------', `${t('subtotal')}: ${b.subtotal}`);
  if (b.discount) L.push(`${t('discount')}: -${b.discount}`);
  L.push(`${t('grandTotal')}: Rs. ${b.total}`);
  if (b.method) L.push(`${t('paidVia')}: ${b.method === 'cash' ? t('cash') : t('online') + (b.wallet ? ' (' + b.wallet + ')' : '')}`);
  L.push('', t('thanks'));
  return L.join('\n');
}
function printBill(b) {
  if (FileOut.native()) {
    // Android app: share the bill (Bluetooth printer apps, WhatsApp, Viber, etc.)
    Capacitor.Plugins.Share.share({ title: t('bill') + ' ' + b.no, text: billText(b) }).catch(() => { });
    return;
  }
  $('#printArea').innerHTML = billPaperHTML(b);
  window.print();
}

// ---------- kitchen / live order tracking ----------
function ago(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  return m < 1 ? t('justNow') : `${num(m)} ${t('min')} ${t('ago')}`;
}
function renderKitchen() {
  const el = $('#view-kitchen');
  const tables = Store.tableList().filter(tb => tb.orders.length);
  const cards = tables.map(tb => {
    const lines = tb.orders.filter(o => kitchenFilter === 'all' || o.status !== 'served').sort((a, b) => a.at - b.at);
    if (!lines.length) return '';
    const oldest = Math.min(...lines.map(o => o.at));
    const color = lines.some(o => o.status === 'new') ? 'var(--warn)' : lines.some(o => o.status === 'cooking') ? 'var(--info)' : 'var(--ok)';
    return `<div class="k-card" style="border-left-color:${color}">
      <h3><span>${t('table')} ${esc(num(tb.name))}${tb.focal ? ' · ' + esc(tb.focal) : ''}</span><span class="muted" style="font-size:.8rem">${ago(oldest)}</span></h3>
      ${lines.map(o => `
        <div class="k-line">
          <div class="info">
            <b>${num(o.qty)}× ${esc(LOCAL.lang === 'ne' && o.ne ? o.ne : o.name)}</b>
            <span class="muted" style="font-size:.78rem"> · ${o.seat ? t('chair') + ' ' + num(o.seat) : t('wholeTable')}</span>
            ${optText(o) ? `<div class="opt">${esc(optText(o))}</div>` : ''}
            <div class="opt">${ago(o.at)}${o.by ? ' · ' + esc(o.by) : ''}</div>
          </div>
          <button class="btn small pill ${o.status}" data-t="${tb.id}" data-o="${o.id}" style="border:0;min-height:36px">${t('st_' + o.status)} →</button>
        </div>`).join('')}
    </div>`;
  }).join('');
  el.innerHTML = `
    <div class="section-head">
      <h2>${t('kitchenTitle')}</h2>
      <div class="seg">
        <button data-f="active" class="${kitchenFilter === 'active' ? 'on' : ''}">${t('st_new')} + ${t('st_cooking')}</button>
        <button data-f="all" class="${kitchenFilter === 'all' ? 'on' : ''}">★</button>
      </div>
    </div>
    ${Requests.list().length ? `<h3 style="margin:0 0 8px">🔔 ${t('custOrders')}</h3><div class="k-grid" style="margin-bottom:16px">${Requests.list().map(r => `
      <div class="k-card req-card">
        <h3><span>${t('table')} ${esc(num(r.tableName))} · 👤 ${esc(r.focal)}</span><span class="muted" style="font-size:.8rem">${ago(r.at)}</span></h3>
        ${r.items.map(i => `<div class="k-line"><div class="info"><b>${num(i.qty)}× ${esc(LOCAL.lang === 'ne' && i.ne ? i.ne : i.name)}</b>${optText(i) ? `<div class="opt">${esc(optText(i))}</div>` : ''}</div></div>`).join('')}
        <div class="row" style="margin-top:8px"><b class="grow">${rs(r.total)}</b>
          <button class="btn small danger" data-rej="${r.id}">✕ ${t('reject')}</button>
          <button class="btn small ok" data-acc="${r.id}">✔ ${t('accept')}</button></div>
      </div>`).join('')}</div>` : ''}
    ${cards.trim() ? `<div class="k-grid">${cards}</div>` : `<div class="card muted">${t('noActive')}</div>`}`;
  $$('[data-acc]', el).forEach(b => b.onclick = () => Requests.accept(b.dataset.acc));
  $$('[data-rej]', el).forEach(b => b.onclick = () => Requests.reject(b.dataset.rej));
  $$('[data-f]', el).forEach(b => b.onclick = () => { kitchenFilter = b.dataset.f; renderKitchen(); });
  $$('.k-line [data-o]', el).forEach(b => b.onclick = () => orderAction(b.dataset.t, b.dataset.o, 'status'));
}

// ---------- reports ----------
function renderReports() {
  const el = $('#view-reports');
  const s = Excel.daySummary(reportDay);
  const maxAmt = Math.max(1, ...s.items.map(i => i.amount));
  const openTotal = Store.tableList().reduce((a, tb) => a + tableTotal(tb), 0);
  el.innerHTML = `
    <div class="section-head">
      <h2>${t('reports')}</h2>
      <div class="row">
        <input type="date" class="input" id="rDay" value="${reportDay}" max="${dayKey()}" style="width:auto;margin:0">
        <button class="btn primary" id="rXls">⬇ ${t('downloadExcel')}</button>
      </div>
    </div>
    <div class="stats">
      <div class="stat"><div class="k">${t('sales')}</div><div class="v">${rs(s.total)}</div></div>
      <div class="stat"><div class="k">💵 ${t('cashTotal')}</div><div class="v" style="color:var(--ok)">${rs(s.cash)}</div></div>
      <div class="stat"><div class="k">📱 ${t('onlineTotal')}</div><div class="v" style="color:var(--info)">${rs(s.online)}</div></div>
      <div class="stat"><div class="k">${t('billsCount')}</div><div class="v">${num(s.bills.length)}</div></div>
      ${reportDay === dayKey() ? `<div class="stat"><div class="k">${t('busy')} (${t('tables')})</div><div class="v" style="color:var(--warn)">${rs(openTotal)}</div></div>` : ''}
    </div>
    <div class="card">
      <h3>${t('paymentSplit')}</h3>
      <div class="bars">
        <div class="bar-row"><span>💵 ${t('cash')}</span><div class="track"><div class="fill alt" style="width:${s.total ? s.cash / s.total * 100 : 0}%"></div></div><b>${rs(s.cash)}</b></div>
        <div class="bar-row"><span>📱 ${t('online')}</span><div class="track"><div class="fill" style="width:${s.total ? s.online / s.total * 100 : 0}%;background:var(--info)"></div></div><b>${rs(s.online)}</b></div>
        ${Object.entries(s.wallets).map(([w, v]) => `<div class="bar-row muted"><span>&nbsp;&nbsp;${esc(w)}</span><div class="track"><div class="fill" style="width:${v / s.total * 100}%;background:var(--info);opacity:.6"></div></div><span>${rs(v)}</span></div>`).join('')}
      </div>
    </div>
    <div class="card">
      <h3>${t('itemSales')}</h3>
      ${s.items.length ? `<div class="bars">${s.items.map(i => {
        const m = Store.menu.find(x => x.en === i.name);
        return `<div class="bar-row"><span>${esc(m ? itemName(m) : i.name)} ×${num(i.qty)}</span><div class="track"><div class="fill" style="width:${i.amount / maxAmt * 100}%"></div></div><b>${rs(i.amount)}</b></div>`;
      }).join('')}</div>` : `<p class="muted">${t('noBills')}</p>`}
    </div>
    <div class="card scroll-x">
      <h3>${t('billList')}</h3>
      ${s.bills.length ? `<table class="list">
        <tr><th>${t('billNo')}</th><th>${t('time')}</th><th>${t('table')}</th><th>${t('itemsCol')}</th><th>${t('amount')}</th><th>${t('method')}</th><th></th></tr>
        ${s.bills.slice().reverse().map(b => `<tr>
          <td>${esc(b.no)}</td><td>${hhmm(b.at)}</td><td>${esc(b.tableName)}${b.focal ? '<br><small class="muted">' + esc(b.focal) + '</small>' : ''}</td>
          <td>${b.lines.map(l => esc(l.name) + ' ×' + l.qty).join(', ')}</td>
          <td><b>${rs(b.total)}</b></td>
          <td>${b.method === 'cash' ? '💵 ' + t('cash') : '📱 ' + esc(b.wallet || t('online'))}</td>
          <td><button class="btn small" data-print="${b.id}">🖨</button></td></tr>`).join('')}
      </table>` : `<p class="muted">${t('noBills')}</p>`}
    </div>
    ${s.cancels.length ? `<div class="card scroll-x">
      <h3>${t('cancelled')}</h3>
      <table class="list"><tr><th>${t('time')}</th><th>${t('table')}</th><th>${t('itemsCol')}</th><th>${t('amount')}</th><th>${t('reason')}</th></tr>
      ${s.cancels.slice().reverse().map(c => `<tr><td>${hhmm(c.at)}</td><td>${esc(c.tableName)}</td><td>${esc(c.name)} ×${c.qty}</td><td>${rs(c.amount)}</td><td>${esc(c.reason)}</td></tr>`).join('')}
      </table></div>` : ''}`;
  $('#rDay').onchange = e => { reportDay = e.target.value || dayKey(); renderReports(); };
  $('#rXls').onclick = () => { if (Excel.download(reportDay)) toast(t('excelDone')); };
  $$('[data-print]', el).forEach(b => b.onclick = () => printBill(s.bills.find(x => x.id === b.dataset.print)));
}

// ---------- settings ----------
function renderSettings() {
  const el = $('#view-settings');
  const S = Store.settings;
  el.innerHTML = `
    <div class="card">
      <h3>${t('general')}</h3>
      <label class="field">${t('waiterName')}<input id="sWaiter" value="${esc(LOCAL.waiter)}"></label>
      <div class="row" style="margin-bottom:10px">
        <span class="muted grow">${t('language')}</span>
        <div class="seg"><button data-l="en" class="${LOCAL.lang === 'en' ? 'on' : ''}">English</button><button data-l="ne" class="${LOCAL.lang === 'ne' ? 'on' : ''}">नेपाली</button></div>
      </div>
      <div class="row">
        <span class="muted grow">${t('theme')}</span>
        <div class="seg"><button data-th="light" class="${LOCAL.theme === 'light' ? 'on' : ''}">☀ ${t('light')}</button><button data-th="dark" class="${LOCAL.theme === 'dark' ? 'on' : ''}">☾ ${t('dark')}</button></div>
      </div>
    </div>

    <div class="card">
      <h3>${t('menuPrices')}</h3>
      <div class="menu-edit" id="menuEdit">
        ${S.menu.map((m, i) => `
          <div class="me-row" data-i="${i}">
            <div class="row" style="margin-bottom:6px">
              <input class="input" data-k="emoji" value="${esc(m.emoji || '')}" style="max-width:56px;flex:none;text-align:center">
              <input class="input" data-k="en" value="${esc(m.en)}" placeholder="${esc(t('itemName'))}">
              <input class="input" data-k="ne" value="${esc(m.ne)}" placeholder="${esc(t('itemNameNe'))}">
            </div>
            <div class="row">
              <span class="muted">Rs.</span><input class="input price" data-k="price" type="number" min="0" inputmode="numeric" value="${m.price}">
              <select class="input" data-k="cat" style="width:auto;flex:none">${['tea', 'snack', 'food'].map(c => `<option value="${c}" ${m.cat === c ? 'selected' : ''}>${t('cat_' + c)}</option>`).join('')}</select>
              <label class="opt-box" style="min-height:44px"><input type="checkbox" data-k="sugar" ${m.sugar ? 'checked' : ''}>${t('hasSugar')}</label>
              <button class="btn small danger" data-del="${i}">${t('del')}</button>
            </div>
            <label class="field" style="margin:6px 0 0">${t('addonList')}<input data-k="addons" value="${esc(m.addons || '')}" placeholder="Marich/मरिच, Black salt/कालो नुन"></label>
          </div>`).join('')}
      </div>
      <div class="row" style="margin-top:10px">
        <button class="btn" id="sAddItem">+ ${t('newItem')}</button>
        <span class="grow"></span>
        <button class="btn primary" id="sSaveMenu">${t('save')}</button>
      </div>
    </div>

    <div class="card">
      <h3>${t('tableSetup')}</h3>
      <div class="row">
        <label class="field grow">${t('tableCount')}<input id="sTables" type="number" min="1" max="40" value="${S.tableCount}"></label>
        <label class="field grow">${t('defaultChairs')}<input id="sChairs" type="number" min="1" max="16" value="${S.defaultChairs}"></label>
      </div>
      <div class="row"><span class="grow"></span><button class="btn primary" id="sSaveTables">${t('save')}</button></div>
    </div>

    <div class="card">
      <h3>📱 ${t('qrMenu')}</h3>
      <div id="qrPanel"></div>
    </div>

    <div class="card">
      <h3>🔔 ${t('alerts')}</h3>
      <div class="opts">
        <label class="opt-box ${LOCAL.alertSound !== false ? 'on' : ''}"><input type="checkbox" id="sSound" ${LOCAL.alertSound !== false ? 'checked' : ''}>🔊 ${t('soundOn')}</label>
        <label class="opt-box ${LOCAL.alertVibrate !== false ? 'on' : ''}"><input type="checkbox" id="sVib" ${LOCAL.alertVibrate !== false ? 'checked' : ''}>📳 ${t('vibrateOn')}</label>
      </div>
      <div class="row">
        <button class="btn" id="sNotif">${'Notification' in window && Notification.permission === 'granted' ? '✓ ' + t('notifOn') : '🔔 ' + t('enableNotif')}</button>
        <button class="btn" id="sTestAlert">▶ ${t('testAlert')}</button>
      </div>
    </div>

    <div class="card">
      <h3>📊 Excel</h3>
      <label class="opt-box ${LOCAL.autoExcel ? 'on' : ''}" style="margin-bottom:10px"><input type="checkbox" id="sAuto" ${LOCAL.autoExcel ? 'checked' : ''}>${t('autoExcel')}</label>
      <label class="field">${t('closingTime')}<input id="sClose" type="time" value="${LOCAL.closingTime}"></label>
      <p class="muted" style="font-size:.8rem;margin:0">${t('autoExcelHelp')}</p>
    </div>

    <div class="card">
      <h3>🌐 ${t('sync')}</h3>
      <p class="muted" style="font-size:.8rem;margin-top:0">${t('syncHelp')}</p>
      <label class="field">Firebase config<textarea id="sFb" rows="5" placeholder='{ "apiKey": "...", "authDomain": "...", "projectId": "...", "appId": "..." }'>${esc(LOCAL.fbConfig)}</textarea></label>
      <label class="field">${t('shopCode')}<input id="sCode" value="${esc(LOCAL.shopCode)}"></label>
      <div class="row"><span class="grow muted" id="sSyncState"></span>
        ${LOCAL.fbConfig ? `<button class="btn danger" id="sDisc">${t('disconnect')}</button>` : ''}
        <button class="btn primary" id="sConn">${t('connect')}</button></div>
    </div>

    <div class="card">
      <h3>💾 ${t('backup')}</h3>
      <div class="row">
        <button class="btn" id="sExport">⬇ ${t('exportData')}</button>
        <label class="btn" style="display:inline-flex;align-items:center">⬆ ${t('importData')}<input type="file" id="sImport" accept="application/json" hidden></label>
        <span class="grow"></span>
        <button class="btn danger" id="sReset">${t('resetDay')}</button>
      </div>
    </div>
    <p class="muted" style="text-align:center;font-size:.75rem">${esc(t('shopName'))} · v1.0</p>`;

  $('#sWaiter').onchange = e => { LOCAL.waiter = e.target.value.trim(); saveLocal(); toast(t('saved')); };
  $$('[data-l]', el).forEach(b => b.onclick = () => { LOCAL.lang = b.dataset.l; saveLocal(); applyLang(); renderAll(); });
  $$('[data-th]', el).forEach(b => b.onclick = () => { LOCAL.theme = b.dataset.th; saveLocal(); applyTheme(); renderSettings(); });

  const readMenu = () => $$('#menuEdit .me-row').map(r => {
    const old = S.menu[+r.dataset.i] || {};
    const v = k => $(`[data-k="${k}"]`, r);
    return Object.assign({}, old, {
      emoji: v('emoji').value.trim(), en: v('en').value.trim() || 'Item', ne: v('ne').value.trim(),
      price: Math.max(0, +v('price').value || 0), cat: v('cat').value, sugar: v('sugar').checked, addons: v('addons').value.trim(),
    });
  });
  $('#sSaveMenu').onclick = () => { const menu = readMenu(); Store.setSettings(s => { s.menu = menu; }); toast(t('saved')); };
  $('#sAddItem').onclick = () => {
    const menu = readMenu();
    menu.push({ id: 'i' + uid(), en: '', ne: '', price: 0, cat: 'snack', emoji: '🍽', sugar: false, addons: '' });
    Store.state.settings.menu = menu; renderSettings();
    $$('#menuEdit .me-row').pop().querySelector('[data-k="en"]').focus();
  };
  $$('[data-del]', el).forEach(b => b.onclick = () => {
    const menu = readMenu(); menu.splice(+b.dataset.del, 1);
    Store.setSettings(s => { s.menu = menu; }); toast(t('saved'));
  });
  $('#sSaveTables').onclick = () => {
    const n = Math.min(40, Math.max(1, +$('#sTables').value || 1));
    const c = Math.min(16, Math.max(1, +$('#sChairs').value || 1));
    Store.setSettings(s => {
      const oldDefault = s.defaultChairs;
      s.tableCount = n; s.defaultChairs = c;
      // empty tables still on the old default pick up the new chair count
      Object.values(Store.state.tables).forEach(tb => { if (!tb.orders.length && tb.chairs === oldDefault) tb.chairs = c; });
    });
    toast(t('saved'));
  };
  renderQRPanel($('#qrPanel'));
  $('#sSound').onchange = e => { LOCAL.alertSound = e.target.checked; saveLocal(); e.target.parentElement.classList.toggle('on', e.target.checked); };
  $('#sVib').onchange = e => { LOCAL.alertVibrate = e.target.checked; saveLocal(); e.target.parentElement.classList.toggle('on', e.target.checked); };
  $('#sNotif').onclick = async () => { await Alerts.askPermission(); renderSettings(); };
  $('#sTestAlert').onclick = () => {
    Alerts.fire('🔔 ' + t('newCustomerOrder'), t('testAlert'), 'test');
    Alerts.notify('🔔 ' + t('newCustomerOrder'), t('testAlert'), 'test');
  };
  $('#sAuto').onchange = e => { LOCAL.autoExcel = e.target.checked; saveLocal(); e.target.parentElement.classList.toggle('on', e.target.checked); };
  $('#sClose').onchange = e => { LOCAL.closingTime = e.target.value || '21:00'; saveLocal(); toast(t('saved')); };
  $('#sConn').onclick = () => {
    const txt = $('#sFb').value.trim() || BUILTIN_FIREBASE;
    try { Sync.parseConfig(txt); } catch { return toast(t('invalidJson')); }
    LOCAL.fbConfig = txt; LOCAL.syncOff = false; LOCAL.shopCode = ($('#sCode').value.trim() || 'genj').toLowerCase(); saveLocal();
    Sync.start(); renderSettings(); toast(t('connecting'));
  };
  if ($('#sDisc')) $('#sDisc').onclick = () => { LOCAL.fbConfig = ''; LOCAL.syncOff = true; saveLocal(); Sync.stop(); Sync.db = null; Sync.setStatus('local'); renderSettings(); };
  $('#sSyncState').textContent = $('#syncText').textContent;
  $('#sExport').onclick = () => {
    FileOut.saveText(`genj-backup-${dayKey()}.json`, JSON.stringify(Store.state, null, 1), 'application/json');
  };
  $('#sImport').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data.settings || !data.tables) throw 0;
      Store.state = Object.assign(DEFAULT_DATA(), data);
      Store.ensureTables(); Store.persist(); Store.emit();
      Sync.pushSettings(Store.settings); Store.tableList().forEach(tb => Sync.pushTable(tb));
      Store.state.bills.forEach(b => Sync.pushRecord('bills', b));
      toast(t('saved'));
    } catch { toast(t('invalidJson')); }
  };
  $('#sReset').onclick = () => confirmBox(t('confirmReset'), false, () => {
    Store.tableList().forEach(tb => { if (tb.orders.length || tb.focal) Store.updateTable(tb.id, x => { x.orders = []; x.focal = ''; x.openedAt = 0; }); });
  });
}

// ---------- customer QR menu ----------
function qrImg(text, cell = 4) {
  const qr = qrcode(0, 'M');
  qr.addData(text); qr.make();
  return qr.createDataURL(cell, 2);
}
function renderQRPanel(box) {
  const url = ShareLink.build();
  box.innerHTML = `
    <p class="muted" style="font-size:.85rem;margin-top:0">${t('qrHelp')}</p>
    ${LOCAL.fbConfig ? '' : `<p style="font-size:.85rem;margin-top:0;color:var(--warn)">⚠ ${t('qrNoSync')}</p>`}
    <div class="qr-box">
      <div class="qr"><img src="${qrImg(url)}" alt="QR"></div>
      <div class="grow" style="min-width:160px">
        <b>${t('qrGeneral')}</b>
        <div class="row" style="margin-top:8px">
          <button class="btn small" id="qrCopy">📋 ${t('copyLink')}</button>
          <a class="btn small" href="${esc(url)}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit">↗ ${t('openLink')}</a>
        </div>
        <button class="btn primary" id="qrPrint" style="margin-top:8px;width:100%">🖨 ${t('printQR')}</button>
      </div>
    </div>`;
  $('#qrCopy', box).onclick = async () => {
    try { await navigator.clipboard.writeText(url); toast(t('copied')); }
    catch { prompt(t('copyLink'), url); }
  };
  $('#qrPrint', box).onclick = printQRCards;
}
function openQR() {
  $('#modalCard').innerHTML = `<h3 style="margin-top:0">📱 ${t('qrMenu')}</h3><div id="qrModal"></div>
    <div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn" id="qrClose">${t('close')}</button></div>`;
  renderQRPanel($('#qrModal'));
  $('#qrClose').onclick = closeModal;
  openModal();
}
function printQRCards() {
  const cards = Store.tableList().map(tb => `
    <div class="qr-card">
      <h4>${esc(I18N.en.shopName)}</h4>
      <div class="tno">${esc(I18N.en.table)} ${esc(tb.name)} · ${esc(I18N.ne.table)} ${esc(tb.name)}</div>
      <img src="${qrImg(ShareLink.build(tb.id.slice(1)), 5)}" alt="QR">
      <p><b>${esc(I18N.en.scanToOrder)}</b><br>${esc(I18N.ne.scanToOrder)}</p>
    </div>`).join('');
  $('#printArea').innerHTML = `<div class="qr-sheet">${cards}</div>`;
  window.print();
}

// ---------- install (Android "Add to Home screen") ----------
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('#installBtn').classList.remove('hidden'); });
$('#installBtn').onclick = async () => {
  if (!installEvt) return;
  installEvt.prompt(); await installEvt.userChoice; installEvt = null;
  $('#installBtn').classList.add('hidden');
};
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e));
}

// ---------- clock & timers ----------
function tick() {
  $('#clock').textContent = ' · ' + num(hhmm(Date.now()));
  if (currentView === 'kitchen' && $('#modal').classList.contains('hidden')) renderKitchen();
}
setInterval(tick, 30000);
setInterval(() => Excel.autoCheck(), 60000);

// ---------- start ----------
Store.onChange(() => renderAll());
applyTheme();
applyLang();
renderAll();
tick();
Sync.start();
setTimeout(() => Excel.autoCheck(), 3000);
