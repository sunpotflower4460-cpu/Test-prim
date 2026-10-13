"use strict";
// Self-contained GPT6 CHAT regression suite. No browser, build tool or packages needed.
// Run at repo root: node gpt6-chat/audit-smoke.js
function runAudit(luminaSource,kazaneSource,rootHtml,shelfHtml) {
  const results = [],ok = (label,fn) => {
    try { const detail=fn();results.push({label,pass:detail!==false,detail:detail===true?null:detail}); }
    catch(e){results.push({label,pass:false,error:String(e.stack||e).slice(0,700)});}
  };
  const noop=()=>{},gradient={addColorStop:noop};
  function mock(seed=11,store=null,legacy=false) {
    const elements={},events={},storage={value:store},timers=[];
    let raf=null,stamp=0,rng=seed>>>0;
    function el(id="") {
      return {id,style:{},innerHTML:"",textContent:"",children:[],dataset:{},disabled:false,handlers:{},
        classList:{items:new Set(),add(x){this.items.add(x)},remove(x){this.items.delete(x)},
          contains(x){return this.items.has(x)},toggle(x,on){if(on===undefined?!this.items.has(x):on)this.items.add(x);else this.items.delete(x)}},
        addEventListener(name,fn){(this.handlers[name]??=[]).push(fn)},
        setAttribute(){},setPointerCapture(){},
        getBoundingClientRect(){return{left:0,top:0,right:480,bottom:700,width:480,height:700}},
        closest(){return null},appendChild(child){this.children.push(child)},
        replaceChildren(){this.children=[]},
        querySelector(s){return s===".joystick-base"?(this.base||(this.base=el("base"))):el(s)},
        querySelectorAll(s){return s===".upgrade"?this.children:[]},
        click(){this.handlers.click?.at(-1)?.({target:this,currentTarget:this,detail:0});this.onclick?.()}
      };
    }
    const $=id=>elements[id]||(elements[id]=el(id));
    const context=new Proxy({createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},
      {get(t,k){if(legacy&&k==="roundRect")return undefined;return k in t?t[k]:noop},
       set(t,k,v){t[k]=v;return true}});
    $("world").getContext=()=>context;$("garden").getContext=()=>context;
    const win={innerWidth:390,innerHeight:800,devicePixelRatio:2,location:{href:"/index.html",hash:""},
      matchMedia:()=>({matches:false}),addEventListener(k,fn){(events[k]??=[]).push(fn)}};
    const doc={getElementById:$,createElement:()=>el(),addEventListener(k,fn){(events["document:"+k]??=[]).push(fn)},
      hidden:false,body:{classList:{contains:()=>false}}};
    const localStorage={getItem(){return storage.value},setItem(k,v){storage.value=v}};
    const randomMath=Object.create(Math);
    randomMath.random=()=>{rng=(rng*1664525+1013904223)>>>0;return rng/4294967296};
    const schedule=fn=>{if(fn.name==="frame")raf=fn};
    return {win,doc,$,events,storage,localStorage,randomMath,schedule,
      step(n=1){for(let i=0;i<n;i++){stamp+=16.667;if(!raf)throw Error("missing RAF");raf(stamp)}},
      key(k){for(const fn of events.keydown||[])fn({key:k,repeat:false,defaultPrevented:false,
        target:{tagName:"DIV",closest:()=>null},preventDefault:noop})}
    };
  }
  function lumina(seed=11){
    const m=mock(seed);
    const body=luminaSource.replace(/\}\)\(\);\s*$/,"window.__qa={view:()=>({game,scene,saved}),addExp,update,fire,spawnEnemy,spawnBoss,hurtEnemy,dash,levelUp};})();");
    if(body===luminaSource)throw Error("cannot instrument LUMINA");
    new Function("window","document","navigator","localStorage","location","requestAnimationFrame",
      "setTimeout","clearTimeout","Math",body)(
      m.win,m.doc,{vibrate:noop},m.localStorage,{protocol:"http:"},
      m.schedule,noop,noop,m.randomMath);
    return {...m,qa:m.win.__qa,start(){m.$("startBtn").click()},
      choose(){if(m.win.__qa.view().scene==="upgrade")m.$("upgradeList").children[0]?.click()}};
  }
  function kazane(seed=11,store=null,legacy=false){
    const m=mock(seed,store,legacy);
    const body=kazaneSource.replace(/home\(\);requestAnimationFrame\(frame\);\s*\}\)\(\);\s*$/,
      "home();window.__qa={state,levels,saved,startLevel,update,undo,pause,resume,hint};requestAnimationFrame(frame);})();");
    if(body===kazaneSource)throw Error("cannot instrument KAZANE");
    new Function("window","document","localStorage","requestAnimationFrame",body)(
      m.win,m.doc,m.localStorage,m.schedule);
    return {...m,qa:m.win.__qa};
  }
  ok("JavaScript syntax of both games",()=>{new Function(luminaSource);new Function(kazaneSource);return true});
  ok("GPT6 shelf links both titles",()=>shelfHtml.includes("../index.html#lumina")&&shelfHtml.includes('href="sen.html"'));
  ok("root menu labels GPT6 as two works",()=>rootHtml.includes("LUMINA &amp; KAZANE · 2 WORKS"));
  ok("LUMINA button and Enter open the same shelf",()=>{
    const m=lumina();m.key("Enter");const a=m.win.location.href;
    m.win.location.href="/index.html";m.$("openGameBtn").click();
    return a==="gpt6-chat/index.html"&&m.win.location.href===a;
  });
  ok("LUMINA opening and progress",()=>{
    const m=lumina(41);m.start();const g=m.qa.view().game;
    for(let i=0;i<1200;i++){m.step();m.choose()}
    return g.enemies.length>=0&&g.kills>10&&g.level>1;
  });
  ok("LUMINA queued combo XP obeys luck",()=>{
    const m=lumina(12);m.start();const g=m.qa.view().game;
    g.enemies.length=0;g.player.luck=1.4;
    for(let i=0;i<8;i++){const e=m.qa.spawnEnemy("wisp",g.player.x+40,g.player.y);m.qa.hurtEnemy(e,9999)}
    if(g.comboPending!==5||g.xp!==0)return false;
    m.qa.update(.016);
    return g.comboPending===0&&g.totalXp===7;
  });
  ok("LUMINA guardian reward is not double-multiplied",()=>{
    const m=lumina(16);m.start();const g=m.qa.view().game;
    g.enemies=[];g.player.luck=1.4;m.qa.spawnBoss();
    m.qa.hurtEnemy(g.enemies.find(e=>e.type==="boss"),99999);
    if(m.qa.view().scene!=="chapter"||g.chapterReward!==80)return false;
    const old=g.totalXp;m.$("nextChapter").click();
    return g.totalXp-old===112&&g.stage===1;
  });
  ok("LUMINA projectiles cannot tunnel past a shadow",()=>{
    const m=lumina(22);m.start();const g=m.qa.view().game,p=g.player;
    g.enemies=[];g.shots=[];p.fireCd=999;g.spawnCd=999;
    const e=m.qa.spawnEnemy("wisp",p.x+42,p.y);e.speed=0;e.hp=25;e.maxHp=25;
    g.shots=[{x:p.x,y:p.y,vx:2100,vy:0,r:5,life:1.3,damage:60,pierce:0,hits:new Set(),slow:0}];
    m.qa.update(.03);return e.hp<=0;
  });
  ok("KAZANE invalid saved stage numbers cannot crash loading",()=>{
    const m=kazane(25,'{"unlocked":6.4,"grades":[2.6,7,"x",-2],"clears":3.3}',true);
    m.step();m.qa.startLevel(6);m.step();
    return m.qa.saved.unlocked===6&&m.qa.saved.grades[0]===2&&m.qa.saved.grades[1]===3&&m.qa.state.mode==="playing";
  });
  ok("KAZANE hint resets and undo releases movement",()=>{
    const m=kazane();m.qa.startLevel(0);m.qa.hint();
    if(!m.qa.state.focus)return false;m.qa.startLevel(0);
    if(m.qa.state.focus)return false;
    const state=m.qa.state;state.seed.x=200;state.held.add("d");
    state.history.push({x:100,y:360,vx:0,vy:0,notes:[false],breath:1,strokes:0});
    m.qa.undo();return state.held.size===0&&state.seed.x===100;
  });
  ok("KAZANE canvas input produces physical wind",()=>{
    const m=kazane(15);m.qa.startLevel(0);
    const p=m.qa.state.seed,down={pointerId:5,clientX:103,clientY:368,preventDefault:noop};
    m.$("garden").handlers.pointerdown[0](down);
    m.$("garden").handlers.pointermove[0]({...down,clientX:180});
    m.$("garden").handlers.pointerup[0](down);
    return p.vx>0&&m.qa.state.strokes===1&&m.qa.state.history.length===1;
  });
  ok("KAZANE 12 gardens unlock through the final ending",()=>{
    const m=kazane(31);const q=m.qa;
    for(let i=0;i<12;i++){
      if(i>q.saved.unlocked)return false;
      q.startLevel(i);const level=q.levels[i],state=q.state;
      for(const [x,y] of level.notes){state.seed.x=x;state.seed.y=y;q.update(.016);}
      state.seed.x=level.flower[0];state.seed.y=level.flower[1];q.update(.016);
      if(state.mode!=="cleared"||!q.saved.grades[i])return false;
    }
    return q.saved.clears===1&&q.saved.grades.filter(Boolean).length===12&&m.$("dialog").innerHTML.includes("森が、歌を思い出した");
  });
  return results;
}
if(typeof require==="function" && typeof module!=="undefined" && require.main===module) {
  const fs=require("node:fs"),path=require("node:path");
  const repo=path.resolve(__dirname,"..");
  const read=file=>fs.readFileSync(path.join(repo,file),"utf8");
  const results=runAudit(read("game.js"),read("gpt6-chat/sen.js"),
    read("index.html"),read("gpt6-chat/index.html"));
  for(const r of results)console.log((r.pass?"PASS":"FAIL")+"  "+r.label+(r.error?"\n    "+r.error:""));
  const count=results.filter(r=>r.pass).length;
  console.log("\n"+count+" / "+results.length+" checks passed");
  if(count!==results.length)process.exitCode=1;
}
