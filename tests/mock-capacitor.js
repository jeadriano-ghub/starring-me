// Injected before the page runs: stands in for the Capacitor bridge + the StarringUpdate native plugin.
// Same rules as UpdateStore.java (which has its own host test): BASE-only fetches, 5s timeout, manifest validation,
// sha256 check before saving, build must be newer, never touch the good copy on failure.
(function () {
  var BASE = location.origin + '/pages/', TO = window.__TO || 5000;
  var A = window.__ACTIVE || { build: 1, version: '1.0.0', source: 'bundled' };
  var st = { state: 'idle', received: 0, total: 0, error: '' }, cancel = false, ready = null;
  function err(code) { return { code: code, message: code }; }
  function fetchT(name, ms, signal) {
    var c = new AbortController(); var t = setTimeout(function () { c.abort(); }, ms);
    if (signal) signal.addEventListener('abort', function () { c.abort(); });
    return fetch(BASE + name + '?t=' + Date.now(), { signal: c.signal, cache: 'no-store' }).then(function (r) { clearTimeout(t); return r; }, function () { clearTimeout(t); throw err('offline'); });
  }
  function parse(txt) {
    var m; try { m = JSON.parse(txt); } catch (e) { throw err('bad_data'); }
    if (typeof m.version !== 'string' || !m.version || !(m.build >= 1) || m.file !== 'index.html' || !/^[0-9a-f]{64}$/.test(m.sha256 || '')) throw err('bad_data');
    return m;
  }
  function check() {
    return fetchT('version.json', TO).then(function (r) { if (!r.ok) throw err(r.status >= 500 || r.status === 404 ? 'offline' : 'bad_data'); return r.text(); })
      .then(function (t) { var m = parse(t); return { version: m.version, build: m.build, sha256: m.sha256 }; });
  }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  async function run() {
    var m = await check(); if (m.build <= A.build) throw err('not_newer');
    var r = await fetchT('index.html', TO); if (!r.ok) throw err('offline');
    var total = parseInt(r.headers.get('content-length') || '0', 10); st.total = total;
    var rd = r.body.getReader(), parts = [], got = 0;
    for (;;) {
      var x; try { x = await rd.read(); } catch (e) { throw err('offline'); }
      if (cancel) { try { rd.cancel(); } catch (e) {} throw err('cancelled'); }
      if (x.done) break; parts.push(x.value); got += x.value.length; st.received = got;
    }
    var all = new Uint8Array(got), o = 0; parts.forEach(function (p) { all.set(p, o); o += p.length; });
    if (!got) throw err('bad_data');
    var h = hex(await crypto.subtle.digest('SHA-256', all));
    if (h !== m.sha256) throw err('hash_mismatch');
    await window.__nodeSave(m.build, m.version, h, new TextDecoder().decode(all));
    ready = m;
  }
  var P = {
    info: function () { return Promise.resolve({ version: A.version, build: A.build, source: A.source, bundledBuild: 1 }); },
    check: function () { return check().then(function (m) { return { version: m.version, build: m.build, newer: m.build > A.build }; }); },
    start: function () {
      cancel = false; ready = null; st = { state: 'downloading', received: 0, total: 0, error: '' };
      run().then(function () { st.state = 'done'; }, function (e) { st.error = e.code || 'storage'; st.state = st.error === 'cancelled' ? 'cancelled' : 'error'; });
      return Promise.resolve();
    },
    status: function () { var o = { state: st.state, received: st.received, total: st.total, error: st.error }; if (st.state === 'done' && ready) { o.version = ready.version; o.build = ready.build; } return Promise.resolve(o); },
    cancel: function () { cancel = true; return Promise.resolve(); },
    apply: function () { setTimeout(function () { location.reload(); }, 0); return Promise.resolve(); }
  };
  window.Capacitor = { isNativePlatform: function () { return true; }, getPlatform: function () { return 'android'; }, Plugins: { StarringUpdate: P } };
})();
