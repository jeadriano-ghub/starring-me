
  // ---------- app updates (only inside the Android app: window.Capacitor native + StarringUpdate plugin) ----------
  (function () {
    var N = null;
    try { var C = window.Capacitor; if (C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.StarringUpdate) N = C.Plugins.StarringUpdate; } catch (e) {}
    if (!N) return;                                   // normal browser: card stays hidden, nothing is called
    var card = $('upd'), ov = $('updov');
    var up = { ver: '', nv: '', newer: false, busy: false, mode: 'idle', cur: false, rec: 0, tot: 0, err: '' };
    var timer = null;
    var MONTHS_TL = ['Ene', 'Peb', 'Mar', 'Abr', 'May', 'Hun', 'Hul', 'Ago', 'Set', 'Okt', 'Nob', 'Dis'];
    var MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var SVG_DL = '<svg width="48" height="48" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m-5-5 5 5 5-5M5 20h14" fill="none" stroke="#7B4BB3" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var SVG_OK = '<svg width="48" height="48" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 10 17.5 19 7" fill="none" stroke="#1F6B2E" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var SVG_OFF = '<svg width="48" height="48" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9a14 14 0 0 1 18 0M6 12.5a9.5 9.5 0 0 1 12 0M9.2 16a5 5 0 0 1 5.6 0M12 19.5h.01M4 4l16 16" fill="none" stroke="#B03A1C" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    function getChecked() { try { return parseInt(localStorage.getItem('kp_upd_checked'), 10) || 0; } catch (e) { return 0; } }
    function setChecked() { try { localStorage.setItem('kp_upd_checked', String(Date.now())); } catch (e) {} }
    function fmtTime(d) {
      var h = d.getHours(), m = ('0' + d.getMinutes()).slice(-2), h12 = h % 12 || 12;
      if (lang === 'en') return h12 + ':' + m + ' ' + (h < 12 ? 'AM' : 'PM');
      return h12 + ':' + m + ' ' + (h < 12 ? 'ng umaga' : h === 12 ? 'ng tanghali' : h < 18 ? 'ng hapon' : 'ng gabi');
    }
    function checkedText() {
      var t = getChecked(); if (!t) return U('upd.checked.never');
      var d = new Date(t), n = new Date();
      if (d.toDateString() === n.toDateString()) return U('upd.checked.today', { t: fmtTime(d) });
      return U('upd.checked.date', { d: (lang === 'en' ? MONTHS_EN : MONTHS_TL)[d.getMonth()] + ' ' + d.getDate() });
    }
    function mb(n) { return (n / 1048576).toFixed(1); }
    function render() {
      if (!up.ver) { card.hidden = true; return; }
      card.hidden = false;
      var hl = up.newer && !up.busy;
      card.classList.toggle('hl', hl);
      $('upd-title').textContent = U(up.busy ? 'upd.title.chk' : hl ? 'upd.title.new' : up.cur ? 'upd.title.cur' : 'upd.title');
      $('upd-sub').textContent = (hl ? U('upd.sub.new', { v: up.ver, nv: up.nv }) : U('upd.ver', { v: up.ver })) + ' · ' + checkedText();
      $('upd-btnl').textContent = U('upd.btn');
      $('upd-btn').disabled = up.busy;
      renderOv();
    }
    function renderOv() {
      if (up.mode === 'idle') { ov.hidden = true; ov.innerHTML = ''; return; }
      var h = '';
      if (up.mode === 'dl') {
        var pct = up.tot > 0 ? Math.min(99, Math.floor(up.rec * 100 / up.tot)) : 0;
        var line = up.tot > 0 ? U('upd.dl.prog', { p: pct, a: mb(up.rec), b: mb(up.tot) }) : U('upd.dl.mb', { a: mb(up.rec) });
        h = '<div class="in"><div class="ic" aria-hidden="true">' + SVG_DL + '</div><h1>' + esc(U('upd.dl.title')) + '</h1>' +
          '<div><div class="bar2" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div><div class="pct" id="upd-pct">' + esc(line) + '</div></div>' +
          '<p>' + esc(U('upd.dl.note')) + '</p><button type="button" class="b2" id="upd-cancel">' + esc(U('upd.cancel')) + '</button></div>';
      } else if (up.mode === 'done') {
        h = '<div class="in"><div class="ic ok" aria-hidden="true">' + SVG_OK + '</div><h1>' + esc(U('upd.done.title', { v: up.nv })) + '</h1><p>' + esc(U('upd.done.note')) +
          '</p><button type="button" class="b1" id="upd-apply">' + esc(U('upd.done.btn')) + '</button></div>';
      } else {
        var off = up.mode === 'off';
        h = '<div class="in"><div class="ic bad" aria-hidden="true">' + SVG_OFF + '</div><h1>' + esc(U(off ? 'upd.off.title' : 'upd.err.title')) + '</h1><p>' + esc(U(off ? 'upd.off.note' : 'upd.err.note', { v: up.ver })) +
          '</p><button type="button" class="b1" id="upd-retry">' + esc(U('upd.retry')) + '</button><button type="button" class="b2 full" id="upd-back">' + esc(U('upd.back')) + '</button></div>';
      }
      ov.hidden = false; ov.innerHTML = h;
    }
    window.__kpUpdRender = function () { if (up.ver) render(); };
    function stopPoll() { if (timer) { clearInterval(timer); timer = null; } }
    function fail(code) { stopPoll(); up.busy = false; up.mode = (code === 'offline') ? 'off' : 'err'; up.err = code || ''; render(); }
    function withTimeout(p, ms) { return new Promise(function (res, rej) { var t = setTimeout(function () { rej({ code: 'offline' }); }, ms); p.then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); }); }); }
    function startDownload() {
      up.busy = false; up.mode = 'dl'; up.rec = 0; up.tot = 0; render();
      N.start().then(function () {
        stopPoll();
        timer = setInterval(function () {
          N.status().then(function (s) {
            if (up.mode !== 'dl') return;
            if (s.state === 'downloading') { up.rec = s.received || 0; up.tot = s.total || 0; render(); }
            else if (s.state === 'done') { stopPoll(); setChecked(); up.nv = s.version || up.nv; up.newer = false; up.mode = 'done'; render(); }
            else if (s.state === 'cancelled') { stopPoll(); up.mode = 'idle'; render(); }
            else if (s.state === 'error') fail(s.error);
          }, function () { fail('error'); });
        }, 250);
      }, function (e) { fail(e && e.code); });
    }
    function press() {                                // the only place a download can start
      if (up.busy) return;
      if (up.newer) { startDownload(); return; }
      up.busy = true; up.cur = false; render();
      withTimeout(N.check(), 7000).then(function (r) {
        setChecked(); up.busy = false;
        if (r.newer) { up.newer = true; up.nv = r.version; startDownload(); } else { up.cur = true; render(); }
      }, function (e) { fail(e && e.code); });
    }
    $('upd-btn').addEventListener('click', press);
    ov.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.id === 'upd-cancel') { N.cancel(); }
      else if (b.id === 'upd-apply') { N.apply().then(function () {}, function (er) { fail(er && er.code); }); }
      else if (b.id === 'upd-retry') { up.mode = 'idle'; render(); press(); }
      else if (b.id === 'upd-back') { up.mode = 'idle'; render(); }
    });
    N.info().then(function (i) {
      up.ver = i.version; render();
      withTimeout(N.check(), 5500).then(function (r) {    // quiet look on launch: no download, no error screen
        setChecked(); up.newer = !!r.newer; up.nv = r.version; up.cur = !r.newer; render();
      }, function () {});
    }, function () {});
  })();
