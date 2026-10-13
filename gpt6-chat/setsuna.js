"use strict";
(() => {
  const $=id=>document.getElementById(id), canvas=$("arena"),ctx=canvas.getContext("2d",{alpha:false});
  const W=480,H=720,TAU=Math.PI*2,SAVE="setsuna-blade-v1";
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const lerp=(a,b,v)=>a+(b-a)*v;
  const random=(a,b)=>a+Math.random()*(b-a);
  const length=(x,y)=>Math.hypot(x,y);
  const distance=(a,b)=>length(a.x-b.x,a.y-b.y);
  const angleTo=(a,b)=>Math.atan2(b.y-a.y,b.x-a.x);
  const difference=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
  const colors=[
    {name:"霞の門",story:"まだ名もない、最初の刃。",bg:["#172f42","#425a62"],floor:"#243c46",light:"#e9d2a2",enemy:"#e9a29d"},
    {name:"月の回廊",story:"月の刃は、静けさの奥で待つ。",bg:["#131d3b","#364566"],floor:"#242e4c",light:"#b9ceef",enemy:"#eab4d0"},
    {name:"焔の橋",story:"燃える影の先に、自分の呼吸を聴く。",bg:["#302339","#654850"],floor:"#46313e",light:"#f5c3a1",enemy:"#ffac92"},
    {name:"氷紋の庭",story:"冷たさは、決して弱さではない。",bg:["#102d3f","#2b6574"],floor:"#214956",light:"#c2f2ee",enemy:"#e6bee2"},
    {name:"残照の階",story:"夕陽が消える前に、決着を。",bg:["#3e293d","#74565b"],floor:"#4f3946",light:"#f8dab0",enemy:"#f6a9a3"},
    {name:"最後の間",story:"もう、斬る理由を知っている。",bg:["#161d33","#37334e"],floor:"#29263f",light:"#ffdfae",enemy:"#ef9da7"}
  ];
  const waveTypes=[
    ["blade","blade","blade"],
    ["blade","blade","spear","blade"],
    ["blade","spear","archer","archer"],
    ["spear","spear","shade","archer","blade"],
    ["spear","shade","shade","archer","archer","blade"],
    ["boss"]
  ];
  const enemyTemplates={
    blade:{hp:58,r:15,speed:79,range:62,windup:.66,cooldown:1.95,dmg:13,color:"#ffa69d",score:14},
    spear:{hp:82,r:18,speed:66,range:111,windup:.91,cooldown:2.45,dmg:19,color:"#d9bce9",score:21},
    archer:{hp:54,r:14,speed:58,range:400,windup:.77,cooldown:2.85,dmg:13,color:"#b2d5e8",score:17},
    shade:{hp:72,r:15,speed:118,range:74,windup:.46,cooldown:1.72,dmg:15,color:"#f0be91",score:21},
    boss:{hp:790,r:34,speed:62,range:125,windup:1.08,cooldown:2.6,dmg:24,color:"#ffddab",score:200}
  };
  const relics=[
    {id:"edge",glyph:"刃",name:"研ぎ澄む刃",desc:"斬撃の威力が22%上昇する。",max:3,apply:p=>p.attack*=1.22},
    {id:"guard",glyph:"間",name:"静けさの間",desc:"受け流しの有効時間が0.06秒伸びる。",max:2,apply:p=>p.parryWindow+=.06},
    {id:"drift",glyph:"風",name:"疾風の足",desc:"移動が12%速くなる。",max:2,apply:p=>p.speed*=1.12},
    {id:"blood",glyph:"命",name:"命の灯",desc:"最大生命＋25、生命を40回復。",max:3,apply:p=>{p.maxHp+=25;p.hp=Math.min(p.maxHp,p.hp+40)}},
    {id:"wake",glyph:"月",name:"薄月の剣筋",desc:"斬撃の届く距離が18伸びる。",max:2,apply:p=>p.range+=18},
    {id:"echo",glyph:"響",name:"残響の刃",desc:"斬撃・受け流しで溜まる力が20%上昇。",max:3,apply:p=>p.gain*=1.2},
    {id:"breath",glyph:"息",name:"息を整える",desc:"受け流し・回避の再使用が早くなる。",max:2,apply:p=>{p.parryCdBase=Math.max(.58,p.parryCdBase-.11);p.dashCdBase=Math.max(.83,p.dashCdBase-.15)}},
    {id:"mercy",glyph:"花",name:"最後の花",desc:"危機に一度だけ生命35を取り戻す。",max:1,apply:p=>{p.revive+=1}},
    {id:"mirror",glyph:"鏡",name:"返す月影",desc:"受け流しによる反撃ダメージが大きくなる。",max:3,apply:p=>p.counter*=1.3}
  ];
  let saved={best:0,wins:0,combos:0,bestKills:0,sound:true,motion:true};
  try{
    const loaded=JSON.parse(localStorage.getItem(SAVE)||"null");
    if(loaded&&typeof loaded==="object"){
      for(const key of ["best","wins","combos","bestKills"]){
        const n=Number(loaded[key]);if(Number.isFinite(n))saved[key]=clamp(Math.floor(n),0,1000000);
      }
      if(typeof loaded.sound==="boolean")saved.sound=loaded.sound;
      if(typeof loaded.motion==="boolean")saved.motion=loaded.motion;
    }else if(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)saved.motion=false;
  }catch(_){}
  const persist=()=>{try{localStorage.setItem(SAVE,JSON.stringify(saved));}catch(_){}};
  let player=null,scene="title",gate=0,enemies=[],shots=[],effects=[],traces=[],texts=[],time=0,stageTime=0;
  let last=0,dpr=1,shake=0,hitstop=0,slow=0,cleared=false,spawnCd=0,idSerial=1,calloutTime=0,rafId=0;
  let kills=0,chain=0,bestChain=0,chainCd=0,relicCounts={},selectedRelics=[],bossPhase=0;
  const input={keys:new Set(),stick:{x:0,y:0,id:null,cx:0,cy:0},attackHeld:false,attackTimer:0};
  const ui={gate:$("gateNumber"),name:$("gateName"),hp:$("hpBar"),hpText:$("hpText"),
    energy:$("energyBar"),energyText:$("energyText"),kills:$("killCount"),combo:$("combo"),
    wave:$("waveLabel"),hint:$("hintLabel"),callout:$("callout"),overlay:$("overlay"),dialog:$("dialog"),
    pad:$("pad"),knob:$("knob"),dash:$("dash"),dashLabel:$("dashLabel"),skill:$("skill"),
    mute:$("mute"),motion:$("motion")};
  let audio=null;
  function soundInit(){
    if(!saved.sound)return;
    try{const Audio=window.AudioContext||window.webkitAudioContext;if(!audio&&Audio)audio=new Audio();
      if(audio?.state==="suspended")audio.resume().catch(()=>{});
    }catch(_){}
  }
  function tone(freq,duration=.12,volume=.023,type="triangle",pitch=1,delay=0){
    if(!audio||!saved.sound||audio.state!=="running")return;
    try{
      const t=audio.currentTime+delay,o=audio.createOscillator(),g=audio.createGain();
      o.type=type;o.frequency.setValueAtTime(Math.max(45,freq),t);
      if(pitch!==1)o.frequency.exponentialRampToValueAtTime(Math.max(45,freq*pitch),t+duration);
      g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0003,volume),t+.014);
      g.gain.exponentialRampToValueAtTime(.0001,t+duration);
      o.connect(g);g.connect(audio.destination);o.start(t);o.stop(t+duration+.02);
    }catch(_){}
  }
  function fxSound(name){
    if(name==="slash"){tone(310,.16,.017,"triangle",1.85);tone(810,.08,.012,"sine",.6);}
    else if(name==="parry"){[432,648,864].forEach((f,i)=>tone(f,.25,.024,"sine",1.01,i*.055));}
    else if(name==="hit"){tone(155,.17,.04,"sawtooth",.65);}
    else if(name==="enemy"){tone(190,.15,.009,"triangle",.7);}
    else if(name==="dash"){tone(240,.24,.024,"sine",1.7);}
    else if(name==="kill"){tone(550,.19,.019,"sine",1.5);}
    else if(name==="special"){[216,324,432,648,864].forEach((f,i)=>tone(f,.76,.039,"sine",1.01,i*.065));}
    else if(name==="victory"){[432,540,648,864,1080].forEach((f,i)=>tone(f,.65,.033,"sine",1.02,i*.15));}
  }
  function hud(){
    const p=player,c=colors[gate];
    ui.gate.textContent="GATE "+String(gate+1).padStart(2,"0")+" / 06";
    ui.name.textContent=c.name;
    ui.kills.textContent="浄化 "+kills;
    ui.combo.textContent="連斬 × "+chain;
    ui.hp.style.width=p?(100*clamp(p.hp/p.maxHp,0,1))+"%":"100%";
    ui.hpText.textContent=p?Math.ceil(p.hp)+" / "+p.maxHp:"100 / 100";
    ui.energy.style.width=p?clamp(p.energy,0,100)+"%":"0%";
    ui.energyText.textContent=p?Math.floor(p.energy)+" / 100":"0 / 100";
    ui.wave.textContent=gate===5?"最終ノ間":"第"+["壱","弐","参","肆","伍"][gate]+"門";
    const boss=enemies.find(e=>e.type==="boss"&&e.hp>0);
    ui.hint.textContent=boss?"守り手を超えろ":scene==="playing"?"残る影 "+enemies.filter(e=>e.hp>0).length:"攻撃を見切れ";
    ui.dash.classList.toggle("cooling",!!p&&p.dashCd>0);
    ui.dashLabel.textContent=p&&p.dashCd>0?p.dashCd.toFixed(1)+"s":"DASH";
    ui.skill.classList.toggle("ready",!!p&&p.energy>=100);
    ui.skill.disabled=scene!=="playing"||!p||p.energy<100;
    ui.mute.setAttribute("aria-pressed",String(!saved.sound));
    ui.mute.textContent=saved.sound?"♫":"♪̸";
    ui.mute.setAttribute("aria-label",saved.sound?"音を消す":"音を出す");
    ui.motion.setAttribute("aria-pressed",String(!saved.motion));
    ui.motion.setAttribute("aria-label",saved.motion?"動きを抑える":"動きを戻す");
  }
  function dialogue(content){
    ui.dialog.innerHTML=content;ui.overlay.classList.remove("hidden");
    input.keys.clear();input.attackHeld=false;resetStick();
  }
  function hideDialogue(){ui.overlay.classList.add("hidden")}
  function announce(message,duration=1.5){
    ui.callout.textContent=message;ui.callout.classList.add("show");calloutTime=duration;
  }
  function resetStick(){
    input.stick.id=null;input.stick.x=0;input.stick.y=0;
    ui.knob.style.transform="translate(0px,0px)";
  }
  function freshPlayer(){
    return {x:W/2,y:440,r:16,hp:110,maxHp:110,energy:0,speed:228,
      facing:-Math.PI/2,attack:31,range:83,gain:1,counter:1,parryWindow:.23,
      parryCdBase:.88,dashCdBase:1.28,revive:0,invuln:.95,atkCd:0,parryCd:0,
      parryTime:0,dashCd:0,dashTime:0,dashX:0,dashY:-1,slashTime:0,
      combo:0,comboWindow:0,guardFlash:0,streak:0};
  }
  function record(){
    if(!player)return;
    saved.best=Math.max(saved.best,gate+1);
    saved.bestKills=Math.max(saved.bestKills,kills);
    saved.combos=Math.max(saved.combos,bestChain);
    persist();
  }
  function startRun(){
    soundInit();gate=0;kills=0;chain=0;bestChain=0;chainCd=0;selectedRelics=[];relicCounts={};
    player=freshPlayer();beginGate();
  }
  function beginGate(){
    scene="playing";cleared=false;time=0;stageTime=0;bossPhase=0;spawnCd=0;slow=0;hitstop=0;
    effects=[];traces=[];texts=[];shots=[];enemies=[];shake=0;
    player.x=W/2;player.y=440;player.invuln=1.2;
    player.hp=Math.min(player.maxHp,player.hp+(gate===0?0:18));
    player.dashCd=0;player.parryCd=0;player.atkCd=0;
    player.parryTime=0;player.dashTime=0;player.combo=0;player.comboWindow=0;
    input.keys.clear();input.attackHeld=false;resetStick();hideDialogue();
    // Stagger spawns for readable pacing. The opening foe starts in view.
    for(let i=0;i<waveTypes[gate].length;i++){
      const t=waveTypes[gate][i],theta=TAU*(i+.11)/waveTypes[gate].length;
      const r=t==="boss"?165:155+((i%2)*44);
      spawn(t,clamp(240+Math.cos(theta)*r,55,W-55),clamp(295+Math.sin(theta)*r,110,495),i*.52);
    }
    hud();announce(colors[gate].name,2.3);
  }
  function spawn(type,x,y,delay=0){
    const t=enemyTemplates[type],mult=1+gate*.13;
    const mob={id:idSerial++,type,x,y,r:t.r,hp:Math.round(t.hp*mult),
      maxHp:Math.round(t.hp*mult),speed:t.speed*(1+gate*.024),
      range:t.range,dmg:t.dmg+gate*2,cooldown:t.cooldown,windBase:t.windup,
      cooldownTimer:random(.7,1.3)+delay,windup:0,stun:0,dead:false,
      telegraphAngle:0,mode:"seek",flash:0,phase:random(0,TAU),attackKind:"strike",
      enter:delay,knockX:0,knockY:0,knockTime:0,score:t.score,shootAim:null};
    enemies.push(mob);return mob;
  }
  function spark(x,y,count,color,power=1){
    if(!saved.motion)count=Math.min(count,5);
    for(let i=0;i<count&&effects.length<220;i++){
      const a=random(0,TAU),v=random(35,178)*power,life=random(.24,.7);
      effects.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life,max:life,r:random(1.1,3.4),color});
    }
  }
  function ring(x,y,r,color,duration=.38){
    traces.push({x,y,r:4,target:r,life:duration,max:duration,color});
    if(traces.length>34)traces.shift();
  }
  function rise(x,y,text,color="#fbe9c9"){
    texts.push({x,y,text,color,life:.75,max:.75});
    if(texts.length>20)texts.shift();
  }
  function faceTarget(){
    let target=null,best=135*135;
    for(const e of enemies){
      if(e.dead||e.enter>0)continue;
      const d=(e.x-player.x)**2+(e.y-player.y)**2;
      if(d<best){best=d;target=e}
    }
    return target?angleTo(player,target):player.facing;
  }
  function gain(amount){
    player.energy=clamp(player.energy+amount*player.gain,0,100);
  }
  function slash(){
    if(scene!=="playing"||player.atkCd>0||player.dashTime>0)return false;
    soundInit();
    const p=player;p.combo=p.comboWindow>0?(p.combo%3)+1:1;
    p.comboWindow=.72;p.facing=faceTarget();
    p.slashTime=.19;p.atkCd=p.combo===3?.34:.24;
    const power=p.combo===3?1.64:p.combo===2?1.17:1;
    let hit=0;
    for(const e of enemies){
      if(e.dead||e.enter>0)continue;
      const d=distance(p,e),a=angleTo(p,e);
      if(d<p.range+e.r&&Math.abs(difference(a,p.facing))<(p.combo===3?.96:.82)){
        const damage=Math.round(p.attack*power);
        hurtEnemy(e,damage,p.x,p.y);
        if(e.dead)continue;
        e.stun=Math.max(e.stun,p.combo===3?.2:.09);
        if(e.windup>0 && p.combo===3)e.windup=Math.max(.1,e.windup-.11);
        hit++;gain(p.combo===3?7:4);
      }
    }
    fxSound("slash");ring(p.x+Math.cos(p.facing)*42,p.y+Math.sin(p.facing)*42,p.range*.75,
      p.combo===3?"#ffe7a7":"#d4ede4",.21);
    spark(p.x+Math.cos(p.facing)*50,p.y+Math.sin(p.facing)*50,hit?14:7,"#fff0cf",.58);
    if(hit){hitstop=Math.max(hitstop,.026);shake=Math.max(shake,2);}
    return true;
  }
  function dash(){
    if(scene!=="playing"||player.dashCd>0||player.dashTime>0)return false;
    const d=readMove(),mag=length(d[0],d[1]);
    player.dashX=mag>.15?d[0]/mag:Math.cos(player.facing);
    player.dashY=mag>.15?d[1]/mag:Math.sin(player.facing);
    player.dashTime=.205;player.dashCd=player.dashCdBase;
    player.invuln=Math.max(player.invuln,.27);
    ring(player.x,player.y,58,"#c9d4f7",.31);
    spark(player.x,player.y,15,"#a5dbe4",.65);
    fxSound("dash");return true;
  }
  function parry(){
    if(scene!=="playing"||player.parryCd>0||player.dashTime>0)return false;
    player.parryTime=player.parryWindow;player.parryCd=player.parryCdBase;
    player.guardFlash=.27;
    ring(player.x,player.y,52,"#c0f1f1",.32);
    tone(670,.12,.01,"sine",.85);return true;
  }
  function perfect(e,dmg){
    if(scene!=="playing"||player.parryTime<=0)return false;
    player.parryTime=0;
    player.parryCd=Math.min(player.parryCd,.19);
    player.invuln=Math.max(player.invuln,.33);
    player.guardFlash=.7;gain(26);slow=.68;hitstop=.12;
    chain++;chainCd=4.3;bestChain=Math.max(bestChain,chain);
    if(e&&!e.dead){
      const damage=Math.round(33*player.counter);
      hurtEnemy(e,damage,player.x,player.y);
      e.stun=Math.max(e.stun,1.15);e.windup=0;e.cooldownTimer=Math.max(e.cooldownTimer,1.1);
    }
    spark(player.x,player.y,34,"#d7fff6",1.25);
    ring(player.x,player.y,146,"#c8ffef",.68);
    shake=Math.max(shake,5);fxSound("parry");
    announce("見切った！",.8);
    return true;
  }
  function takeHit(damage,e){
    if(scene!=="playing")return;
    if(player.parryTime>0){perfect(e,damage);return;}
    if(player.invuln>0||player.dashTime>0)return;
    player.hp=Math.max(0,player.hp-damage);player.invuln=.83;shake=Math.max(shake,12);
    player.combo=0;player.comboWindow=0;chain=0;chainCd=0;
    ring(player.x,player.y,67,"#ff9c9f",.42);spark(player.x,player.y,18,"#ff9ea0",.8);
    rise(player.x,player.y-27,"−"+damage,"#ffbec1");
    fxSound("hit");
    if(player.hp<=0){
      if(player.revive>0){
        player.revive--;player.hp=35;player.invuln=2;announce("最後の花が灯った",1.7);
        ring(player.x,player.y,140,"#ffeab4",.9);
      }else defeat();
    }
  }
  function hurtEnemy(e,damage,x,y){
    if(!e||e.dead)return;
    e.hp-=damage;e.flash=.18;
    rise(e.x+random(-6,6),e.y-24,String(Math.round(damage)),
      damage>48?"#ffe6a5":"#e9f8ec");
    spark(e.x,e.y,7,"#f8ded0",.52);
    if(e.hp<=0){
      e.dead=true;kills++;
      chain++;chainCd=4.3;bestChain=Math.max(bestChain,chain);
      gain(13);fxSound("kill");
      spark(e.x,e.y,e.type==="boss"?72:24,colors[gate].light,e.type==="boss"?2:1);
      ring(e.x,e.y,e.type==="boss"?220:80,colors[gate].light,e.type==="boss"?1.1:.5);
      shake=Math.max(shake,e.type==="boss"?12:4);
    }
  }
  function special(){
    if(scene!=="playing"||player.energy<100)return false;
    player.energy=0;player.invuln=Math.max(player.invuln,1.2);
    player.atkCd=Math.max(player.atkCd,.65);
    slow=.7;hitstop=.14;shake=9;fxSound("special");
    ring(player.x,player.y,335,"#ffe5ad",.88);
    spark(player.x,player.y,86,"#f7e0b2",2.4);
    announce("一閃 · 無明",1.3);
    for(const e of enemies)if(!e.dead&&e.enter<=0&&distance(player,e)<350){
      hurtEnemy(e,e.type==="boss"?195:180,player.x,player.y);
      if(!e.dead)e.stun=Math.max(e.stun,1.1);
    }
    shots.length=0;
    return true;
  }
  function defeat(){
    if(scene!=="playing")return;
    record();scene="over";input.keys.clear();input.attackHeld=false;resetStick();
    dialogue('<div class="kicker">THE BLADE IS NOT BROKEN</div><span class="sigil">月</span>'+
      '<h2>刃は、まだ折れていない。</h2><p>敗れたのはこの一度だけ。<br>呼吸を整えて、もう一度。</p>'+
      statsHtml()+'<button class="primary" data-action="retry">この門から再挑戦 ↗</button>'+
      '<button class="secondary" data-action="restart">最初から</button>'+
      '<button class="secondary" data-action="home">旅の入口へ</button>');
  }
  function statsHtml(){
    return '<div class="results"><span><strong>'+kills+'</strong>浄化した影</span>'+
      '<span><strong>×'+bestChain+'</strong>最長連斬</span>'+
      '<span><strong>'+String(gate+1).padStart(2,"0")+'</strong>到達した門</span></div>';
  }
  function victory(){
    if(scene!=="playing")return;
    scene="won";record();saved.wins++;saved.best=6;persist();
    fxSound("victory");
    dialogue('<div class="kicker">THE SIXTH GATE OPENS</div><span class="sigil">✺</span>'+
      '<h2>その一瞬が、<br>世界を変えた。</h2><p>剣は、相手を倒すためだけのものではなかった。<br>守りたかった静けさが、あなたの中にある。</p>'+
      statsHtml()+
      '<button class="primary" data-action="restart">もう一度、六つの門へ ↗</button>'+
      '<button class="secondary" data-action="home">旅の入口へ</button>');
  }
  function clearedGate(){
    if(scene!=="playing"||cleared)return;
    cleared=true;record();
    if(gate===5){victory();return;}
    scene="relic";soundInit();
    player.hp=Math.min(player.maxHp,player.hp+12);
    const eligible=relics.filter(r=>(relicCounts[r.id]||0)<r.max);
    const offers=[];
    while(eligible.length&&offers.length<3){
      const index=Math.floor(Math.random()*eligible.length);
      offers.push(eligible.splice(index,1)[0]);
    }
    selectedRelics=offers;
    const cards=offers.map((r,i)=>'<button type="button" class="relic" data-action="relic" data-index="'+i+'">'+
      '<span class="glyph">'+r.glyph+'</span><span class="copy"><strong>'+r.name+'</strong><small>'+r.desc+
      '　'+(relicCounts[r.id]||0)+' / '+r.max+'</small></span></button>').join("");
    dialogue('<div class="kicker">GATE '+String(gate+1).padStart(2,"0")+' · CLEARED</div><span class="sigil">✧</span>'+
      '<h2>'+colors[gate].name+'を越えた。</h2>'+
      '<p>'+colors[gate].story+'<br>次の門へ持っていく力を選ぼう。</p>'+
      '<div class="choices">'+cards+'</div>');
    hud();
  }
  function chooseRelic(i){
    if(scene!=="relic"||!Number.isInteger(i)||i<0||i>=selectedRelics.length)return;
    const r=selectedRelics[i];
    if((relicCounts[r.id]||0)>=r.max)return;
    r.apply(player);relicCounts[r.id]=(relicCounts[r.id]||0)+1;
    gate++;beginGate();
  }
  function pause(){
    if(scene!=="playing")return;
    scene="paused";dialogue('<div class="kicker">A MOMENT TO BREATHE</div><span class="sigil">間</span>'+
      '<h2>一呼吸の休息</h2><p>敵も刃も、ここで待っている。</p>'+
      '<button class="primary" data-action="resume">剣を構える ↗</button>'+
      '<button class="secondary" data-action="home">旅の入口へ</button>');hud();
  }
  function resume(){
    if(scene!=="paused")return;
    soundInit();scene="playing";hideDialogue();hud();
  }
  function home(){
    scene="title";input.keys.clear();input.attackHeld=false;resetStick();
    dialogue('<div class="kicker">GPT6 CHAT · ORIGINAL ACTION 03</div><span class="sigil">刹</span>'+
      '<h2>刃が交わる、その前に。</h2>'+
      '<p>斬る。避ける。受け流す。<br>六つの門を越える、剣戟アクション。<br>'+
      '敵が光った瞬間、恐れずに「受」を押そう。</p>'+
      '<button class="primary" data-action="start">六つの門へ ↗</button>'+
      '<button class="secondary" data-action="help">操作を確認する</button>'+
      '<p>BEST GATE '+saved.best+' / 6 · CLEAR '+saved.wins+' · CHAIN ×'+saved.combos+'</p>');
    hud();
  }
  function help(){
    dialogue('<div class="kicker">THE ART OF TIMING</div><span class="sigil">刀</span>'+
      '<h2>操作の手引き</h2><p>スマホ：左の円で移動、右の四つのボタンで戦う。<br>'+
      'PC：WASD・矢印キーで移動。J＝斬、K＝受、L・Shift＝避、Space＝閃。<br>'+
      '敵の攻撃予告が終わる直前に「受」を押すと見切りが成功。敵を崩し、残響が増える。<br>'+
      '残響が100になると「閃」で奥義を放てる。<br>Esc / P は休息。</p>'+
      '<button class="primary" data-action="start">旅をはじめる ↗</button>'+
      '<button class="secondary" data-action="home">もどる</button>');
  }
  function retry(){
    if(scene!=="over")return;
    player.hp=Math.max(80,Math.round(player.maxHp*.78));
    player.energy=clamp(player.energy+28,0,100);
    beginGate();announce("もう一度、呼吸から",1.7);
  }
  function readMove(){
    let x=input.stick.x,y=input.stick.y;
    const keys=input.keys;
    const kx=(keys.has("d")||keys.has("arrowright")?1:0)-(keys.has("a")||keys.has("arrowleft")?1:0);
    const ky=(keys.has("s")||keys.has("arrowdown")?1:0)-(keys.has("w")||keys.has("arrowup")?1:0);
    if(kx||ky){x=kx;y=ky}
    const mag=length(x,y);return mag>1?[x/mag,y/mag]:[x,y];
  }
  function movePlayer(dt){
    const p=player,axes=readMove();
    if(p.dashTime>0){
      p.dashTime=Math.max(0,p.dashTime-dt);
      p.x+=p.dashX*875*dt;p.y+=p.dashY*875*dt;
      if(Math.random()<dt*45)spark(p.x,p.y,2,"#c1f2f1",.2);
    }else{
      p.x+=axes[0]*p.speed*dt;p.y+=axes[1]*p.speed*dt;
      if(length(...axes)>.12)p.facing=Math.atan2(axes[1],axes[0]);
    }
    p.x=clamp(p.x,39,W-39);p.y=clamp(p.y,112,556);
    p.atkCd=Math.max(0,p.atkCd-dt);p.parryCd=Math.max(0,p.parryCd-dt);
    p.parryTime=Math.max(0,p.parryTime-dt);p.dashCd=Math.max(0,p.dashCd-dt);
    p.invuln=Math.max(0,p.invuln-dt);p.slashTime=Math.max(0,p.slashTime-dt);
    p.guardFlash=Math.max(0,p.guardFlash-dt);p.comboWindow=Math.max(0,p.comboWindow-dt);
    if(p.comboWindow<=0)p.combo=0;
  }
  function fireArcher(e){
    const aim=e.shootAim||{x:player.x,y:player.y};
    const a=angleTo(e,aim),speed=210+gate*11;
    shots.push({x:e.x,y:e.y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,
      r:6,life:3.3,dmg:e.dmg,source:e.id});
    spark(e.x,e.y,8,"#d2e9f1",.55);fxSound("enemy");
  }
  function strike(e){
    if(e.dead||e.stun>0)return;
    if(e.type==="archer"){fireArcher(e);return;}
    if(e.type==="boss"&&e.attackKind==="ring"){
      const n=10;
      for(let j=0;j<n;j++){
        const a=e.telegraphAngle+j*TAU/n;
        shots.push({x:e.x,y:e.y,vx:Math.cos(a)*177,vy:Math.sin(a)*177,
          r:7,life:3,dmg:15+gate,source:e.id});
      }
      fxSound("enemy");ring(e.x,e.y,205,"#ffc6a8",.4);return;
    }
    const d=distance(e,player),a=angleTo(e,player);
    const half=e.type==="spear"?.36:e.type==="boss"?.8:e.type==="shade"?.7:.68;
    if(d<e.range+player.r && Math.abs(difference(a,e.telegraphAngle))<half){
      takeHit(e.dmg,e);
    }
    if(e.type==="boss"){ring(e.x,e.y,e.range,"#ffd5a8",.34);}
    else if(e.type==="spear")spark(e.x+Math.cos(e.telegraphAngle)*77,e.y+Math.sin(e.telegraphAngle)*77,7,"#eed8ee",.45);
  }
  function updateEnemy(e,dt){
    if(e.dead)return;
    e.flash=Math.max(0,e.flash-dt);
    e.phase+=dt*(e.type==="shade"?5.5:2.5);
    if(e.enter>0){e.enter-=dt;return;}
    if(e.knockTime>0){e.knockTime-=dt;e.x+=e.knockX*dt;e.y+=e.knockY*dt;}
    if(e.stun>0){e.stun-=dt;return;}
    const dx=player.x-e.x,dy=player.y-e.y,d=Math.max(1,length(dx,dy));
    if(e.windup>0){
      e.windup-=dt;
      if(e.windup<=0){
        e.windup=0;
        strike(e);
        e.cooldownTimer=e.cooldown*(e.type==="boss"?.91:1);
      }
    }else{
      e.cooldownTimer-=dt;
      let speed=e.speed,dir=1;
      if(e.type==="archer"){if(d<175)dir=-.9;else if(d<245)dir=.16}
      if(e.type==="boss"&&d<104)dir=.12;
      if(d>e.r+player.r+5||dir<0){
        const weave=e.type==="shade"?Math.sin(e.phase*2)*33:0;
        e.x+=(dx/d*speed*dir-dy/d*weave)*dt;
        e.y+=(dy/d*speed*dir+dx/d*weave)*dt;
      }
      const range=e.type==="archer"?355:e.range+(e.type==="spear"?20:35);
      if(e.cooldownTimer<=0&&d<range){
        e.windup=e.windBase;
        e.telegraphAngle=Math.atan2(dy,dx);
        e.shootAim={x:player.x,y:player.y};
        if(e.type==="boss"){
          e.attackKind=bossPhase%3===1?"ring":"strike";bossPhase++;
          if(e.attackKind==="ring")e.windup=1.23;
        }
      }
    }
    e.x=clamp(e.x,39,W-39);e.y=clamp(e.y,108,555);
    // Body collision keeps enemies from stacking on top of the player.
    const d2=distance(e,player),min=e.r+player.r-2;
    if(d2<min&&d2>1){
      e.x+=((e.x-player.x)/d2)*(min-d2)*.55;
      e.y+=((e.y-player.y)/d2)*(min-d2)*.55;
    }
  }
  function updateShots(dt){
    for(let i=shots.length-1;i>=0;i--){
      const b=shots[i],oldX=b.x,oldY=b.y;
      b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;
      const vx=b.x-oldX,vy=b.y-oldY;
      const t=clamp(((player.x-oldX)*vx+(player.y-oldY)*vy)/Math.max(.001,vx*vx+vy*vy),0,1);
      const d=length(player.x-(oldX+vx*t),player.y-(oldY+vy*t));
      if(d<player.r+b.r){
        const owner=enemies.find(e=>e.id===b.source);
        takeHit(b.dmg,owner);
        shots.splice(i,1);
        if(scene!=="playing")return;
      }else if(b.life<=0||b.x<10||b.x>W-10||b.y<70||b.y>H-90)shots.splice(i,1);
    }
  }
  function update(dt){
    if(scene!=="playing")return;
    time+=dt;stageTime+=dt;
    if(chainCd>0){chainCd-=dt;if(chainCd<=0)chain=0}
    if(calloutTime>0){calloutTime-=dt;if(calloutTime<=0)ui.callout.classList.remove("show")}
    if(hitstop>0){hitstop-=dt;hud();return;}
    const worldDt=slow>0?dt*.4:dt;
    slow=Math.max(0,slow-dt);
    movePlayer(dt);
    for(const e of enemies){updateEnemy(e,worldDt);if(scene!=="playing")return}
    // Simple symmetric separation, capped to prevent cascading instability.
    for(let i=0;i<enemies.length;i++){
      const a=enemies[i];if(a.dead||a.enter>0)continue;
      for(let j=i+1;j<enemies.length;j++){
        const b=enemies[j];if(b.dead||b.enter>0)continue;
        const dx=b.x-a.x,dy=b.y-a.y,d=length(dx,dy),min=a.r+b.r+3;
        if(d<min){
          const nx=d>.01?dx/d:1,ny=d>.01?dy/d:0,over=(min-d)*.16;
          a.x-=nx*over;a.y-=ny*over;b.x+=nx*over;b.y+=ny*over;
        }
      }
    }
    updateShots(worldDt);
    if(scene!=="playing")return;
    if(input.attackHeld){input.attackTimer-=dt;if(input.attackTimer<=0){slash();input.attackTimer=.22}}
    if(enemies.length&&enemies.every(e=>e.dead))clearedGate();
    shake*=Math.pow(.84,dt*60);
    hud();
  }
  function updateParticles(dt){
    for(let i=effects.length-1;i>=0;i--){
      const e=effects[i];e.life-=dt;e.x+=e.vx*dt;e.y+=e.vy*dt;
      e.vx*=Math.exp(-3*dt);e.vy*=Math.exp(-3*dt);
      if(e.life<=0)effects.splice(i,1);
    }
    for(let i=traces.length-1;i>=0;i--){
      const r=traces[i];r.life-=dt;r.r=lerp(r.r,r.target,Math.min(1,dt*10));
      if(r.life<=0)traces.splice(i,1);
    }
    for(let i=texts.length-1;i>=0;i--){
      const t=texts[i];t.life-=dt;t.y-=dt*39;
      if(t.life<=0)texts.splice(i,1);
    }
  }
  function circle(x,y,r,fill){
    ctx.fillStyle=fill;ctx.beginPath();ctx.arc(x,y,Math.max(.1,r),0,TAU);ctx.fill();
  }
  function polygon(points,fill){
    ctx.fillStyle=fill;ctx.beginPath();
    points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();
  }
  function backdrop(){
    const c=colors[gate],g=ctx.createLinearGradient(0,0,W,H);
    g.addColorStop(0,c.bg[0]);g.addColorStop(1,c.bg[1]);
    ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    const glow=ctx.createRadialGradient(W/2,220,28,W/2,335,345);
    glow.addColorStop(0,gate===5?"rgba(255,196,151,.14)":"rgba(243,228,184,.12)");
    glow.addColorStop(1,"rgba(8,18,33,0)");
    ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);
    // Long perspective gives the combat circle the scale of a forgotten shrine.
    ctx.save();ctx.globalAlpha=.6;
    polygon([[0,96],[480,96],[462,564],[18,564]],c.floor);
    ctx.strokeStyle="rgba(237,224,201,.13)";ctx.lineWidth=1;
    for(let k=0;k<8;k++){
      const y=115+k*k*7.1;ctx.beginPath();ctx.moveTo(12,y);ctx.lineTo(468,y);ctx.stroke();
    }
    for(let k=0;k<=8;k++){
      ctx.beginPath();ctx.moveTo(240,108);ctx.lineTo(k*66-24,564);ctx.stroke();
    }
    // Inset ornamental rings are decoration, not attack hitboxes.
    ctx.save();ctx.translate(240,343);ctx.scale(1,.66);
    for(const r of [107,159,206]){
      ctx.strokeStyle="rgba(244,226,182,.14)";ctx.lineWidth=1.5;
      ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.stroke();
    }
    for(let i=0;i<12;i++){
      const a=i*TAU/12;
      ctx.strokeStyle="rgba(255,228,171,.28)";
      ctx.beginPath();ctx.moveTo(Math.cos(a)*168,Math.sin(a)*168);
      ctx.lineTo(Math.cos(a)*181,Math.sin(a)*181);ctx.stroke();
    }
    ctx.restore();ctx.restore();
    for(const [x,y] of [[23,162],[456,162],[26,475],[454,475]]){
      ctx.save();ctx.shadowColor=c.light;ctx.shadowBlur=12;
      circle(x,y,5,c.light);ctx.restore();
    }
    ctx.fillStyle="#081522b8";ctx.fillRect(0,0,W,92);
    ctx.fillRect(0,568,W,H-568);
    ctx.fillStyle="rgba(241,222,179,.35)";ctx.fillRect(17,91,W-34,1);
    // Paper-fall particles are deterministic visual ornaments.
    if(saved.motion){
      for(let i=0;i<25;i++){
        const x=(i*71+31+time*(i%3+1)*4)%W,y=(i*137+time*9*(i%2?1:-1)+H*3)%H;
        const opacity=.08+.07*Math.sin(time*.6+i);
        circle(x,y,(i%3)*.4+1,"rgba(255,232,201,"+Math.max(.02,opacity)+")");
      }
    }
    ctx.fillStyle="rgba(240,220,181,.45)";ctx.font="10px Georgia";ctx.textAlign="center";
    ctx.fillText("S E T S U N A   ·   "+String(gate+1).padStart(2,"0"),240,77);
  }
  function drawTelegraph(e){
    if(e.windup<=0||e.stun>0||e.dead||e.enter>0)return;
    const t=clamp(1-e.windup/(e.attackKind==="ring"?1.23:e.windBase),0,1);
    ctx.save();ctx.translate(e.x,e.y);ctx.rotate(e.telegraphAngle);
    ctx.globalAlpha=.18+.34*t;ctx.fillStyle=e.type==="archer"?"#bfd7f5":"#ff967f";
    const length=e.type==="archer"?350:e.range,spread=e.type==="spear"?.36:e.type==="boss"?.9:.77;
    if(e.attackKind==="ring"){
      ctx.beginPath();ctx.arc(0,0,185+10*t,0,TAU);ctx.lineWidth=14;ctx.strokeStyle="#f9a88b";ctx.stroke();
    }else if(e.type==="archer"||e.type==="spear"){
      polygon([[0,0],[length,-14-8*t],[length,14+8*t]],e.type==="archer"?"#bddbec":"#f9a4a3");
    }else{
      ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,length+10,-spread,spread);ctx.closePath();ctx.fill();
    }
    ctx.restore();
    ctx.save();ctx.strokeStyle="#ffe7c6";ctx.lineWidth=3;
    ctx.beginPath();ctx.arc(e.x,e.y,e.r+9,-Math.PI/2,-Math.PI/2+TAU*t);ctx.stroke();ctx.restore();
  }
  function drawEnemy(e){
    if(e.dead||e.enter>0)return;
    const c=colors[gate],boss=e.type==="boss",a=e.type==="archer",spear=e.type==="spear";
    ctx.save();ctx.translate(e.x,e.y+Math.sin(e.phase)*1.5);
    const dim=e.stun>0?.6:1;
    ctx.globalAlpha=dim;
    circle(0,13,e.r+4,"rgba(5,16,28,.46)");
    ctx.shadowBlur=e.flash>0?25:12;ctx.shadowColor=e.flash>0?"#fffdeb":c.enemy;
    const color=e.flash>0?"#fffbe9":enemyTemplates[e.type].color;
    // Cloth silhouette, visually different by combat archetype.
    ctx.rotate(boss?Math.sin(time*.7)*.07:Math.sin(e.phase)*.055);
    polygon([[-e.r*.85,11],[-e.r*.61,-e.r*.55],[0,-e.r*1.18],
      [e.r*.61,-e.r*.55],[e.r*.9,12],[0,e.r*.72]],color);
    if(boss){
      ctx.shadowBlur=0;ctx.strokeStyle="#fbe0b0";ctx.lineWidth=2;
      for(let k=0;k<6;k++){
        const a=k*TAU/6+time*.17;
        ctx.beginPath();ctx.moveTo(Math.cos(a)*e.r*.97,Math.sin(a)*e.r*.97);
        ctx.lineTo(Math.cos(a)*e.r*1.47,Math.sin(a)*e.r*1.47);ctx.stroke();
      }
    }else if(spear){
      ctx.strokeStyle="#ffe7d2";ctx.lineWidth=2.5;
      ctx.beginPath();ctx.moveTo(8,-e.r*1.6);ctx.lineTo(-9,e.r*1.6);ctx.stroke();
    }else if(a){
      ctx.strokeStyle="#e5f1fe";ctx.lineWidth=1.7;ctx.beginPath();ctx.arc(0,0,e.r+8,-1.4,1.4);ctx.stroke();
    }else if(e.type==="shade"){
      ctx.strokeStyle="#ffe6cb";ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(0,0,e.r+5,time,Math.PI+time);ctx.stroke();
    }
    ctx.shadowBlur=0;ctx.fillStyle="#213040";
    circle(-e.r*.22,-2,1.7,"#24354b");circle(e.r*.22,-2,1.7,"#24354b");
    ctx.restore();
    if(boss||e.hp<e.maxHp){
      const w=boss?92:40,x=e.x-w/2,y=e.y-e.r-21;
      ctx.fillStyle="rgba(8,12,25,.69)";ctx.fillRect(x,y,w,4);
      ctx.fillStyle=boss?"#ffe1aa":"#c8e5df";
      ctx.fillRect(x,y,w*clamp(e.hp/e.maxHp,0,1),4);
    }
    if(e.stun>0){
      ctx.save();ctx.fillStyle="#d8fcf0";ctx.font="15px Georgia";ctx.textAlign="center";ctx.fillText("✧",e.x,e.y-e.r-15);ctx.restore();
    }
  }
  function drawPlayer(){
    if(!player)return;
    const p=player;
    ctx.save();ctx.globalAlpha=p.invuln>0&&Math.floor(time*14)%2===0?.66:1;
    circle(p.x,p.y+17,19,"rgba(3,14,25,.45)");
    ctx.translate(p.x,p.y);
    const a=p.facing;ctx.rotate(a+Math.PI/2);
    ctx.shadowColor="#bff4e5";ctx.shadowBlur=p.guardFlash>0?29:15;
    polygon([[-17,17],[-11,-10],[0,-21],[11,-10],[17,17],[0,9]],"#eff4e0");
    polygon([[-12,8],[-8,-8],[0,1],[8,-8],[12,8],[0,3]],"#5d8192");
    ctx.shadowBlur=0;
    // Long thin blade and gold hilt show the direction of the next strike.
    ctx.strokeStyle="#fff3d6";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(7,-6);ctx.lineTo(12,-37);ctx.stroke();
    ctx.strokeStyle="#e0af74";ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(3,-13);ctx.lineTo(17,-11);ctx.stroke();
    circle(0,-15,8,"#e9d9ba");circle(-3,-16,1.2,"#3d4f56");circle(3,-16,1.2,"#3d4f56");
    ctx.restore();
    if(p.slashTime>0){
      ctx.save();ctx.globalAlpha=clamp(p.slashTime/.19,0,1);
      ctx.shadowColor="#fff0c9";ctx.shadowBlur=25;ctx.strokeStyle=p.combo===3?"#ffe2a3":"#d5f3e7";
      ctx.lineWidth=p.combo===3?12:8;ctx.lineCap="round";
      ctx.beginPath();ctx.arc(p.x,p.y,p.range-2,p.facing-.9,p.facing+.9);ctx.stroke();
      ctx.lineWidth=2;ctx.strokeStyle="#fffdf2";ctx.beginPath();
      ctx.arc(p.x,p.y,p.range+5,p.facing-1,p.facing+1);ctx.stroke();ctx.restore();
    }
    if(p.parryTime>0||p.guardFlash>0){
      ctx.save();ctx.globalAlpha=.4+.4*clamp(Math.max(p.parryTime,p.guardFlash)/.7,0,1);
      ctx.strokeStyle="#bffcff";ctx.lineWidth=4;ctx.shadowColor="#beffff";ctx.shadowBlur=21;
      ctx.beginPath();ctx.arc(p.x,p.y,29+5*Math.sin(time*16),0,TAU);ctx.stroke();ctx.restore();
    }
    if(p.energy>=100){
      ctx.save();ctx.strokeStyle="#f7d99c";ctx.globalAlpha=.35+.15*Math.sin(time*5);
      ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,32+Math.sin(time*3)*3,0,TAU);ctx.stroke();ctx.restore();
    }
  }
  function render(){
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
    ctx.save();
    const sx=saved.motion&&shake>.4?random(-shake*.5,shake*.5):0;
    const sy=saved.motion&&shake>.4?random(-shake*.5,shake*.5):0;
    ctx.translate(sx,sy);backdrop();
    for(const e of enemies)drawTelegraph(e);
    for(const t of traces){
      ctx.save();ctx.globalAlpha=.7*clamp(t.life/t.max,0,1);
      ctx.strokeStyle=t.color;ctx.shadowColor=t.color;ctx.shadowBlur=15;ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(t.x,t.y,t.r,0,TAU);ctx.stroke();ctx.restore();
    }
    for(const b of shots){
      ctx.save();ctx.shadowColor="#ffe0cd";ctx.shadowBlur=15;
      circle(b.x,b.y,b.r,"#ffd0be");
      circle(b.x-1,b.y-1,1.8,"#fff5dc");ctx.restore();
    }
    for(const e of enemies)drawEnemy(e);
    drawPlayer();
    for(const p of effects){
      ctx.save();ctx.globalAlpha=clamp(p.life/p.max,0,1);
      ctx.shadowColor=p.color;ctx.shadowBlur=10;circle(p.x,p.y,p.r,p.color);ctx.restore();
    }
    for(const t of texts){
      ctx.save();ctx.globalAlpha=Math.min(1,t.life/t.max*1.4);
      ctx.fillStyle=t.color;ctx.shadowColor="#091421";ctx.shadowBlur=5;ctx.font="600 13px Georgia";
      ctx.textAlign="center";ctx.fillText(t.text,t.x,t.y);ctx.restore();
    }
    ctx.restore();
  }
  function initCanvas(){
    dpr=Math.min(window.devicePixelRatio||1,1.8);
    canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);
  }
  initCanvas();
  // Pointer on a control is bound to that control, supporting two-thumb input.
  function moveStick(e){
    const dx=e.clientX-input.stick.cx,dy=e.clientY-input.stick.cy;
    const len=length(dx,dy),amount=clamp((len-4)/49,0,1);
    input.stick.x=len?dx/len*amount:0;input.stick.y=len?dy/len*amount:0;
    const r=Math.min(35,len);
    ui.knob.style.transform="translate("+(len?dx/len*r:0)+"px,"+(len?dy/len*r:0)+"px)";
  }
  ui.pad.addEventListener("pointerdown",e=>{
    if(scene!=="playing"||input.stick.id!==null)return;
    e.preventDefault();input.stick.id=e.pointerId;
    input.stick.cx=e.clientX;input.stick.cy=e.clientY;
    try{ui.pad.setPointerCapture(e.pointerId);}catch(_){}
  });
  ui.pad.addEventListener("pointermove",e=>{
    if(input.stick.id!==e.pointerId)return;e.preventDefault();moveStick(e);
  });
  ["pointerup","pointercancel","lostpointercapture"].forEach(k=>ui.pad.addEventListener(k,e=>{
    if(e.pointerId===input.stick.id)resetStick();
  }));
  // The uncovered left side of the playing field also accepts a floating stick.
  canvas.addEventListener("pointerdown",e=>{
    if(scene!=="playing"||input.stick.id!==null||e.pointerType==="mouse")return;
    const r=canvas.getBoundingClientRect();
    if(e.clientX>r.left+r.width*.47||e.clientY<r.top+r.height*.35)return;
    e.preventDefault();input.stick.id=e.pointerId;
    input.stick.cx=e.clientX;input.stick.cy=e.clientY;
    try{canvas.setPointerCapture(e.pointerId);}catch(_){}
  });
  canvas.addEventListener("pointermove",e=>{
    if(e.pointerId===input.stick.id){e.preventDefault();moveStick(e)}
  });
  ["pointerup","pointercancel","lostpointercapture"].forEach(k=>canvas.addEventListener(k,e=>{
    if(e.pointerId===input.stick.id)resetStick();
  }));
  ["pointerup","pointercancel"].forEach(k=>window.addEventListener(k,e=>{
    if(e.pointerId===input.stick.id)resetStick();
  }));
  const buttonAction={attack:slash,parry,dash,skill:special};
  for(const [id,fn] of Object.entries(buttonAction)){
    const el=$(id);
    el.addEventListener("pointerdown",e=>{
      if(scene!=="playing")return;e.preventDefault();
      soundInit();fn();el.classList.add("pressed");
      if(id==="attack"){input.attackHeld=true;input.attackTimer=.23}
    });
    const release=()=>{el.classList.remove("pressed");if(id==="attack")input.attackHeld=false};
    for(const type of ["pointerup","pointercancel","lostpointercapture"])el.addEventListener(type,release);
    el.addEventListener("click",e=>{if(e.detail===0){soundInit();fn()}});
  }
  const keys={arrowup:true,arrowdown:true,arrowleft:true,arrowright:true,w:true,a:true,s:true,d:true};
  window.addEventListener("keydown",e=>{
    const k=e.key.toLowerCase();
    const focus=e.target?.closest?.("button,a,input,textarea");
    if(scene==="playing"&&keys[k]&&!focus){e.preventDefault();input.keys.add(k);return}
    if(focus&&k!=="escape")return;
    if(scene==="playing"){
      if(["j","k","l","shift"," ","spacebar"].includes(k))e.preventDefault();
      if(e.repeat&&["j","k","l","shift"," ","spacebar","p","escape"].includes(k))return;
      if(k==="j")slash();
      else if(k==="k")parry();
      else if(k==="l"||k==="shift")dash();
      else if(k===" "||k==="spacebar")special();
      else if(k==="p"||k==="escape")pause();
    }else if(scene==="paused"&&(k==="p"||k==="escape")){e.preventDefault();resume()}
  },{passive:false});
  window.addEventListener("keyup",e=>input.keys.delete(e.key.toLowerCase()));
  window.addEventListener("blur",()=>{input.keys.clear();input.attackHeld=false;resetStick();if(scene==="playing")pause()});
  document.addEventListener("visibilitychange",()=>{if(document.hidden&&scene==="playing")pause()});
  $("pauseBtn").addEventListener("click",pause);
  $("helpBtn").addEventListener("click",()=>{if(scene==="playing")pause();else help()});
  ui.mute.addEventListener("click",()=>{saved.sound=!saved.sound;persist();if(saved.sound){soundInit();tone(432,.27,.022,"sine")}hud()});
  ui.motion.addEventListener("click",()=>{saved.motion=!saved.motion;persist();hud()});
  ui.overlay.addEventListener("click",e=>{
    const b=e.target.closest("[data-action]");if(!b)return;
    const kind=b.dataset.action;
    if(kind==="start"||kind==="restart")startRun();
    else if(kind==="help")help();
    else if(kind==="home"){record();home();}
    else if(kind==="retry")retry();
    else if(kind==="resume")resume();
    else if(kind==="relic")chooseRelic(Number(b.dataset.index));
  });
  function frame(stamp){
    if(!last)last=stamp;
    const dt=clamp((stamp-last)/1000,0,.034);last=stamp;
    if(scene==="playing")update(dt);
    if(scene==="playing"||scene==="over"||scene==="won")updateParticles(dt);
    // Lower background load in menus; the arena is still visible through modal.
    if(scene==="playing"||stamp-rafId>80){render();rafId=stamp}
    requestAnimationFrame(frame);
  }
  home();requestAnimationFrame(frame);
})();
