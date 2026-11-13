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
    if (!this.alerted.has(r.id) && !r.local) {
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
    const r = this.pending[id];
    if (r && r.local) {
      // scanned from a customer's QR: remember it so the same QR can't be added twice
      LOCAL.scanned = [...(LOCAL.scanned || []), id].slice(-200); saveLocal();
      return true;
    }
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

// keep reminding (sound + vibration every 20 s) while a customer order (from the internet) waits
setInterval(() => { if (Requests.list().some(r => !r.local)) { Alerts.beep(); Alerts.vibrate(); } }, 20000);

// Camera scanner for the order QR on a customer's phone (works with no internet on either phone)
const Scanner = {
  stream: null, timer: 0, detector: null, canvas: null, lastMsg: 0,

  async open() {
    $('#modalCard').innerHTML = `
      <h3 style="margin-top:0">▦ ${t('scanOrder')}</h3>
      <p class="muted" style="margin-top:0;font-size:.85rem">${t('scanHelp')}</p>
      <div class="scan-box"><video id="scanVideo" playsinline muted></video><div class="scan-frame"></div></div>
      <p id="scanMsg" class="muted" style="min-height:1.2em;text-align:center"></p>
      <div class="row" style="justify-content:flex-end"><button class="btn" id="scanClose">${t('close')}</button></div>`;
    $('#scanClose').onclick = closeModal;
    openModal();
    const msg = s => { const el = $('#scanMsg'); if (el) el.textContent = s; };
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { msg(t('noCamera')); return; }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    } catch (e) { console.warn(e); msg(t('noCamera')); return; }
    const v = $('#scanVideo');
    if (!v) { this.stop(); return; }   // closed while asking for permission
    v.srcObject = this.stream;
    try { await v.play(); } catch { }
    try {
      if ('BarcodeDetector' in window && (await BarcodeDetector.getSupportedFormats()).includes('qr_code')) this.detector = new BarcodeDetector({ formats: ['qr_code'] });
    } catch { this.detector = null; }
    this.canvas = this.canvas || document.createElement('canvas');
    this.tick();
  },

  async tick() {
    if (!this.stream) return;
    const v = $('#scanVideo');
    let text = null;
    if (v && v.readyState >= 2 && v.videoWidth) {
      try {
        if (this.detector) {
          const codes = await this.detector.detect(v);
          if (codes.length) text = codes[0].rawValue;
        } else if (window.jsQR) {
          const scale = Math.min(1, 640 / v.videoWidth);
          const w = Math.round(v.videoWidth * scale), h = Math.round(v.videoHeight * scale);
          this.canvas.width = w; this.canvas.height = h;
          const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(v, 0, 0, w, h);
          const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
          if (code) text = code.data;
        }
      } catch (e) { console.warn(e); }
    }
    if (text && this.handle(text)) return;
    this.timer = setTimeout(() => this.tick(), 150);
  },

  // returns true when a valid order was found (stops scanning)
  handle(text) {
    const r = OrderQR.decode(text, Store.menu);
    if (!r) {
      if (Date.now() - this.lastMsg > 1500) { this.lastMsg = Date.now(); const el = $('#scanMsg'); if (el) el.textContent = t('notOrderQR'); }
      return false;
    }
    closeModal();
    if (navigator.vibrate) navigator.vibrate(120);
    if ((LOCAL.scanned || []).includes(r.id) || Requests.pending[r.id]) { toast(t('alreadyAdded')); return true; }
    Requests.incoming(r);   // shows the same Accept / Reject popup as an online order
    return true;
  },

  stop() {
    clearTimeout(this.timer);
    if (this.stream) this.stream.getTracks().forEach(tr => tr.stop());
    this.stream = null;
  },
};
