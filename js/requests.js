// Customer orders sent from the QR menu: alert waiters (popup + sound + vibration + phone notification)
// and let them accept (items go onto the table) or reject.
const Alerts = {
  ctx: null,
  unlock() {
    // browsers only allow sound after the user has touched the page once
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch { }
  },
  beep() {
    if (LOCAL.alertSound === false) return;
    this.unlock();
    const c = this.ctx; if (!c) return;
    const now = c.currentTime;
    [[880, 0], [1175, .18], [880, .36], [1175, .54]].forEach(([f, at]) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + at);
      g.gain.exponentialRampToValueAtTime(0.35, now + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.16);
      o.connect(g).connect(c.destination);
      o.start(now + at); o.stop(now + at + 0.17);
    });
  },
  vibrate() { if (LOCAL.alertVibrate !== false && navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 400]); },
  async notify(title, body, tag) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const opts = { body, tag, renotify: true, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', vibrate: [400, 150, 400], requireInteraction: true };
    try {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (reg) reg.showNotification(title, opts); else new Notification(title, opts);
    } catch (e) { console.warn(e); }
  },
  async askPermission() {
    if (!('Notification' in window)) return false;
    const p = await Notification.requestPermission();
    return p === 'granted';
  },
  fire(title, body, tag) {
    this.beep(); this.vibrate();
    if (document.hidden) this.notify(title, body, tag);
  },
};
['pointerdown', 'keydown'].forEach(ev => window.addEventListener(ev, () => Alerts.unlock(), { once: true }));

const Requests = {
  pending: {},
  alerted: new Set(),

  list() { return Object.values(this.pending).sort((a, b) => a.at - b.at); },

  summary(r) {
    return r.items.map(i => `${LOCAL.lang === 'ne' && i.ne ? i.ne : i.name} ×${num(i.qty)}`).join(', ');
  },

  incoming(r) {
    if (r.status !== 'pending') { this.removed(r.id); return; }
    this.pending[r.id] = r;
    if (!this.alerted.has(r.id)) {
      this.alerted.add(r.id);
      Alerts.fire(`🔔 ${t('newCustomerOrder')} — ${t('table')} ${r.tableName}`, `${r.focal}: ${this.summary(r)} · ${rs(r.total)}`, r.id);
    }
    this.showPopup(); renderAll();
  },
  removed(id) {
    if (!this.pending[id]) return;
    delete this.pending[id];
    this.showPopup(); renderAll();
  },

  showPopup() {
    const r = this.list()[0];
    const box = $('#reqAlert');
    if (!r) { box.classList.add('hidden'); return; }
    const more = this.list().length - 1;
    $('#reqAlertCard').innerHTML = `
      <h2 style="margin:0 0 4px;color:var(--brand)">🔔 ${t('newCustomerOrder')}</h2>
      <div style="font-size:1.15rem;margin-bottom:8px"><b>${t('table')} ${esc(num(r.tableName))}</b> · 👤 ${esc(r.focal)} <span class="muted" style="font-size:.85rem">· ${hhmm(r.at)}</span></div>
      ${r.items.map(i => `<div class="k-line"><div class="info"><b>${num(i.qty)}× ${esc(LOCAL.lang === 'ne' && i.ne ? i.ne : i.name)}</b>${optText(i) ? `<div class="opt">${esc(optText(i))}</div>` : ''}</div><b>${rs(i.price * i.qty)}</b></div>`).join('')}
      <div class="row" style="justify-content:space-between;margin:10px 0;font-size:1.1rem"><b>${t('total')}</b><b>${rs(r.total)}</b></div>
      ${more > 0 ? `<p class="muted" style="margin:0 0 8px">+${num(more)} ${t('custOrders')}</p>` : ''}
      <div class="row">
        <button class="btn danger grow" data-rej="${r.id}">✕ ${t('reject')}</button>
        <button class="btn ok grow" data-acc="${r.id}">✔ ${t('accept')}</button>
      </div>`;
    $('#reqAlertCard [data-acc]').onclick = () => this.accept(r.id);
    $('#reqAlertCard [data-rej]').onclick = () => this.reject(r.id);
    box.classList.remove('hidden');
    const card = $('#reqAlertCard'); card.classList.remove('req-alert'); void card.offsetWidth; card.classList.add('req-alert');
  },

  // claim the request (so two phones never add it twice), then put the items on the table
  async claim(id, status) {
    if (!Sync.root) return true;
    const ref = Sync.root.collection('requests').doc(id);
    return Sync.db.runTransaction(async tx => {
      const d = await tx.get(ref);
      if (!d.exists || d.data().status !== 'pending') return false;
      tx.update(ref, { status, handledBy: LOCAL.waiter || '', handledAt: Date.now() });
      return true;
    });
  },

  async accept(id) {
    const r = this.pending[id]; if (!r) return;
    let ok;
    try { ok = await this.claim(id, 'accepted'); } catch (e) { console.warn(e); toast(t('sendFailed')); return; }
    delete this.pending[id];
    if (!ok) { toast(t('takenByOther')); this.showPopup(); renderAll(); return; }
    let tid = r.table;
    if (!Store.state.tables[tid]) {
      const found = Store.tableList().find(tb => String(tb.name) === String(r.tableName));
      tid = found ? found.id : Store.tableList()[0].id;
    }
    Store.updateTable(tid, tb => {
      if (!tb.focal) tb.focal = r.focal;
      r.items.forEach(i => {
        const m = Store.menu.find(x => x.id === i.itemId);
        tb.orders.push({
          id: uid(), itemId: i.itemId, name: i.name, ne: i.ne, price: m ? m.price : i.price, qty: i.qty, seat: 0,
          sugar: i.sugar || '', addons: i.addons || [], note: i.note || '', status: 'new', at: Date.now(), by: 'QR · ' + r.focal,
        });
      });
    });
    toast(`${t('orderAdded')} ${r.tableName}`);
    this.showPopup();
  },

  async reject(id) {
    const r = this.pending[id]; if (!r) return;
    try { await this.claim(id, 'rejected'); } catch (e) { console.warn(e); toast(t('sendFailed')); return; }
    delete this.pending[id];
    this.showPopup(); renderAll();
  },
};

// keep reminding (sound + vibration every 20 s) while a customer order waits
setInterval(() => { if (Requests.list().length) { Alerts.beep(); Alerts.vibrate(); } }, 20000);
