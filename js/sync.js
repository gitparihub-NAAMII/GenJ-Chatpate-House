// Optional live sync between several phones using Firebase Firestore.
// Without a Firebase config the app runs fully on this device (offline).
const FB_VER = '10.12.2';
const clean = o => JSON.parse(JSON.stringify(o));

const Sync = {
  db: null, root: null, unsubs: [], status: 'local', fromCache: true,

  configured() { return !!(LOCAL.fbConfig && LOCAL.shopCode); },

  parseConfig(text) {
    // accepts pure JSON or the JS snippet `const firebaseConfig = {...};`
    const m = String(text).match(/\{[\s\S]*\}/);
    if (!m) throw new Error('no object');
    let body = m[0];
    try { return JSON.parse(body); } catch { }
    body = body.replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":').replace(/'/g, '"').replace(/,\s*}/g, '}');
    const cfg = JSON.parse(body);
    if (!cfg.apiKey || !cfg.projectId) throw new Error('missing keys');
    return cfg;
  },

  loadScript(src) {
    return new Promise((res, rej) => {
      if (document.querySelector(`script[src="${src}"]`)) return res();
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  },

  async start() {
    this.stop();
    if (!this.configured()) { this.setStatus('local'); return; }
    this.setStatus('wait');
    try {
      await this.loadScript(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-app-compat.js`);
      await this.loadScript(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-firestore-compat.js`);
      const cfg = this.parseConfig(LOCAL.fbConfig);
      const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(cfg);
      this.db = app.firestore();
      try { await this.db.enablePersistence({ synchronizeTabs: true }); } catch (e) { /* already enabled or unsupported */ }
      this.root = this.db.collection('shops').doc(LOCAL.shopCode.trim().toLowerCase());
      this.listen();
    } catch (e) {
      console.warn('Sync failed to start', e);
      this.db = null;
      this.setStatus(navigator.onLine ? 'local' : 'off');
    }
  },

  stop() {
    this.unsubs.forEach(u => u()); this.unsubs = [];
    this.root = null;
  },

  listen() {
    const r = this.root;
    const meta = snap => { this.fromCache = snap.metadata.fromCache; this.setStatus(); };
    let firstTables = true;

    this.unsubs.push(r.collection('meta').doc('settings').onSnapshot({ includeMetadataChanges: true }, snap => {
      meta(snap);
      if (snap.exists) Store.applyRemoteSettings(snap.data());
      else this.pushSettings(Store.settings);
    }));

    this.unsubs.push(r.collection('tables').onSnapshot({ includeMetadataChanges: true }, snap => {
      meta(snap);
      const seen = new Set();
      snap.forEach(d => { seen.add(d.id); Store.applyRemoteTable(d.data()); });
      if (firstTables) {
        firstTables = false;
        // upload anything this device has that is newer or missing online
        Store.tableList().forEach(tb => {
          const remote = snap.docs.find(d => d.id === tb.id);
          if (!remote || (remote.data().updatedAt || 0) < (tb.updatedAt || 0)) this.pushTable(tb);
        });
      }
    }));

    const since = dayKey(Date.now() - 45 * 864e5);
    ['bills', 'cancels'].forEach(kind => {
      let first = true;
      this.unsubs.push(r.collection(kind).where('date', '>=', since).onSnapshot(snap => {
        const ids = new Set();
        snap.forEach(d => { ids.add(d.id); Store.applyRemoteRecord(kind, d.data()); });
        if (first) {
          first = false;
          Store.state[kind].filter(x => x.date >= since && !ids.has(x.id)).forEach(x => this.pushRecord(kind, x));
        }
      }, e => console.warn(kind, e)));
    });
  },

  pushTable(tb) { if (this.root) this.root.collection('tables').doc(tb.id).set(clean(tb)).catch(e => console.warn(e)); },
  pushSettings(s) { if (this.root) this.root.collection('meta').doc('settings').set(clean(s)).catch(e => console.warn(e)); },
  pushRecord(kind, rec) { if (this.root) this.root.collection(kind).doc(rec.id).set(clean(rec)).catch(e => console.warn(e)); },

  setStatus(s) {
    if (s) this.status = s;
    else if (this.root) this.status = !navigator.onLine ? 'off' : (this.fromCache ? 'wait' : 'on');
    const dot = document.getElementById('syncDot'), txt = document.getElementById('syncText');
    if (!dot) return;
    let st = this.status;
    if (st === 'local' && !navigator.onLine) st = 'local-off';
    dot.className = 'dot ' + ({ on: 'on', off: 'off', wait: 'wait', local: '', 'local-off': 'off' }[st]);
    txt.textContent = ({ on: t('syncing'), off: t('offline'), wait: t('connecting'), local: t('localOnly'), 'local-off': t('localOnly') + ' · ' + t('offline') })[st];
  },
};

window.addEventListener('online', () => Sync.setStatus());
window.addEventListener('offline', () => Sync.setStatus());
