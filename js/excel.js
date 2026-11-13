// Saving files: browser download, or (inside the Android app) save to Documents + share sheet.
const FileOut = {
  native() { return !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()); },
  async save(name, base64, mime, { share = true } = {}) {
    if (this.native()) {
      const { Filesystem, Share } = Capacitor.Plugins;
      try { await Filesystem.writeFile({ path: 'GenJ-ChatPate/' + name, data: base64, directory: 'DOCUMENTS', recursive: true }); } catch (e) { console.warn(e); }
      if (share) {
        const r = await Filesystem.writeFile({ path: name, data: base64, directory: 'CACHE' });
        await Share.share({ title: name, files: [r.uri] }).catch(() => { });
      }
      return;
    }
    const bin = atob(base64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: mime }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  saveText(name, text, mime) { this.save(name, btoa(unescape(encodeURIComponent(text))), mime); },
};

// Daily Excel report (uses SheetJS, bundled in /vendor so it works offline)
const Excel = {
  daySummary(day) {
    const bills = Store.billsOn(day);
    const cancels = Store.cancelsOn(day);
    const items = {};
    let cash = 0, online = 0, discount = 0;
    bills.forEach(b => {
      if (b.method === 'cash') cash += b.total; else online += b.total;
      discount += b.discount || 0;
      b.lines.forEach(l => {
        const k = l.name;
        items[k] = items[k] || { name: l.name, qty: 0, amount: 0 };
        items[k].qty += l.qty; items[k].amount += l.amount;
      });
    });
    const wallets = {};
    bills.filter(b => b.method !== 'cash').forEach(b => {
      const w = b.wallet || 'Online';
      wallets[w] = (wallets[w] || 0) + b.total;
    });
    return {
      day, bills, cancels, cash, online, discount, wallets,
      total: cash + online,
      items: Object.values(items).sort((a, b) => b.amount - a.amount),
    };
  },

  download(day, auto = false) {
    if (!window.XLSX) { alert('Excel library not loaded'); return false; }
    const s = this.daySummary(day);
    const wb = XLSX.utils.book_new();

    const summary = [
      ['GenJ ChatPate Shop — Daily Report'],
      ['Date', day],
      ['Generated at', new Date().toLocaleString()],
      [],
      ['Total bills', s.bills.length],
      ['Total sales (Rs.)', s.total],
      ['Cash (Rs.)', s.cash],
      ['Online (Rs.)', s.online],
      ...Object.entries(s.wallets).map(([w, v]) => ['   Online — ' + w, v]),
      ['Discount given (Rs.)', s.discount],
      ['Cancelled items', s.cancels.reduce((a, c) => a + c.qty, 0)],
      ['Cancelled value (Rs.)', s.cancels.reduce((a, c) => a + c.amount, 0)],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(summary);
    ws1['!cols'] = [{ wch: 26 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Summary');

    const billRows = [['Bill no.', 'Time', 'Table', 'Focal person', 'Items', 'Subtotal', 'Discount', 'Total', 'Payment', 'Wallet / Bank', 'Cashier']];
    s.bills.forEach(b => billRows.push([
      b.no, hhmm(b.at), b.tableName, b.focal || '',
      b.lines.map(l => `${l.name}${l.opts ? ' (' + l.opts + ')' : ''} x${l.qty}`).join('; '),
      b.subtotal, b.discount || 0, b.total, b.method === 'cash' ? 'Cash' : 'Online', b.wallet || '', b.by || '',
    ]));
    billRows.push([], ['', '', '', '', 'TOTAL', s.bills.reduce((a, b) => a + b.subtotal, 0), s.discount, s.total]);
    const ws2 = XLSX.utils.aoa_to_sheet(billRows);
    ws2['!cols'] = [{ wch: 10 }, { wch: 7 }, { wch: 8 }, { wch: 16 }, { wch: 50 }, { wch: 9 }, { wch: 9 }, { wch: 9 }, { wch: 9 }, { wch: 14 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Bills');

    const lineRows = [['Bill no.', 'Time', 'Table', 'Seat', 'Item', 'Options', 'Qty', 'Rate', 'Amount', 'Payment']];
    s.bills.forEach(b => b.lines.forEach(l => lineRows.push([b.no, hhmm(b.at), b.tableName, l.seat || 'Table', l.name, l.opts || '', l.qty, l.price, l.amount, b.method === 'cash' ? 'Cash' : 'Online'])));
    const ws3 = XLSX.utils.aoa_to_sheet(lineRows);
    ws3['!cols'] = [{ wch: 10 }, { wch: 7 }, { wch: 8 }, { wch: 7 }, { wch: 16 }, { wch: 30 }, { wch: 6 }, { wch: 7 }, { wch: 9 }, { wch: 9 }];
    XLSX.utils.book_append_sheet(wb, ws3, 'Order lines');

    const itemRows = [['Item', 'Quantity sold', 'Amount (Rs.)']];
    s.items.forEach(i => itemRows.push([i.name, i.qty, i.amount]));
    itemRows.push([], ['TOTAL', s.items.reduce((a, i) => a + i.qty, 0), s.items.reduce((a, i) => a + i.amount, 0)]);
    const ws4 = XLSX.utils.aoa_to_sheet(itemRows);
    ws4['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws4, 'Item sales');

    const cRows = [['Time', 'Table', 'Item', 'Options', 'Qty', 'Value (Rs.)', 'Reason', 'By']];
    s.cancels.forEach(c => cRows.push([hhmm(c.at), c.tableName, c.name, c.opts || '', c.qty, c.amount, c.reason || '', c.by || '']));
    const ws5 = XLSX.utils.aoa_to_sheet(cRows);
    ws5['!cols'] = [{ wch: 7 }, { wch: 8 }, { wch: 16 }, { wch: 26 }, { wch: 6 }, { wch: 10 }, { wch: 24 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws5, 'Cancelled');

    const b64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
    FileOut.save(`GenJ-ChatPate-${day}.xlsx`, b64, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', { share: !auto });
    LOCAL.exported[day] = s.bills.length; saveLocal();
    return true;
  },

  // Auto export: at closing time for today, and any missed earlier day with sales.
  autoCheck() {
    if (!LOCAL.autoExcel) return;
    const today = dayKey();
    const days = [...new Set(Store.state.bills.map(b => b.date))].filter(d => d < today && d >= dayKey(Date.now() - 7 * 864e5));
    days.forEach(d => { if ((LOCAL.exported[d] || 0) < Store.billsOn(d).length) { this.download(d, true); toast(t('excelDone') + ' — ' + d); } });
    const [h, m] = (LOCAL.closingTime || '21:00').split(':').map(Number);
    const now = new Date();
    if ((now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m)) && !LOCAL.exported[today] && Store.billsOn(today).length) {
      this.download(today, true); toast(t('excelDone') + ' — ' + today);
    }
  },
};
