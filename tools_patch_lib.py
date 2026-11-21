import json, collections, re
P='app/build_app.py'; s=open(P,encoding='utf-8').read()
NEW=[ # key, tl, en
('upd.title','May bagong kwento ba?','Any new stories?'),
('upd.title.new','May bagong update!','An update is ready!'),
('upd.title.cur','Updated na','You are up to date'),
('upd.title.chk','Tinitingnan…','Checking…'),
('upd.ver','Bersyon {v}','Version {v}'),
('upd.sub.new','Bersyon {v} · may bago: bersyon {nv}','Version {v} · new: version {nv}'),
('upd.checked.never','hindi pa natitingnan','not checked yet'),
('upd.checked.today','tiningnan kanina, {t}','last checked today, {t}'),
('upd.checked.date','tiningnan noong {d}','last checked {d}'),
('upd.btn','Kunin ang update','Get an update'),
('upd.dl.title','Kinukuha ang bagong libro…','Getting the new books…'),
('upd.dl.prog','{p}% · {a} ng {b} MB','{p}% · {a} of {b} MB'),
('upd.dl.mb','{a} MB na ang nakuha','{a} MB downloaded'),
('upd.dl.note','Sandali lang. Hindi mawawala ang kasalukuyan mong kopya kung hindi matuloy.','One moment. Your current copy stays safe if this does not finish.'),
('upd.cancel','Kanselahin','Cancel'),
('upd.done.title','May bago! Bersyon {v} na','New! Version {v} is here'),
('upd.done.note','Handa na ang mga bagong kwento. Nandito pa rin ang pangalan at edad ng bata.','The new stories are ready. Your child\'s name and age are still saved.'),
('upd.done.btn','Basahin na','Start reading'),
('upd.off.title','Walang internet ngayon','No internet right now'),
('upd.off.note','Ayos lang. Gagamitin ng app ang kopya mo (bersyon {v}), kaya mababasa pa rin ang lahat ng libro.','That is okay. The app keeps your copy (version {v}), so every book still opens.'),
('upd.retry','Subukan ulit','Try again'),
('upd.back','Bumalik sa aklatan','Back to the library'),
('upd.err.title','Hindi natuloy ang update','The update did not finish'),
('upd.err.note','Walang nagbago sa kopya mo (bersyon {v}). Subukan ulit mamaya.','Nothing changed on your copy (version {v}). Please try again later.'),
]
# 1) ui strings in build_app.py (defaults + english) -- appended after read.pg
s=s.replace("    ('read.pg', 'PAGE {n}'),\n])","    ('read.pg', 'PAGE {n}'),\n])",1)
s=s.replace("    ('read.pg', 'PAGHINA {n}'),","",1)
add_def=''.join("    (%r, %r),\n"%(k,tl) for k,tl,en in NEW)
assert "    ('read.pg', 'PAHINA {n}'),\n])" in s
s=s.replace("    ('read.pg', 'PAHINA {n}'),\n])","    ('read.pg', 'PAHINA {n}'),\n"+add_def+"])",1)
add_en=''.join("    %r: %r,\n"%(k,en) for k,tl,en in NEW)
assert "    'read.pg': 'PAGE {n}',\n}" in s
s=s.replace("    'read.pg': 'PAGE {n}',\n}","    'read.pg': 'PAGE {n}',\n"+add_en+"}",1)
# 2) ui.json
J=json.load(open('i18n/ui.json',encoding='utf-8'),object_pairs_hook=collections.OrderedDict)
for k,tl,en in NEW: J[k]=collections.OrderedDict([('tl',tl),('en',en)])
J['_meta']['strings']=len([k for k in J if k!='_meta'])
open('i18n/ui.json','w',encoding='utf-8').write(json.dumps(J,ensure_ascii=False,indent=1)+'\n')
# 3) CSS
CSS_NEW='''
/* update card + full-screen update states (only shown inside the Android app) */
.upd { display: flex; align-items: center; gap: 14px; background: var(--btn-soft); border: 3px solid transparent; border-radius: 18px; padding: 14px 16px; margin: 0 0 40px; }
.upd[hidden], .updov[hidden] { display: none; }
.upd.hl { border-color: var(--accent); box-shadow: 0 6px 18px var(--shadow); }
.upd-t { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.upd-t strong { font-weight: 800; font-size: 17px; }
.upd-t span { font-size: 14px; line-height: 1.35; color: var(--ink-soft); }
.upd-btn { flex: none; display: inline-flex; align-items: center; gap: 8px; min-height: 48px; padding: 10px 18px; border: 0; border-radius: 14px; background: var(--btn); color: var(--btn-ink); font-family: inherit; font-weight: 800; font-size: 16px; }
.upd-btn:disabled { opacity: .6; }
.upd-btn svg, .updov .ic svg { flex: none; }
.updov { position: fixed; inset: 0; z-index: 50; overflow-y: auto; background: var(--paper); color: var(--ink); display: flex; }
.updov .in { margin: auto; width: 100%; max-width: 440px; box-sizing: border-box; padding: 32px 28px; display: flex; flex-direction: column; gap: 20px; text-align: center; align-items: stretch; }
.updov .ic { align-self: center; width: 96px; height: 96px; border-radius: 50%; background: var(--btn-soft); display: grid; place-items: center; }
.updov .ic.ok { background: #E3F4E1; } .updov .ic.bad { background: #FFE3D6; }
.updov h1 { margin: 0; font-family: var(--font-display); font-weight: 600; font-size: 28px; line-height: 1.15; text-wrap: balance; }
.updov p { margin: 0; font-size: 16px; line-height: 1.5; color: var(--ink-soft); }
.updov .bar2 { height: 16px; border-radius: 999px; background: var(--line); overflow: hidden; }
.updov .bar2 i { display: block; height: 100%; border-radius: 999px; background: var(--btn); width: 0; transition: width .2s; }
.updov .pct { font-size: 15px; color: var(--ink-soft); margin-top: 10px; }
.updov .b1 { min-height: 52px; padding: 12px 24px; border: 0; border-radius: 16px; background: var(--btn); color: var(--btn-ink); font-family: inherit; font-weight: 800; font-size: 18px; }
.updov .b2 { min-height: 48px; padding: 10px 24px; border: 2px solid var(--btn); border-radius: 16px; background: transparent; color: var(--btn); font-family: inherit; font-weight: 800; font-size: 16px; align-self: center; }
.updov .b2.full { align-self: stretch; }
@media (min-width: 700px) { .upd { max-width: 720px; } .updov h1 { font-size: 34px; } }
@media (max-width: 420px) { .upd { flex-wrap: wrap; } .upd-btn { width: 100%; justify-content: center; } }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .updov .ic.ok { background: #2F5A33; } :root:not([data-theme="light"]) .updov .ic.bad { background: #5A2F2F; } }
:root[data-theme="dark"] .updov .ic.ok { background: #2F5A33; } :root[data-theme="dark"] .updov .ic.bad { background: #5A2F2F; }
'''
anchor="@media (max-width: 900px) {\n  .hero {"
assert s.count(anchor)==1
s=s.replace(anchor,CSS_NEW.lstrip('\n')+anchor,1)
# 4) HTML card (between hero and shelf) and overlay
card='''<section class="upd" id="upd" hidden aria-live="polite"><div class="upd-t"><strong id="upd-title"></strong><span id="upd-sub"></span></div><button type="button" class="upd-btn" id="upd-btn"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m-5-5 5 5 5-5M5 20h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg><span id="upd-btnl"></span></button></section>
'''
a2="</section>\n<section class=\"shelf\" id=\"shelf\">"
assert s.count(a2)==1
s=s.replace(a2,"</section>\n"+card+"<section class=\"shelf\" id=\"shelf\">",1)
a3="<div id=\"view-read\" hidden translate=\"no\">"
assert s.count(a3)==1
s=s.replace(a3,'<div class="updov" id="updov" hidden role="dialog" aria-modal="true" translate="no"></div>\n\n'+a3,1)
# 5) JS
JS_NEW=open('starring-me/tools_upd.js',encoding='utf-8').read()
a4="  syncForm(); applyUI(); renderLib(); route();\n})();"
assert s.count(a4)==1
s=s.replace(a4,"  syncForm(); applyUI(); renderLib(); route();\n"+JS_NEW+"\n})();",1)
s=s.replace("    var ps = $('prev').firstElementChild; if (ps) ps.setAttribute('aria-label', U('form.prev.alt'));\n  }","    var ps = $('prev').firstElementChild; if (ps) ps.setAttribute('aria-label', U('form.prev.alt'));\n    if (window.__kpUpdRender) window.__kpUpdRender();\n  }",1)
open(P,'w',encoding='utf-8').write(s)
print('patched')
