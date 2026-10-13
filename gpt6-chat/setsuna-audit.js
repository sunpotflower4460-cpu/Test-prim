"use strict";
// SETSUNA standalone dependency-free regression test.
// node gpt6-chat/setsuna-audit.js
function runSetsunaAudit(source, gameHtml, shelfHtml) {
  const result=[],check=(name,fn)=>{
    try{const info=fn();result.push({name,pass:info!==false,detail:info===true?null:info});}
    catch(e){result.push({name,pass:false,error:String(e.stack||e).slice(0,550)});}
  };
  const noop=()=>{},gradient={addColorStop:noop};
  function setup(seed=37,savedData=null) {
    const els={},events={},storage={value:savedData};let callback=null,millis=0;
    function el(id="") {
      return {id,style:{},innerHTML:"",textContent:"",children:[],handlers:{},dataset:{},
        classList:{list:new Set(),add(x){this.list.add(x)},remove(x){this.list.delete(x)},
          contains(x){return this.list.has(x)},toggle(x,on){if(on===undefined?!this.list.has(x):on)this.list.add(x);else this.list.delete(x)}},
        addEventListener(k,f){(this.handlers[k]??=[]).push(f)},
        appendChild(c){this.children.push(c)},setAttribute(){},setPointerCapture(){},
        getBoundingClientRect(){return {left:0,top:0,width:480,height:720,right:480,bottom:720}},
        closest(){return null},click(){for(const f of this.handlers.click||[])f({target:this,currentTarget:this,detail:0})}
      };
    }
    const $=id=>els[id]||(els[id]=el(id));
    const context=new Proxy({createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},
      {get(t,k){return k in t?t[k]:noop},set(t,k,v){t[k]=v;return true}});
    $("arena").getContext=()=>context;
    const win={devicePixelRatio:2,matchMedia:()=>({matches:false}),addEventListener(k,f){(events[k]??=[]).push(f)}};
    const doc={getElementById:$,createElement:()=>el(),addEventListener:noop,hidden:false};
    const store={getItem(){return storage.value},setItem(k,v){storage.value=v}};
    let randomState=seed>>>0;const randomMath=Object.create(Math);
    randomMath.random=()=>{randomState=(1664525*randomState+1013904223)>>>0;return randomState/4294967296};
    const injected=source.replace(/home\(\);requestAnimationFrame\(frame\);\s*\}\)\(\);\s*$/,
      "home();window.__qa={get:()=>({player,scene,gate,enemies,shots,kills,chain,bestChain,waveIndex,selectedRelics,saved,parries}),startRun,spawn,slash,parry,perfect,dash,special,update,hurtEnemy,takeHit,chooseRelic,pause,resume,help,retry};requestAnimationFrame(frame);})();");
    if(injected===source)throw Error("test instrumentation anchor disappeared");
    new Function("window","document","localStorage","requestAnimationFrame","Math",injected)(
      win,doc,store,cb=>callback=cb,randomMath);
    return {$,events,qa:win.__qa,storage,
      step(n=1){for(let i=0;i<n;i++){millis+=16.667;callback(millis)}},
      key(k,pressed){for(const f of events[pressed?"keydown":"keyup"]||[])f({
        key:k,repeat:false,target:{tagName:"DIV",closest:()=>null},preventDefault:noop
      })}};
  }
  check("SETSUNA syntax",()=>{new Function(source);return true});
  check("All four action buttons and canvas present",()=>["arena","attack","parry","dash","skill","pad","dialog"].every(id=>gameHtml.includes('id="'+id+'"')));
  check("Only one SETSUNA card is in the GPT6 shelf",()=>shelfHtml.split('href="setsuna.html"').length===2);
  check("Game starts with two readable enemies",()=>{
    const m=setup();m.qa.startRun();const s=m.qa.get();
    return s.scene==="playing"&&s.gate===0&&s.waveIndex===0&&s.enemies.length===2;
  });
  check("Ordinary sword strikes damage a nearby enemy",()=>{
    const m=setup(16);m.qa.startRun();const p=m.qa.get().player;
    const e=m.qa.get().enemies[0];e.enter=0;e.x=p.x+52;e.y=p.y;e.hp=300;
    const hp=e.hp;m.qa.slash();return e.hp<hp&&p.slashTime>0;
  });
  check("Parry makes a counter window and fills resonance",()=>{
    const m=setup();m.qa.startRun();const p=m.qa.get().player,e=m.qa.get().enemies[0];
    if(!m.qa.parry())return false;
    const a=p.energy;m.qa.perfect(e);return e.stun>0&&p.energy>a&&m.qa.get().parries===1;
  });
  check("Dodging prevents collision damage",()=>{
    const m=setup();m.qa.startRun();const p=m.qa.get().player;
    const hp=p.hp;m.qa.dash();m.qa.takeHit(99,null);return p.hp===hp&&p.dashCd>0;
  });
  check("Parry can block a fast hostile projectile",()=>{
    const m=setup();m.qa.startRun();const p=m.qa.get().player,e=m.qa.get().enemies[0];
    m.qa.get().shots.push({x:p.x-16,y:p.y,vx:1800,vy:0,r:6,life:1,dmg:20,source:e.id});
    p.invuln=0;m.qa.parry();m.qa.update(.028);
    return m.qa.get().parries===1&&p.hp===p.maxHp;
  });
  check("Finisher really spends the full meter",()=>{
    const m=setup();m.qa.startRun();const p=m.qa.get().player;
    p.energy=100;const did=m.qa.special();return did&&p.energy===0;
  });
  check("Two waves per gate and all six gates reach victory",()=>{
    const m=setup(),q=m.qa;q.startRun();
    for(let stage=0;stage<6;stage++){
      for(let wave=0;wave<2;wave++){
        const state=q.get();if(state.scene!=="playing"||state.waveIndex!==wave)return false;
        for(const e of state.enemies.slice())q.hurtEnemy(e,99999,0,0);
        q.update(.016);
        const next=q.get().scene;
        if(wave===0){if(next!=="playing"||q.get().waveIndex!==1)return false;}
        else if(stage!==5){
          if(next!=="relic"||q.get().selectedRelics.length!==3)return false;
          q.chooseRelic(0);
        }else if(next!=="won")return false;
      }
    }
    return q.get().saved.wins===1&&q.get().saved.best===6;
  });
  check("Last-guardian second phase calls reinforcements",()=>{
    const m=setup(),q=m.qa;q.startRun();
    for(let stage=0;stage<6;stage++){
      for(let wave=0;wave<(stage===5?1:2);wave++){
        for(const e of q.get().enemies.slice())q.hurtEnemy(e,99999,0,0);
        q.update(.016);
      }
      if(stage<5)q.chooseRelic(0);
    }
    const boss=q.get().enemies.find(e=>e.type==="boss");
    if(!boss)return false;
    boss.hp=boss.maxHp*.5;q.update(.016);
    return q.get().enemies.some(e=>e.type==="archer")&&q.get().enemies.some(e=>e.type==="shade");
  });
  check("Defeat and same-gate retry",()=>{
    const m=setup(),q=m.qa;q.startRun();const p=q.get().player;
    p.hp=1;p.invuln=0;q.takeHit(35);
    if(q.get().scene!=="over")return false;q.retry();
    return q.get().scene==="playing"&&q.get().gate===0&&p.hp>=80;
  });
  check("Pause and context-sensitive help can resume",()=>{
    const m=setup(),q=m.qa;q.startRun();q.help();
    if(q.get().scene!=="paused"||!m.$("dialog").innerHTML.includes('data-action="resume"'))return false;
    q.resume();q.pause();q.resume();return q.get().scene==="playing";
  });
  check("Invalid save JSON does not prevent play",()=>{
    const m=setup(12,"{BROKEN"),q=m.qa;q.startRun();
    return q.get().scene==="playing"&&q.get().saved.best===0;
  });
  check("Pointer joystick resets after release",()=>{
    const m=setup(),q=m.qa;q.startRun(),pad=m.$("pad");
    pad.handlers.pointerdown[0]({pointerId:7,clientX:87,clientY:630,preventDefault:noop});
    pad.handlers.pointermove[0]({pointerId:7,clientX:125,clientY:630,preventDefault:noop});
    m.step(3);const start=q.get().player.x;
    pad.handlers.pointerup[0]({pointerId:7});
    m.step(3);
    return q.get().player.x>start;
  });
  check("Continuous timing-controlled play can finish",()=>{
    const m=setup(3),q=m.qa;q.startRun();
    for(let i=0;i<11000;i++){
      const g=q.get();
      if(g.scene==="relic"){q.chooseRelic(0);continue;}
      if(g.scene==="won")return true;
      if(g.scene==="over")return false;
      const p=g.player,closest=g.enemies.filter(e=>!e.dead&&e.enter<=0)
        .sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
      for(const k of ["a","d","w","s"])m.key(k,false);
      if(closest){
        const dx=closest.x-p.x,dy=closest.y-p.y,d=Math.hypot(dx,dy);
        if(d>57){
          if(dx/d>.38)m.key("d",true);if(dx/d<-.38)m.key("a",true);
          if(dy/d>.38)m.key("s",true);if(dy/d<-.38)m.key("w",true);
        }else q.slash();
        if(g.enemies.some(e=>!e.dead&&e.windup>.01&&e.windup<.19&&
          Math.hypot(e.x-p.x,e.y-p.y)<e.range+30))q.parry();
        if(p.energy>=100)q.special();
      }
      m.step();
    }
    return false;
  });
  return result;
}
if(typeof module!=="undefined"&&typeof require==="function"){
  module.exports={runSetsunaAudit};
  if(require.main===module){
    const fs=require("node:fs"),path=require("node:path"),dir=__dirname;
    const read=n=>fs.readFileSync(path.join(dir,n),"utf8");
    const outcomes=runSetsunaAudit(read("setsuna.js"),read("setsuna.html"),read("index.html"));
    for(const r of outcomes)console.log((r.pass?"PASS":"FAIL")+"  "+r.name+(r.error?"\n    "+r.error:""));
    console.log("\n"+outcomes.filter(r=>r.pass).length+" / "+outcomes.length+" checks passed");
    if(outcomes.some(r=>!r.pass))process.exitCode=1;
  }
}
