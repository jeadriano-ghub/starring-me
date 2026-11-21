// Renders branding/*.svg into the Android launcher PNGs. Run: node branding/render_icons.js
const {chromium}=require('/Users/pcworth_dev/.hermes/hermes-agent/node_modules/playwright-core');
const fs=require('fs'),path=require('path');
const RES=path.join(__dirname,'../app/android/app/src/main/res');
const full=fs.readFileSync(path.join(__dirname,'icon-full.svg'),'utf8');
const fg=fs.readFileSync(path.join(__dirname,'icon-foreground.svg'),'utf8');
const D={mdpi:1,hdpi:1.5,xhdpi:2,xxhdpi:3,xxxhdpi:4};
(async()=>{
 const br=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const p=await br.newPage();
 async function shot(svg,px,radius,out){
  await p.setViewportSize({width:px,height:px});
  await p.setContent(`<body style="margin:0;background:transparent"><div style="width:${px}px;height:${px}px;border-radius:${radius};overflow:hidden">${svg.replace('<svg ','<svg width="'+px+'" height="'+px+'" ')}</div></body>`);
  await p.waitForTimeout(150);
  await p.screenshot({path:out,omitBackground:true,clip:{x:0,y:0,width:px,height:px}});
 }
 for(const [d,m] of Object.entries(D)){
  const dir=path.join(RES,'mipmap-'+d);
  await shot(fg,Math.round(108*m),'0',path.join(dir,'ic_launcher_foreground.png'));
  await shot(full,Math.round(48*m),'22%',path.join(dir,'ic_launcher.png'));
  await shot(full,Math.round(48*m),'50%',path.join(dir,'ic_launcher_round.png'));
 }
 await shot(full,512,'22%',path.join(__dirname,'icon-512.png'));
 await br.close();
})();
