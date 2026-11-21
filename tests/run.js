// Browser tests of the library's update card with a mocked Capacitor bridge and a local http server standing in for GitHub Pages.
const {chromium}=require('/Users/pcworth_dev/.hermes/hermes-agent/node_modules/playwright-core');
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=path.resolve(__dirname,'..');
const BUNDLED=fs.readFileSync(path.join(ROOT,'site/index.html'),'utf8');
const MOCK=fs.readFileSync(path.join(__dirname,'mock-capacitor.js'),'utf8');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const newHtml=b=>BUNDLED.replace('<head>','<head><script>window.__B='+b+'</script>');   // marks "this is build b"
const NEW2=newHtml(2);
const SHOTS=path.join(__dirname,'shots');
let S;                                   // server state, reset per scenario
const reset=()=>{S={ver:{version:'1.1.0',build:2,file:'index.html',sha256:sha(NEW2)},html:NEW2,vmode:'ok',imode:'ok',log:[],store:null};};
const srv=http.createServer((q,r)=>{
  const u=q.url.split('?')[0]; S.log.push(u);
  if(u==='/app/index.html'){r.end(BUNDLED);return;}
  if(u==='/pages/version.json'){
    if(S.vmode==='offline'){q.socket.destroy();return;}
    if(S.vmode==='hang'){return;}
    r.setHeader('content-type','application/json');r.end(JSON.stringify(S.ver));return;}
  if(u==='/pages/index.html'){
    if(S.imode==='offline'){q.socket.destroy();return;}
    const b=Buffer.from(S.html);r.writeHead(200,{'content-type':'text/html','content-length':b.length});
    if(S.imode==='slow'){let i=0;const t=setInterval(()=>{if(i>=b.length){clearInterval(t);r.end();return;}r.write(b.subarray(i,i+120000));i+=120000;},160);r.on('close',()=>clearInterval(t));}
    else r.end(b);return;}
  r.statusCode=404;r.end();
});
let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log('ok   '+m);}else{fail++;console.log('FAIL '+m);}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
// stand-in for MainActivity: decide at launch which copy is served (stored if build > bundled and sha matches)
function launchHtml(){
  let a={build:1,version:'1.0.0',source:'bundled'},html=BUNDLED;
  const s=S.store;
  if(s&&s.build>1&&sha(s.html)===s.sha){a={build:s.build,version:s.version,source:'stored'};html=s.html;}
  return html.replace('<head>','<head><script>window.__ACTIVE='+JSON.stringify(a)+';window.__TO='+(S.to||5000)+';</script><script>'+MOCK.replace(/<\/script/g,'<\\/script')+'</script>');
}
async function open(br,o={}){
  const ctx=o.ctx||await br.newContext({viewport:o.vp||{width:390,height:844},deviceScaleFactor:1});
  await ctx.addInitScript(([c,l,f])=>{if(f)return;try{if(!localStorage.getItem('kp_child')){localStorage.setItem('kp_child',JSON.stringify(c));localStorage.setItem('kp_lang',l);}}catch(e){}},[{name:'Miguel',gender:'b',age:8},o.lang||'tl',false]);
  const p=await ctx.newPage();p.on('pageerror',e=>{S.errs=(S.errs||[]).concat(String(e));});
  if(!o.plain){
    await ctx.exposeFunction('__nodeSave',(build,version,h,html)=>{S.store={build,version,sha:h,html};});
    await p.route('**/app/index.html',r=>r.fulfill({status:200,contentType:'text/html',body:launchHtml()}));
  }
  await p.goto('http://127.0.0.1:'+PORT+'/app/index.html');await p.waitForTimeout(o.wait||700);
  return {ctx,p};
}
const txt=(p,sel)=>p.evaluate(s=>{const e=document.querySelector(s);return e&&!e.hidden?e.textContent.trim():null;},sel);
const vis=(p,sel)=>p.evaluate(s=>{const e=document.querySelector(s);return !!e&&!e.hidden&&getComputedStyle(e).display!=='none';},sel);
let PORT;
(async()=>{
  await new Promise(r=>srv.listen(0,'127.0.0.1',r));PORT=srv.address().port;
  const br=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  let ctx,p;

  console.log('# 1 normal browser: card hidden, nothing fetched');
  reset();({ctx,p}=await open(br,{plain:true}));
  ok(!(await vis(p,'#upd')),'update card hidden outside the app');ok(!S.log.some(u=>u.startsWith('/pages/')),'no update request from a plain browser');
  ok(await p.evaluate(()=>!document.getElementById('updov').innerHTML),'no overlay');await ctx.close();

  console.log('# 2 no update available');
  reset();S.ver={version:'1.0.0',build:1,file:'index.html',sha256:sha(BUNDLED)};({ctx,p}=await open(br));
  ok(await vis(p,'#upd'),'card visible in the app');ok((await txt(p,'#upd-title'))==='Updated na','shows "Updated na" when nothing newer');
  ok((await txt(p,'#upd-sub')).startsWith('Bersyon 1.0.0 · tiningnan kanina,'),'shows version and last checked: '+await txt(p,'#upd-sub'));
  ok((await txt(p,'#upd-btnl'))==='Kunin ang update','button reads "Kunin ang update"');
  await p.click('#upd-btn');await p.waitForTimeout(600);
  ok((await txt(p,'#upd-title'))==='Updated na'&&!(await vis(p,'#updov')),'pressing the button: still Updated na, no download screen');
  ok(!S.log.includes('/pages/index.html'),'index.html never downloaded when nothing newer');await ctx.close();

  console.log('# 3 newer build: highlight on launch, download only on press, apply keeps the child profile');
  reset();S.imode='slow';({ctx,p}=await open(br));
  ok(await p.evaluate(()=>document.getElementById('upd').classList.contains('hl')),'card highlighted when a newer build exists');
  ok((await txt(p,'#upd-title'))==='May bagong update!','highlight title');ok(!S.log.includes('/pages/index.html'),'silent check downloads nothing');
  await p.click('#upd-btn');await p.waitForTimeout(700);
  ok(await vis(p,'#updov')&&(await txt(p,'#updov h1'))==='Kinukuha ang bagong libro…','downloading screen shown');
  ok(/%/.test(await txt(p,'#upd-pct')),'progress text: '+await txt(p,'#upd-pct'));
  ok(await vis(p,'#upd-cancel'),'Cancel button present');
  await p.waitForSelector('#upd-apply',{timeout:15000});
  ok((await txt(p,'#updov h1'))==='May bago! Bersyon 1.1.0 na','done screen: '+await txt(p,'#updov h1'));
  ok(S.store&&S.store.build===2,'new copy saved');
  const before=await p.evaluate(()=>[localStorage.getItem('kp_child'),localStorage.getItem('kp_lang')]);
  await p.click('#upd-apply');await p.waitForFunction(()=>window.__B===2,null,{timeout:8000});await p.waitForTimeout(500);
  const after=await p.evaluate(()=>[localStorage.getItem('kp_child'),localStorage.getItem('kp_lang'),window.__B,document.getElementById('nm').value]);
  ok(after[2]===2,'new library is running after Basahin na');ok(after[0]===before[0]&&after[1]===before[1]&&before[0].includes('Miguel'),'kp_child and kp_lang unchanged');ok(after[3]==='Miguel','child name still in the form');
  ok((await txt(p,'#upd-sub')).startsWith('Bersyon 1.1.0'),'card now shows 1.1.0: '+await txt(p,'#upd-sub'));ok((await txt(p,'#upd-title'))==='Updated na','and says Updated na');
  await ctx.close();

  console.log('# 3b English');
  reset();({ctx,p}=await open(br,{lang:'en'}));
  ok((await txt(p,'#upd-btnl'))==='Get an update'&&(await txt(p,'#upd-title'))==='An update is ready!','English strings: '+await txt(p,'#upd-btnl'));
  await p.click('.langsw button[data-lang="tl"]');ok((await txt(p,'#upd-btnl'))==='Kunin ang update','switching language re-renders the card');await ctx.close();

  console.log('# 4 hash mismatch rejected');
  reset();S.html=newHtml(2).replace('<head>','<head><!--tampered-->');({ctx,p}=await open(br));   // sha in version.json no longer matches
  await p.click('#upd-btn');await p.waitForSelector('#upd-retry',{timeout:10000});
  ok((await txt(p,'#updov h1'))==='Hindi natuloy ang update','error screen shown for a bad hash');ok(S.store===null,'nothing saved');
  await p.click('#upd-back');ok(!(await vis(p,'#updov')),'Bumalik sa aklatan closes the screen');
  await p.reload();await p.waitForTimeout(500);ok(await p.evaluate(()=>window.__B===undefined),'still the bundled library after reload');await ctx.close();

  console.log('# 5 offline / timeout');
  reset();S.vmode='offline';({ctx,p}=await open(br));
  ok(await vis(p,'#upd')&&!(await vis(p,'#updov')),'launch while offline: card visible, no error screen (silent)');ok((await txt(p,'#upd-title'))==='May bagong kwento ba?','card stays idle');
  await p.click('#upd-btn');await p.waitForSelector('#upd-retry',{timeout:8000});
  ok((await txt(p,'#updov h1'))==='Walang internet ngayon','offline screen: '+await txt(p,'#updov p'));ok((await txt(p,'#updov p')).includes('bersyon 1.0.0'),'offline text names the current version');
  S.vmode='ok';S.imode='ok';await p.click('#upd-retry');await p.waitForSelector('#upd-apply',{timeout:10000});ok(true,'Subukan ulit works once the connection is back');await ctx.close();
  reset();S.vmode='hang';S.to=700;({ctx,p}=await open(br,{wait:1500}));
  ok(await vis(p,'#upd')&&!(await vis(p,'#updov')),'hung server on launch: silent, no error screen, app usable');
  const t0=Date.now();await p.click('#upd-btn');await p.waitForSelector('#upd-retry',{timeout:8000});ok(Date.now()-t0<3000,'hung server on press: offline screen after timeout ('+(Date.now()-t0)+' ms)');await ctx.close();
  reset();S.imode='offline';({ctx,p}=await open(br));await p.click('#upd-btn');await p.waitForSelector('#upd-retry',{timeout:8000});
  ok((await txt(p,'#updov h1'))==='Walang internet ngayon'&&S.store===null,'connection lost mid-download: offline screen, nothing saved');await ctx.close();

  console.log('# 6 cancel mid-download');
  reset();S.imode='slow';({ctx,p}=await open(br));await p.click('#upd-btn');await p.waitForSelector('#upd-cancel');await p.waitForTimeout(600);
  await p.click('#upd-cancel');await p.waitForFunction(()=>document.getElementById('updov').hidden,null,{timeout:5000});
  ok(S.store===null,'cancel: nothing saved');await p.waitForTimeout(500);ok(await p.evaluate(()=>document.getElementById('upd').classList.contains('hl')),'card back to "update ready"');
  S.imode='ok';await p.click('#upd-btn');await p.waitForSelector('#upd-apply',{timeout:10000});ok(S.store&&S.store.build===2,'pressing again completes the update');await ctx.close();

  console.log('# 7 corrupt / stale stored copy falls back to bundled');
  reset();S.store={build:2,version:'1.1.0',sha:sha(NEW2),html:NEW2+'<!--bitrot-->'};({ctx,p}=await open(br));
  ok(await p.evaluate(()=>window.__B===undefined&&window.__ACTIVE.source==='bundled'),'corrupt stored file: bundled library loaded, no error');ok((await txt(p,'#upd-sub')).startsWith('Bersyon 1.0.0'),'shows bundled version');await ctx.close();
  reset();S.store={build:2,version:'1.1.0',sha:sha(NEW2),html:NEW2};({ctx,p}=await open(br));
  ok(await p.evaluate(()=>window.__B===2&&window.__ACTIVE.source==='stored'),'valid stored copy (build 2 > 1) is used at launch');await ctx.close();
  reset();S.store={build:1,version:'1.0.0',sha:sha(NEW2),html:NEW2};({ctx,p}=await open(br));
  ok(await p.evaluate(()=>window.__B===undefined),'stored copy not newer than bundled is ignored');await ctx.close();

  console.log('# 8 layout check and screenshots');
  const sizes=[[390,844],[844,390],[768,1024],[1024,768],[1024,1366],[1366,1024]];
  for(const [w,h] of sizes){
    for(const lang of ['tl','en']){
      reset();S.imode='slow';({ctx,p}=await open(br,{vp:{width:w,height:h},lang}));
      const tag=`${w}x${h}_${lang}`;
      const card=await p.$('#upd');await card.scrollIntoViewIfNeeded();
      const m=await p.evaluate(()=>{const c=document.getElementById('upd').getBoundingClientRect(),b=document.getElementById('upd-btn').getBoundingClientRect();return {over:document.documentElement.scrollWidth>document.documentElement.clientWidth,cw:c.width,bh:b.height,bw:b.width,inView:c.left>=0&&c.right<=innerWidth};});
      ok(!m.over&&m.inView&&m.bh>=44,`card fits at ${tag} (btn ${Math.round(m.bw)}x${Math.round(m.bh)}, card ${Math.round(m.cw)})`);
      if(lang==='tl'||w===390){await p.screenshot({path:`${SHOTS}/${tag}_hl.png`});}
      await p.click('#upd-btn');await p.waitForSelector('#upd-cancel');await p.waitForTimeout(500);
      const ovOver=await p.evaluate(()=>{const e=document.querySelector('#updov .in');return e.scrollWidth>e.clientWidth||document.documentElement.scrollWidth>document.documentElement.clientWidth;});ok(!ovOver,`downloading screen fits at ${tag}`);
      if(lang==='tl')await p.screenshot({path:`${SHOTS}/${tag}_dl.png`});
      await p.waitForSelector('#upd-apply',{timeout:15000});if(lang==='tl')await p.screenshot({path:`${SHOTS}/${tag}_done.png`});
      await ctx.close();
      reset();S.vmode='offline';({ctx,p}=await open(br,{vp:{width:w,height:h},lang}));await p.click('#upd-btn');await p.waitForSelector('#upd-retry',{timeout:8000});
      if(lang==='tl')await p.screenshot({path:`${SHOTS}/${tag}_off.png`});
      const offOver=await p.evaluate(()=>{const e=document.querySelector('#updov .in');return e.scrollWidth>e.clientWidth;});ok(!offOver,`offline screen fits at ${tag}`);
      await ctx.close();
    }
  }
  reset();({ctx,p}=await open(br));S.ver={...S.ver,build:1,version:'1.0.0',sha256:sha(BUNDLED)};await ctx.close();
  console.log(`\npass ${pass} fail ${fail}; page errors: ${(S.errs||[]).length}`);
  await br.close();srv.close();process.exit(fail?1:0);
})().catch(e=>{console.log('CRASH',e);process.exit(2)});
