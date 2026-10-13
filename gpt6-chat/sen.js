"use strict";
(() => {
  const canvas = document.getElementById("garden");
  const ctx = canvas.getContext("2d", { alpha: false });
  const $ = id => document.getElementById(id);
  const TAU = Math.PI * 2, WIDTH = 480, HEIGHT = 700, STORAGE = "kazane-wind-v1";
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const hypot = (x, y) => Math.hypot(x, y);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const dist = (a, b) => hypot(a.x - b.x, a.y - b.y);
  const pos = xy => ({ x: xy[0], y: xy[1] });
  const themes = [
    { name:"第一楽章 / 木漏れ日", title:"風が目を覚ます場所", colors:["#163b50","#265e61","#103b4d"],
      glow:"#c5f7ce", note:"#f6e0a8", stone:"#325968", hills:"#184c50",
      line:"ひとつの息が、森の音になる。" },
    { name:"第二楽章 / 夕映え", title:"金色のひと呼吸", colors:["#353c61","#9a777a","#425c61"],
      glow:"#ffe0b0", note:"#f6c7ca", stone:"#625772", hills:"#71596b",
      line:"夕暮れの色は、まだ誰かを待っている。" },
    { name:"第三楽章 / 星降る夜", title:"星が花に帰る夜", colors:["#181f42","#3e466f","#1b394e"],
      glow:"#d6d4ff", note:"#ffdfb8", stone:"#3c446d", hills:"#25395a",
      line:"忘れた音は、消えたのではなかった。" }
  ];
  // All stage dimensions are authored in a 480 × 700 logical canvas.
  // Goals can always be reached by ordinary wind strokes or keyboard movement.
  const levels = [
    { name:"最初のそよぎ", story:"森が息をしはじめた。ちいさな光を、向こうの花へ。",
      seed:[103,368], flower:[375,355], notes:[[234,362]], rocks:[], eddies:[], movers:[], par:4,
      hint:"種の近くで左から右へ、指をすっと滑らせてみよう。" },
    { name:"木の葉の手紙", story:"まっすぐな風でなくても、きっと届く。",
      seed:[106,558], flower:[371,173], notes:[[225,413]], rocks:[[302,385,44]], eddies:[], movers:[], par:7,
      hint:"音符に寄ってから、右上の花へ。岩に当たっても大丈夫。" },
    { name:"遠回りの音", story:"障害物は、別の景色を教えてくれる。",
      seed:[96,194], flower:[388,527], notes:[[228,190],[304,461]], rocks:[[254,325,62]], eddies:[], movers:[], par:8,
      hint:"中央の石を避け、上と下の音符を拾おう。" },
    { name:"小さな輪唱", story:"ふたつの音が、ひとつの歌をつくる。",
      seed:[88,561], flower:[385,138], notes:[[114,333],[357,337]], rocks:[[229,248,52],[234,493,49]],
      eddies:[[231,373,72,.37]], movers:[], par:10,
      hint:"真ん中の小さな渦は、近づく種に風を添える。" },
    { name:"琥珀の川", story:"水面にも、形のない楽譜がある。",
      seed:[98,545], flower:[379,166], notes:[[276,482]], rocks:[[230,345,53]], eddies:[[326,303,93,-.48]], movers:[], par:8,
      hint:"川の渦を利用するか、岩の横を通ろう。" },
    { name:"風鈴の記憶", story:"鳴らさなかった音が、胸に残っていた。",
      seed:[395,575], flower:[101,139], notes:[[343,386],[145,323]], rocks:[[237,310,54]],
      eddies:[[322,505,77,.54]], movers:[], par:9,
      hint:"まず右の音を拾ってから左へ回り込もう。" },
    { name:"夕焼けの舞", story:"夕空は、少しずつ色を変えてゆく。",
      seed:[100,344], flower:[382,351], notes:[[214,157],[260,541]], rocks:[[243,347,67]],
      eddies:[[151,486,62,-.47]], movers:[[257,233,20,67,.8]], par:11,
      hint:"一直線ではなく、上下の音符を集めよう。光の障害物もゆっくり動く。" },
    { name:"やさしい遠雷", story:"遠くの空が鳴っても、あなたの風はやさしい。",
      seed:[89,605], flower:[378,110], notes:[[114,359],[359,369]], rocks:[[238,250,55],[223,485,55]],
      eddies:[[356,261,82,-.45],[122,474,76,.52]], movers:[[243,365,25,95,.6]], par:12,
      hint:"脇を通る風には速さの変化がある。種を焦らせなくてもいい。" },
    { name:"星のしずく", story:"闇は、光を見つけやすくしてくれる。",
      seed:[91,355], flower:[387,352], notes:[[149,176],[338,526]], rocks:[[240,344,69]],
      eddies:[[151,430,78,.47]], movers:[[242,174,20,61,.95]], par:11,
      hint:"花へ直行せず、上の音符と下の音符を拾おう。" },
    { name:"夜空のゆりかご", story:"眠った星が、風に揺られて目を覚ます。",
      seed:[396,115], flower:[95,582], notes:[[331,305],[151,422]], rocks:[[234,214,51],[266,500,60]],
      eddies:[[126,258,74,-.6]], movers:[[234,362,22,85,.9]], par:12,
      hint:"道は一本ではない。動く光には近づきすぎないように。" },
    { name:"ひとつの宇宙", story:"遠く離れた音も、いつか同じ旋律になる。",
      seed:[91,555], flower:[392,145], notes:[[114,182],[357,527],[246,363]],
      rocks:[[245,230,56],[227,511,50]], eddies:[[360,330,89,.58],[119,405,68,-.49]],
      movers:[[251,385,25,113,.76]], par:14,
      hint:"三つの音を集めよう。渦を味方にすれば、移動が楽になる。" },
    { name:"風の楽譜", story:"森は、もう歌い方を覚えている。最後の種を、光の真ん中へ。",
      seed:[91,601], flower:[385,97], notes:[[364,590],[118,382],[350,224]],
      rocks:[[229,189,58],[245,472,64]], eddies:[[143,242,85,.60],[346,410,92,-.52]],
      movers:[[241,324,29,103,1.06],[165,519,19,51,1.2]], par:15,
      hint:"あわてずに三つの記憶を集めてから、上の花へ。" }
  ];
  let saved = { unlocked:0, grades:Array(levels.length).fill(0), muted:false, still:false, clears:0 };
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE) || "null");
    if (value && typeof value === "object") {
      saved.unlocked = clamp(Number(value.unlocked) || 0, 0, levels.length - 1);
      saved.grades = Array.isArray(value.grades) ? levels.map((_,i) => clamp(Number(value.grades[i]) || 0,0,3)) : saved.grades;
      saved.muted = Boolean(value.muted); saved.still = Boolean(value.still);
      saved.clears = Math.max(0,Number(value.clears)||0);
    }
  } catch (_) {}
  const persist = () => { try { localStorage.setItem(STORAGE, JSON.stringify(saved)); } catch (_) {} };
  const state = { mode:"home", index:0, seed:{x:103,y:368,vx:0,vy:0}, notes:[],
    rocks:[],ed:[],movers:[],breath:1,strokes:0,elapsed:0,musicAt:0,
    particles:[],wakes:[],ripples:[],history:[],noticeTimer:0,windX:0,windY:0,
    held:new Set(),pointer:null,grade:0,levelCleared:false,focus:false };
  const els = { overlay:$("overlay"),dialog:$("dialog"),notice:$("notice"),chapter:$("chapterMark"),
    scene:$("sceneName"),story:$("storyText"),count:$("gardenCount"),progress:$("overallProgress"),
    dots:$("chapterDots"),level:$("levelTitle"),stars:$("stars"),notes:$("notesLabel"),
    strokes:$("strokeLabel"),breath:$("breathFill"),sound:$("soundBtn"),motion:$("motionBtn"),
    undo:$("undoBtn"),reset:$("resetBtn"),pause:$("pauseBtn") };
  let audio = null, now = 0, last = 0, dpr = 1, fxThrottle = 0;
  function initCanvas() {
    dpr = Math.min(1.7, window.devicePixelRatio || 1);
    canvas.width = Math.round(WIDTH * dpr); canvas.height = Math.round(HEIGHT * dpr);
  }
  initCanvas();
  function initAudio() {
    if (saved.muted) return;
    if (!audio) {
      const Constructor = window.AudioContext || window.webkitAudioContext;
      if (Constructor) { try { audio = new Constructor(); } catch (_) {} }
    }
    if (audio && audio.state === "suspended") audio.resume().catch(() => {});
  }
  function tone(freq,duration=.22,vol=.025,shape="sine",offset=0,slide=1) {
    if (saved.muted || !audio || audio.state !== "running") return;
    try {
      const start = audio.currentTime + offset, osc = audio.createOscillator(), gain = audio.createGain();
      osc.type = shape; osc.frequency.setValueAtTime(Math.max(30,freq),start);
      if (slide !== 1) osc.frequency.exponentialRampToValueAtTime(Math.max(30,freq*slide),start+duration);
      gain.gain.setValueAtTime(.0001,start);
      gain.gain.exponentialRampToValueAtTime(Math.max(.0003,vol),start+.023);
      gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
      osc.connect(gain).connect(audio.destination);osc.start(start);osc.stop(start+duration+.018);
    } catch (_) {}
  }
  function sound(name) {
    if (name==="wind") {tone(260,.24,.009,"triangle",0,1.44);tone(650,.15,.006,"sine",.07,1.05);}
    else if (name==="note") [432,576,648].forEach((n,i)=>tone(n,.36,.027,"sine",i*.105,1.02));
    else if (name==="bloom") [432,540,648,864,1080].forEach((n,i)=>tone(n,.72,.036,"sine",i*.14,1.01));
    else if (name==="bump") tone(150,.19,.016,"triangle",0,.7);
    else if (name==="undo") tone(480,.24,.012,"sine",0,.71);
  }
  function music(dt) {
    if (state.mode!=="playing") return;
    state.musicAt-=dt;if(state.musicAt>0)return;
    state.musicAt=1.44;
    const root=[216,192.43,242.45][Math.floor(state.index/4)];
    const sequence=[0,7,12,5,7,14,12,7];
    const n=sequence[Math.floor(state.elapsed/1.44)%sequence.length];
    tone(root*Math.pow(2,n/12),1.18,.005,"sine");
    if (Math.floor(state.elapsed/1.44)%4===0)tone(root/2,3.2,.009,"sine");
  }
  function showNotice(text,time=2) {
    els.notice.textContent=text;els.notice.classList.add("shown");
    state.noticeTimer=time;
  }
  function updateUI() {
    const lvl=levels[state.index],theme=themes[Math.floor(state.index/4)];
    els.chapter.textContent=theme.name;els.scene.textContent=theme.title;
    els.story.textContent=lvl.story;
    els.level.textContent=String(state.index+1).padStart(2,"0")+" — "+lvl.name;
    els.count.textContent=saved.grades.filter(Boolean).length+" / 12";
    els.progress.style.width=(saved.grades.filter(Boolean).length/12*100)+"%";
    els.dots.replaceChildren();
    levels.forEach((level,i)=>{
      const b=document.createElement("span");b.className="dot";
      if (saved.grades[i]) {b.classList.add("completed");b.textContent="✦";}
      else {b.textContent="·";}
      if (i===state.index)b.classList.add("current");
      b.title=(i+1)+" · "+level.name;els.dots.appendChild(b);
    });
    const grade=saved.grades[state.index] || 0;
    els.stars.textContent="★ ".repeat(grade)+"✧ ".repeat(3-grade);
    els.notes.textContent="記憶の音符 "+state.notes.filter(n=>n.taken).length+" / "+state.notes.length;
    els.strokes.textContent="風の筆跡 "+state.strokes;
    els.breath.style.width=(state.breath*100).toFixed(0)+"%";
    els.undo.disabled=state.mode!=="playing" || !state.history.length;
    els.reset.disabled=state.mode!=="playing";
    els.pause.disabled=state.mode!=="playing";
    els.sound.setAttribute("aria-pressed",String(!saved.muted));
    els.sound.setAttribute("aria-label",saved.muted?"サウンドを出す":"サウンドを消す");
    els.sound.textContent=saved.muted?"♪̸":"♫";
    els.motion.setAttribute("aria-pressed",String(saved.still));
    els.motion.setAttribute("aria-label",saved.still?"動きのある演出にする":"演出を静かにする");
    els.motion.textContent=saved.still?"◍":"◌";
  }
  function overlay(content) {
    els.dialog.innerHTML=content;
    els.overlay.classList.remove("hidden");
  }
  function hideOverlay() {els.overlay.classList.add("hidden");}
  function home() {
    state.mode="home";state.pointer=null;state.held.clear();
    state.index=saved.unlocked;
    setupLevel(saved.unlocked);
    const story=saved.unlocked>0?"この庭には、まだあなたを待つ風がある。":"最初の音を、風に預けよう。";
    overlay('<div class="kicker">GPT6 CHAT · A LITTLE JOURNEY</div><span class="symbol">❀</span>'+
      '<h2>風を描けば、<br>森が歌いはじめる。</h2><p>'+story+
      '<br>12の庭に残された記憶を、<br>ひとつずつ花に届けよう。</p>'+
      '<button class="main-button" data-action="start">旅をはじめる ↗</button>'+
      '<button class="secondary-button" data-action="select">庭を選ぶ</button>');
    updateUI();
  }
  function setupLevel(index) {
    const level=levels[index];
    state.index=index;state.seed={...pos(level.seed),vx:0,vy:0};
    state.notes=level.notes.map(([x,y])=>({x,y,taken:false}));
    state.rocks=level.rocks.map(([x,y,r])=>({x,y,r}));
    state.ed=level.eddies.map(([x,y,r,force])=>({x,y,r,force}));
    state.movers=level.movers.map(([x,y,r,amp,speed])=>({baseX:x,baseY:y,x,y,r,amp,speed,angle:rand(0,TAU)}));
    state.breath=1;state.strokes=0;state.elapsed=0;state.musicAt=0;
    state.history=[];state.particles=[];state.wakes=[];state.ripples=[];
    state.levelCleared=false;state.pointer=null;state.held.clear();state.noticeTimer=0;
  }
  function startLevel(index) {
    if (index<0 || index>saved.unlocked || index>=levels.length)return;
    initAudio();setupLevel(index);state.mode="playing";hideOverlay();updateUI();
    showNotice(index===0?"種の近くで風を描こう":"第"+(index+1)+"の庭 · "+levels[index].name,2.4);
  }
  function pause() {
    if (state.mode!=="playing")return;
    state.mode="paused";state.pointer=null;state.held.clear();
    overlay('<div class="kicker">REST BETWEEN BREEZES</div><span class="symbol">☾</span>'+
      '<h2>風の休息</h2><p>この庭は、あなたが戻るまで待っている。</p>'+
      '<button class="main-button" data-action="resume">旅をつづける ↗</button>'+
      '<button class="secondary-button" data-action="select">庭を選ぶ</button>'+
      '<button class="secondary-button" data-action="home">はじめの画面へ</button>');
    updateUI();
  }
  function levelSelect() {
    state.mode="select";state.pointer=null;state.held.clear();
    const tiles=levels.map((lvl,i)=>{
      const unlocked=i<=saved.unlocked, stars=saved.grades[i]||0;
      return '<button class="level-tile'+(i===state.index?' current':'')+'" data-action="load" data-index="'+i+'"'+
       (unlocked?'':' disabled')+' aria-label="'+(i+1)+'番目の庭 '+lvl.name+(unlocked?'':' 未解放')+'">'+
       String(i+1).padStart(2,"0")+'<small>'+(stars?"★".repeat(stars):unlocked?"✧":"⌁")+'</small></button>';
    }).join("");
    overlay('<div class="kicker">THE GARDEN ATLAS</div><span class="symbol">✧</span>'+
      '<h2>どの庭へ行こう。</h2><p>花が咲いた庭にも、いつでも帰れる。</p>'+
      '<div class="level-grid">'+tiles+'</div>'+
      '<button class="secondary-button" data-action="home">もどる</button>');
    updateUI();
  }
  function capture() {
    return { x:state.seed.x,y:state.seed.y,vx:state.seed.vx,vy:state.seed.vy,
      notes:state.notes.map(n=>n.taken),breath:state.breath,strokes:state.strokes };
  }
  function undo() {
    if (state.mode!=="playing" || !state.history.length)return;
    const prev=state.history.pop();
    Object.assign(state.seed,{x:prev.x,y:prev.y,vx:prev.vx,vy:prev.vy});
    state.notes.forEach((n,i)=>n.taken=prev.notes[i]);
    state.breath=prev.breath;state.strokes=prev.strokes;
    state.wakes.length=0;state.ripples.push({x:prev.x,y:prev.y,r:8,life:.5,max:.5,color:"#c7eeda"});
    sound("undo");showNotice("風をひとつ、巻き戻した",1.3);updateUI();
  }
  function restart() {if(state.mode==="playing"){startLevel(state.index);showNotice("もう一度、最初の風から",1.5);}}
  function hint() {
    if(state.mode!=="playing")return;
    showNotice(levels[state.index].hint,4.3);
    state.focus=true;
  }
  function bloom() {
    if (state.mode!=="playing" || state.levelCleared)return;
    state.levelCleared=true;state.mode="cleared";state.held.clear();state.pointer=null;
    const level=levels[state.index];
    const efficiency=state.strokes + state.elapsed/22;
    const grade=efficiency<=level.par+2?3:efficiency<=level.par*1.9+3?2:1;
    const old=saved.grades[state.index] || 0;
    saved.grades[state.index]=Math.max(old,grade);
    saved.unlocked=Math.max(saved.unlocked,Math.min(levels.length-1,state.index+1));
    if(state.index===levels.length-1)saved.clears++;
    persist();
    const score="★ ".repeat(grade).trim();
    burst(level.flower[0],level.flower[1],70,themes[Math.floor(state.index/4)].glow,2.6);
    state.ripples.push({x:level.flower[0],y:level.flower[1],r:5,life:1.9,max:1.9,color:"#ffe1b1"});
    sound("bloom");updateUI();
    if(state.index===levels.length-1) {
      overlay('<div class="kicker">THE WHOLE FOREST REMEMBERS</div><span class="symbol">✺</span>'+
        '<h2>森が、歌を思い出した。</h2><p>音は、どこかから生まれるのではない。<br>あなたが風を描いた、その場所から。</p>'+
        '<div class="score">'+score+'</div><p class="new-best">'+(grade>old?"新しい記録":"風が花を咲かせた")+'</p>'+
        '<button class="main-button" data-action="select">十二の庭へ ↗</button>'+
        '<button class="secondary-button" data-action="home">はじめの画面へ</button>');
    } else {
      const ending=(state.index===3 || state.index===7)?"<p class='emphasis'>"+themes[Math.floor(state.index/4)].line+"</p>":"";
      overlay('<div class="kicker">GARDEN '+String(state.index+1).padStart(2,"0")+' · BLOOMED</div><span class="symbol">✿</span>'+
        '<h2>'+level.name+'に、花が咲いた。</h2>'+
        '<p>届けてくれて、ありがとう。<br>次の音も、きっと待っている。</p>'+
        ending+'<div class="score">'+score+'</div>'+
        '<p class="new-best">'+(grade>old?"NEW BEST · ":"")+"風の筆跡 "+state.strokes+' · '+Math.floor(state.elapsed)+'秒</p>'+
        '<button class="main-button" data-action="next">次の庭へ ↗</button>'+
        '<button class="secondary-button" data-action="select">庭を選ぶ</button>');
    }
  }
  function burst(x,y,count,color,energy=1) {
    const n=saved.still?Math.ceil(count*.24):count;
    for(let i=0;i<n&&state.particles.length<240;i++){
      const a=rand(0,TAU),v=rand(28,138)*energy,l=rand(.4,1.2);
      state.particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,
        r:rand(1,3.5),life:l,max:l,color});
    }
  }
  function windSegment(a,b) {
    const dx=b.x-a.x,dy=b.y-a.y,len=hypot(dx,dy);
    if(len<.8)return;
    const seed=state.seed;
    const t=clamp(((seed.x-a.x)*dx+(seed.y-a.y)*dy)/(len*len),0,1);
    const x=a.x+dx*t,y=a.y+dy*t,d=hypot(seed.x-x,seed.y-y);
    const radius=155, influence=Math.pow(clamp(1-d/radius,0,1),1.2);
    const power=.48+state.breath*.52;
    if(influence>0){
      seed.vx+=clamp(dx*3.5*influence*power,-140,140);
      seed.vy+=clamp(dy*3.5*influence*power,-140,140);
      capVelocity();
    }
    state.breath=clamp(state.breath-len*.00038,0,1);
    if(!saved.still){
      const points=Math.min(12,Math.max(1,Math.ceil(len/19)));
      for(let i=0;i<points && state.particles.length<220;i++){
        const tt=(i+.3)/points;
        const px=lerp(a.x,b.x,tt),py=lerp(a.y,b.y,tt);
        const life=rand(.27,.62);
        state.particles.push({x:px,y:py,vx:dx/len*rand(25,73),vy:dy/len*rand(25,73),
          r:rand(.8,2.5),life,max:life,color:"#e2ffe2"});
      }
    }
    state.wakes.push({ax:a.x,ay:a.y,bx:b.x,by:b.y,life:.53,max:.53});
    if(state.wakes.length>60)state.wakes.splice(0,state.wakes.length-60);
  }
  function capVelocity() {
    const p=state.seed,v=hypot(p.vx,p.vy),max=425;
    if(v>max){p.vx=p.vx/v*max;p.vy=p.vy/v*max;}
  }
  function relativePoint(e) {
    const r=canvas.getBoundingClientRect();
    return {x:clamp((e.clientX-r.left)/Math.max(1,r.width)*WIDTH,0,WIDTH),
      y:clamp((e.clientY-r.top)/Math.max(1,r.height)*HEIGHT,0,HEIGHT)};
  }
  canvas.addEventListener("pointerdown",e=>{
    if(state.mode!=="playing" || state.pointer)return;
    e.preventDefault();initAudio();
    const point=relativePoint(e);
    state.pointer={id:e.pointerId,last:point,travel:0,charged:false,before:capture()};
    try{canvas.setPointerCapture(e.pointerId);}catch(_){}
  });
  canvas.addEventListener("pointermove",e=>{
    const p=state.pointer;if(state.mode!=="playing"||!p||e.pointerId!==p.id)return;
    e.preventDefault();
    const next=relativePoint(e),len=dist(next,p.last);
    if(len>.4){
      if(!p.charged && p.travel+len>8) {
        p.charged=true;
        state.history.push(p.before);if(state.history.length>30)state.history.shift();
        state.strokes++;updateUI();
      }
      if(p.charged)windSegment(p.last,next);
      p.travel+=len;p.last=next;
    }
  });
  function endPointer(e) {
    const p=state.pointer;if(!p||e.pointerId!==p.id)return;
    if(p.charged&&state.mode==="playing")sound("wind");
    state.pointer=null;updateUI();
  }
  ["pointerup","pointercancel","lostpointercapture"].forEach(k=>canvas.addEventListener(k,endPointer));
  canvas.addEventListener("contextmenu",e=>e.preventDefault());
  const keyDirections={arrowleft:[-1,0],a:[-1,0],arrowright:[1,0],d:[1,0],
    arrowup:[0,-1],w:[0,-1],arrowdown:[0,1],s:[0,1]};
  window.addEventListener("keydown",e=>{
    const k=e.key.toLowerCase();
    const target=e.target,interactive=target && target.closest && target.closest("button,a,input");
    if(k in keyDirections && state.mode==="playing") {
      if(!interactive){e.preventDefault();if(!state.held.size){state.history.push(capture());
        if(state.history.length>30)state.history.shift();state.strokes++;updateUI();}
        state.held.add(k);}
    } else if(k==="escape") {
      if(state.mode==="playing")pause();else if(state.mode==="paused")resume();
    } else if(!interactive&&state.mode==="playing"&&k==="z"&&!e.repeat)undo();
    else if(!interactive&&state.mode==="playing"&&k==="h"&&!e.repeat)hint();
  },{passive:false});
  window.addEventListener("keyup",e=>state.held.delete(e.key.toLowerCase()));
  window.addEventListener("blur",()=>{state.held.clear();if(state.mode==="playing")pause();});
  document.addEventListener("visibilitychange",()=>{if(document.hidden&&state.mode==="playing")pause();});
  function resume() {if(state.mode==="paused"){state.mode="playing";hideOverlay();initAudio();updateUI();}}
  els.overlay.addEventListener("click",e=>{
    const button=e.target.closest("[data-action]");if(!button)return;
    switch(button.dataset.action){
      case "start":startLevel(saved.unlocked);break;
      case "resume":resume();break;
      case "home":home();break;
      case "select":levelSelect();break;
      case "next":startLevel(Math.min(levels.length-1,state.index+1));break;
      case "load":startLevel(Number(button.dataset.index));break;
    }
  });
  $("selectBtn").addEventListener("click",levelSelect);
  $("undoBtn").addEventListener("click",undo);
  $("resetBtn").addEventListener("click",restart);
  $("hintBtn").addEventListener("click",hint);
  $("pauseBtn").addEventListener("click",pause);
  els.sound.addEventListener("click",()=>{
    saved.muted=!saved.muted;persist();
    if(!saved.muted){initAudio();sound("note");}updateUI();
  });
  els.motion.addEventListener("click",()=>{saved.still=!saved.still;persist();updateUI();});
  function resolveCollision(ob,r,restitution=.54){
    const seed=state.seed,dx=seed.x-ob.x,dy=seed.y-ob.y;
    const d=Math.max(.001,hypot(dx,dy)),min=r+11;
    if(d>=min)return;
    const nx=dx/d,ny=dy/d;
    seed.x=ob.x+nx*min;seed.y=ob.y+ny*min;
    const inward=seed.vx*nx+seed.vy*ny;
    if(inward<0){seed.vx-=(1+restitution)*inward*nx;seed.vy-=(1+restitution)*inward*ny;}
    seed.vx*=.93;seed.vy*=.93;
    if(fxThrottle<=0){fxThrottle=.17;burst(seed.x,seed.y,4,"#c1e5de",.4);sound("bump");}
  }
  function update(dt) {
    state.elapsed+=dt;fxThrottle-=dt;state.breath=clamp(state.breath+dt*.13,0,1);
    const seed=state.seed,lvl=levels[state.index];
    const axes=[0,0];
    for(const k of state.held){
      const direction=keyDirections[k];if(direction){axes[0]+=direction[0];axes[1]+=direction[1];}
    }
    const length=hypot(axes[0],axes[1]);
    if(length){
      const power=470*(.5+.5*state.breath);
      seed.vx+=axes[0]/length*power*dt;seed.vy+=axes[1]/length*power*dt;
      state.breath=clamp(state.breath-dt*.07,0,1);
      if(Math.random()<dt*25&&!saved.still)burst(seed.x,seed.y,1,"#eaffdf",.16);
    }
    state.ed.forEach(v=>{
      const dx=seed.x-v.x,dy=seed.y-v.y,d=hypot(dx,dy);
      if(d<v.r && d>2){
        const strength=(1-d/v.r)*v.force;
        seed.vx+=-dy/d*strength*165*dt;seed.vy+=dx/d*strength*165*dt;
      }
    });
    const goal=pos(lvl.flower);
    const nearest=state.notes.find(n=>!n.taken);
    const attractor=nearest||goal;
    const dd=dist(seed,attractor);
    if(dd<67){
      const strength=(1-dd/67)*190*dt;
      seed.vx+=(attractor.x-seed.x)/Math.max(1,dd)*strength;
      seed.vy+=(attractor.y-seed.y)/Math.max(1,dd)*strength;
    }
    capVelocity();
    const drag=Math.exp(-1.67*dt);
    seed.vx*=drag;seed.vy*=drag;
    seed.x+=seed.vx*dt;seed.y+=seed.vy*dt;
    const bounds={left:26,right:WIDTH-26,top:64,bottom:HEIGHT-50};
    if(seed.x<bounds.left){seed.x=bounds.left;seed.vx=Math.abs(seed.vx)*.37;}
    if(seed.x>bounds.right){seed.x=bounds.right;seed.vx=-Math.abs(seed.vx)*.37;}
    if(seed.y<bounds.top){seed.y=bounds.top;seed.vy=Math.abs(seed.vy)*.37;}
    if(seed.y>bounds.bottom){seed.y=bounds.bottom;seed.vy=-Math.abs(seed.vy)*.37;}
    state.rocks.forEach(o=>resolveCollision(o,o.r));
    state.movers.forEach(m=>{
      m.x=m.baseX+Math.sin(state.elapsed*m.speed+m.angle)*m.amp;
      m.y=m.baseY+Math.cos(state.elapsed*m.speed*.7+m.angle)*m.amp*.35;
      resolveCollision(m,m.r,.67);
    });
    for(const note of state.notes){
      if(note.taken || dist(note,seed)>31)continue;
      note.taken=true;burst(note.x,note.y,18,themes[Math.floor(state.index/4)].note,.9);
      state.ripples.push({x:note.x,y:note.y,r:7,life:.75,max:.75,color:"#ffecb3"});
      sound("note");
      if(state.notes.every(n=>n.taken))showNotice("すべての音が揃った · 花へ",1.85);
      else showNotice("記憶の音を見つけた",1.55);
      updateUI();
    }
    if(state.notes.every(n=>n.taken) && dist(seed,goal)<40){bloom();return;}
    if(state.noticeTimer>0){
      state.noticeTimer-=dt;
      if(state.noticeTimer<=0){els.notice.classList.remove("shown");state.focus=false;}
    }
    music(dt);
  }
  function updateEffects(dt){
    for(let i=state.particles.length-1;i>=0;i--){
      const p=state.particles[i];p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;
      p.vx*=Math.exp(-2*dt);p.vy*=Math.exp(-2*dt);
      if(p.life<=0)state.particles.splice(i,1);
    }
    for(let i=state.wakes.length-1;i>=0;i--){
      const w=state.wakes[i];w.life-=dt;if(w.life<=0)state.wakes.splice(i,1);
    }
    for(let i=state.ripples.length-1;i>=0;i--){
      const r=state.ripples[i];r.life-=dt;r.r+=dt*125;
      if(r.life<=0)state.ripples.splice(i,1);
    }
  }
  function rounded(x,y,w,h,r) {
    ctx.beginPath();ctx.roundRect(x,y,w,h,r);
  }
  function leaf(x,y,r,angle,color,opacity=1){
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.globalAlpha*=opacity;
    ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,-r);
    ctx.quadraticCurveTo(r*.78,-r*.33,0,r);
    ctx.quadraticCurveTo(-r*.8,r*.15,0,-r);ctx.fill();
    ctx.restore();
  }
  function circle(x,y,r,color) {
    ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();
  }
  function backdrop(theme,t) {
    const colors=theme.colors,g=ctx.createLinearGradient(0,0,WIDTH,HEIGHT);
    g.addColorStop(0,colors[0]);g.addColorStop(.65,colors[1]);g.addColorStop(1,colors[2]);
    ctx.fillStyle=g;ctx.fillRect(0,0,WIDTH,HEIGHT);
    const sky=ctx.createRadialGradient(WIDTH*.67,130,5,WIDTH*.58,200,440);
    sky.addColorStop(0,"rgba(255,243,201,.13)");sky.addColorStop(1,"rgba(214,246,216,0)");
    ctx.fillStyle=sky;ctx.fillRect(0,0,WIDTH,HEIGHT);
    for(let i=0;i<16;i++){
      const x=(i*57+37)%WIDTH,y=(i*123+31)%HEIGHT;
      const a=.08+.1*Math.sin(t*.4+i);
      circle(x,y,1.4+(i%3)*.6,"rgba(240,248,226,"+a+")");
    }
    // The landscape is fixed in world coordinates; tiny animation is only atmosphere.
    for(let layer=0;layer<3;layer++){
      const base=510+layer*82;
      ctx.beginPath();ctx.moveTo(0,HEIGHT);
      ctx.lineTo(0,base);
      for(let x=0;x<=WIDTH+20;x+=16){
        const y=base+Math.sin(x*.015+layer*2.6)*31+Math.cos(x*.027+layer*.8)*16;
        ctx.lineTo(x,y);
      }
      ctx.lineTo(WIDTH,HEIGHT);ctx.closePath();
      ctx.fillStyle=layer===0?"rgba(10,43,58,.12)":layer===1?"rgba(10,43,56,.2)":"rgba(8,29,46,.46)";
      ctx.fill();
    }
    ctx.save();ctx.globalAlpha=.12;
    for(let i=0;i<26;i++){
      const x=((i*83+43)%WIDTH),y=((i*107+88)%HEIGHT);
      leaf(x,y,7+(i%4)*3,i*.73+Math.sin(t*.13+i)*.07,theme.glow);
    }
    ctx.restore();
    ctx.strokeStyle="rgba(255,246,211,.12)";
    ctx.lineWidth=1;rounded(18,50,WIDTH-36,HEIGHT-96,24);ctx.stroke();
    // Thin reeds at the edge keep the viewport framing consistently botanical.
    ctx.save();ctx.strokeStyle=theme.glow;ctx.globalAlpha=.18;ctx.lineWidth=1.1;
    for(let i=0;i<8;i++){
      const x=20+i*66;
      ctx.beginPath();ctx.moveTo(x,HEIGHT-24);ctx.quadraticCurveTo(x-13,HEIGHT-82,x+14,HEIGHT-128-i%3*12);ctx.stroke();
      leaf(x+14,HEIGHT-128-i%3*12,7,.4,theme.glow,.7);
    }
    ctx.restore();
  }
  function drawObstacles(theme,t) {
    const lvl=levels[state.index];
    for(const ed of state.ed){
      const r=ed.r;
      ctx.save();ctx.translate(ed.x,ed.y);
      ctx.strokeStyle=theme.glow;ctx.globalAlpha=.2;ctx.lineWidth=2;
      for(let i=0;i<3;i++){
        ctx.beginPath();ctx.arc(0,0,r*(.34+i*.27),(ed.force>0?1:-1)*t*.22+i,
          (ed.force>0?1:-1)*t*.22+i+Math.PI*1.38);ctx.stroke();
      }
      ctx.globalAlpha=.35;ctx.fillStyle=theme.glow;
      for(let i=0;i<6;i++){
        const a=i*TAU/6+t*.24*(ed.force>0?1:-1);
        circle(Math.cos(a)*r*.74,Math.sin(a)*r*.74,2,theme.glow);
      }
      ctx.restore();
    }
    for(const rock of state.rocks){
      const shadow=ctx.createRadialGradient(rock.x-8,rock.y-11,0,rock.x,rock.y,rock.r+13);
      shadow.addColorStop(0,"rgba(226,246,227,.13)");shadow.addColorStop(.75,theme.stone);
      shadow.addColorStop(1,"rgba(12,31,51,.74)");
      ctx.save();ctx.shadowColor="#061b31";ctx.shadowBlur=14;
      circle(rock.x,rock.y,rock.r,shadow);ctx.shadowBlur=0;
      ctx.strokeStyle="rgba(227,244,232,.3)";ctx.lineWidth=1.6;
      ctx.beginPath();ctx.arc(rock.x,rock.y,rock.r-7,3.15,5.73);ctx.stroke();
      for(let i=0;i<5;i++){
        const a=i*TAU/5+.27;
        leaf(rock.x+Math.cos(a)*rock.r*.79,rock.y+Math.sin(a)*rock.r*.76,5,a,theme.glow,.55);
      }
      ctx.restore();
    }
    for(const m of state.movers){
      ctx.save();ctx.shadowColor=theme.glow;ctx.shadowBlur=25;
      circle(m.x,m.y,m.r,"rgba(238,236,255,.25)");
      ctx.strokeStyle=theme.glow;ctx.lineWidth=1.6;ctx.beginPath();ctx.arc(m.x,m.y,m.r+5,0,TAU);ctx.stroke();
      ctx.rotate(t*.3);
      for(let i=0;i<7;i++){
        const a=i*TAU/7;
        leaf(m.x+Math.cos(a)*m.r*.58,m.y+Math.sin(a)*m.r*.58,11,a,theme.glow,.5);
      }
      ctx.restore();
    }
  }
  function drawFlower(theme,t){
    const flower=pos(levels[state.index].flower);
    const ready=state.notes.every(n=>n.taken);
    ctx.save();ctx.translate(flower.x,flower.y);
    const halo=ctx.createRadialGradient(0,0,3,0,0,85);
    halo.addColorStop(0,ready?"rgba(255,241,189,.48)":"rgba(218,245,216,.15)");
    halo.addColorStop(1,"rgba(236,245,210,0)");
    circle(0,0,86,halo);
    ctx.rotate(saved.still?0:t*.11);
    for(let i=0;i<8;i++){
      const angle=i*TAU/8+Math.PI/8;
      leaf(Math.cos(angle)*28,Math.sin(angle)*28,27,
        angle+(ready?Math.sin(t*1.8+i)*.035:0),ready?theme.note:"#89adb1",ready?1:.45);
    }
    ctx.globalAlpha=.9;circle(0,0,ready?21:14,ready?"#fff0c0":"#acc8bc");
    ctx.fillStyle="#3c6672";ctx.font="22px Georgia";ctx.textAlign="center";
    ctx.fillText(ready?"✦":"✧",0,7);
    ctx.restore();
    ctx.save();ctx.strokeStyle=ready?theme.note:"rgba(185,222,208,.45)";
    ctx.globalAlpha=ready?.65:.26;ctx.lineWidth=1.2;ctx.setLineDash([3,8]);
    ctx.beginPath();ctx.arc(flower.x,flower.y,51+Math.sin(t*2)*2,0,TAU);ctx.stroke();
    ctx.setLineDash([]);ctx.restore();
  }
  function drawNotes(theme,t){
    for(let i=0;i<state.notes.length;i++){
      const note=state.notes[i];if(note.taken)continue;
      const y=note.y+Math.sin(t*2.1+i)*3.3;
      ctx.save();ctx.translate(note.x,y);ctx.rotate(Math.sin(t*.9+i)*.18);
      ctx.shadowColor=theme.note;ctx.shadowBlur=19;
      circle(0,0,14,theme.note);
      ctx.shadowBlur=0;ctx.fillStyle="#46666c";ctx.font="19px Georgia";ctx.textAlign="center";
      ctx.fillText(["♪","♫","✧"][i%3],0,6);
      ctx.strokeStyle="rgba(255,242,206,.6)";ctx.lineWidth=1.5;
      ctx.beginPath();ctx.arc(0,0,24,0,TAU);ctx.stroke();
      ctx.restore();
    }
  }
  function drawWind(theme){
    for(const w of state.wakes){
      const a=clamp(w.life/w.max,0,1);
      ctx.save();ctx.globalAlpha=a*.66;
      ctx.strokeStyle=theme.glow;ctx.shadowColor=theme.glow;ctx.shadowBlur=14;
      ctx.lineCap="round";ctx.lineWidth=2+a*3;
      ctx.beginPath();ctx.moveTo(w.ax,w.ay);ctx.quadraticCurveTo((w.ax+w.bx)/2,(w.ay+w.by)/2-6,w.bx,w.by);ctx.stroke();ctx.restore();
    }
    for(const r of state.ripples){
      ctx.save();ctx.globalAlpha=.8*r.life/r.max;ctx.strokeStyle=r.color;
      ctx.lineWidth=2;ctx.shadowColor=r.color;ctx.shadowBlur=12;
      ctx.beginPath();ctx.arc(r.x,r.y,r.r,0,TAU);ctx.stroke();ctx.restore();
    }
    for(const particle of state.particles){
      ctx.save();ctx.globalAlpha=clamp(particle.life/particle.max,0,1);
      ctx.shadowColor=particle.color;ctx.shadowBlur=9;
      circle(particle.x,particle.y,particle.r,particle.color);ctx.restore();
    }
  }
  function drawSeed(theme,t){
    const p=state.seed,flower=pos(levels[state.index].flower);
    ctx.save();
    ctx.globalAlpha=.32;circle(p.x,p.y+14,20,"#0c3045");
    ctx.globalAlpha=1;ctx.translate(p.x,p.y);
    const v=hypot(p.vx,p.vy);
    const tilt=clamp(p.vx/425,-1,1)*.24;
    ctx.rotate(tilt);
    ctx.shadowColor=theme.glow;ctx.shadowBlur=25;
    ctx.fillStyle="#e7f9dc";ctx.beginPath();ctx.ellipse(0,0,10.7,14.2,0,0,TAU);ctx.fill();
    ctx.shadowBlur=0;
    const core=ctx.createLinearGradient(-8,-14,10,14);
    core.addColorStop(0,"#fff9e4");core.addColorStop(1,theme.glow);
    ctx.fillStyle=core;ctx.beginPath();ctx.ellipse(0,0,8.2,11.5,0,0,TAU);ctx.fill();
    leaf(-8,-13,13,-.73,theme.glow,.8);
    leaf(8,-13,13,.78,"#fff2c6",.85);
    circle(-3,-1,1.4,"#416a72");circle(3,-1,1.4,"#416a72");
    ctx.strokeStyle="#497579";ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(0,3,2.6,.1,Math.PI-.1);ctx.stroke();
    ctx.restore();
    // A quiet compass only appears while the user requests a hint.
    if(state.focus){
      const next=state.notes.find(n=>!n.taken)||flower;
      const a=Math.atan2(next.y-p.y,next.x-p.x);
      ctx.save();ctx.globalAlpha=.52;ctx.strokeStyle=theme.note;ctx.lineWidth=1.6;
      ctx.setLineDash([3,8]);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(next.x,next.y);ctx.stroke();
      ctx.setLineDash([]);
      ctx.translate(p.x+Math.cos(a)*41,p.y+Math.sin(a)*41);ctx.rotate(a);
      ctx.fillStyle=theme.note;ctx.beginPath();ctx.moveTo(8,0);ctx.lineTo(-5,-5);ctx.lineTo(-2,0);ctx.lineTo(-5,5);ctx.closePath();ctx.fill();ctx.restore();
    }
  }
  function render() {
    ctx.setTransform(dpr,0,0,dpr,0,0);
    const theme=themes[Math.floor(state.index/4)],t=saved.still?0:now;
    backdrop(theme,t);drawObstacles(theme,t);drawFlower(theme,t);
    drawNotes(theme,t);drawWind(theme);drawSeed(theme,t);
    ctx.save();ctx.globalAlpha=.52;ctx.fillStyle=theme.glow;
    ctx.font="10px Georgia";ctx.textAlign="right";ctx.fillText("GARDEN "+String(state.index+1).padStart(2,"0")+" / 12",452,46);
    ctx.restore();
  }
  function frame(timestamp) {
    if(!last)last=timestamp;
    const dt=clamp((timestamp-last)/1000,0,.032);last=timestamp;
    now+=dt;
    if(state.mode==="playing")update(dt);
    if(state.mode==="playing"||state.mode==="cleared")updateEffects(dt);
    render();requestAnimationFrame(frame);
  }
  home();requestAnimationFrame(frame);
})();
