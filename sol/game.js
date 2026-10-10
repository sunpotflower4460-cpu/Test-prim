(function () {
  'use strict';
  const T = window.Tide, $ = id => document.getElementById(id);
  const LEVELS = window.TideLevels.map(spec => { const l = T.parse(spec); const solution = T.solve(l, undefined, true); if (!solution) throw Error('航路が閉じています: ' + l.id); l.par = solution.length; return l; });
  const CHAPTERS = [
    { name: '夕凪の群島', en: '01 / THE AMBER SEA', description: '潮を覚え、小さな手紙を届ける。', story: '海に道はない。\nでも、待っている人はいる。\n\nあなたは、この群島の新しい郵便屋です。\nまずは小さな灯台へ、最初の手紙を。' },
    { name: '霧の海路', en: '02 / THE MIST SEA', description: '流れを借りて、見えない岸へ。', story: '沖に出ると、舟よりも大きな流れがある。\n逆らうばかりでは、たどり着けない。\n\n満ち潮の力を借りて、\n霧の向こうの灯りを探しましょう。' },
    { name: '星見の海', en: '03 / THE MIDNIGHT SEA', description: '遠い海をつなぎ、最後の灯りへ。', story: '夜の海には、不思議な輪が浮かぶ。\n遠く離れた海を、つなぐ潮の門。\n\n最後の手紙が、あなたを待っています。\nその宛先は、まだ誰も知らない灯台。' }
  ];
  const STORAGE = 'aftertide-sol-v1';
  let raw = null; try { raw = JSON.parse(localStorage.getItem(STORAGE) || 'null'); } catch (_) {}
  let save = T.cleanSave(raw, LEVELS), stored = true;
  let scene = 'title', index = 0, state = null, visualState = null, history = [], commands = [], busy = false, finished = false, hint = null, preview = null, modalKind = null, focusBefore = null, activeSession = null;
  let toastTimer, announceTimer, completionTimer;
  const sound = new TideSound();
  sound.settings(save.music, save.effects);
  const motion = () => save.motion && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sea = new SeaArt($('sea'), () => { if (scene === 'play') positionTiles(); });
  const current = () => LEVELS[index];
  if (save.voyage) {
    index = LEVELS.findIndex(l => l.id === save.voyage.id);
    state = T.initial(current());
    for (const action of save.voyage.actions) { history.push({...state}); state = T.step(current(),state,action).state; commands.push(action); }
    activeSession = {index,state,history,commands};
  }
  const persist = () => { try { localStorage.setItem(STORAGE, JSON.stringify(save)); stored = true; } catch (_) { stored = false; } };
  const esc = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const completed = () => LEVELS.filter(l => save.records[l.id]).length;
  const stars = () => Object.values(save.records).reduce((sum, r) => sum + r.stars, 0);
  const unlocked = i => i === 0 || !!save.records[LEVELS[i - 1].id];
  function setView(value) {
    scene = value; $('app').dataset.scene = value;
    for (const id of ['title','play','chart']) $(id).hidden = id !== value;
    $('app').dataset.chapter = current().chapter;
    sea.set({ scene, chapter: current().chapter, level: scene === 'play' ? current() : null, state, area: $('boardArea'), motion: motion(), hint, preview, finished });
    sound.scene(current().chapter, value === 'play' || value === 'title' || value === 'ending');
    if (value === 'title') updateTitle();
    if (value === 'chart') buildChart();
    if (value === 'play') { updateHUD(); buildTiles(); }
  }
  function updateArt() { sea.set({ ...sea.view, scene, chapter: current().chapter, state: visualState || state, motion: motion(), hint, preview, finished }); }
  function updateTitle() {
    const n = completed();
    $('start').firstElementChild.textContent = activeSession ? '航路をつづける' : n === LEVELS.length ? 'もう一度、海へ' : n ? '航路をつづける' : '最初の航路へ';
    $('titleRecord').textContent = activeSession ? current().name + ' · ' + activeSession.state.turns + ' 手目から' : n ? '届けた手紙 ' + n + ' / 18 航路　·　記録 ' + stars() + ' / 54' : '一手ずつ進む。急がなくていい。';
  }
  function toast(text) { $('toast').textContent = text; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3300); }
  function announce(text) { $('announcement').textContent = text; $('announcement').classList.add('show'); clearTimeout(announceTimer); announceTimer = setTimeout(() => $('announcement').classList.remove('show'), 2800); }
  function openModal(kind, html) {
    focusBefore = document.activeElement; modalKind = kind; $('modal').dataset.kind = kind;
    $('modalCard').innerHTML = html; $('modal').hidden = false;
    for (const id of ['title','play','chart']) $(id).inert = true;
    if (kind !== 'result' && kind !== 'letter') sound.scene(current().chapter, false);
    $('modalCard').focus();
  }
  function closeModal() {
    $('modal').hidden = true; modalKind = null;
    for (const id of ['title','play','chart']) $(id).inert = false;
    if (focusBefore?.isConnected && !focusBefore.closest('[hidden]')) focusBefore.focus();
    sound.scene(current().chapter, scene === 'play' || scene === 'title' || scene === 'ending');
  }
  const closeButton = '<button class="modal-close" data-ui="close" aria-label="閉じる">×</button>';
  function intro(next) {
    const c = CHAPTERS[LEVELS[next].chapter];
    openModal('intro', '<p class="eyebrow">'+c.en+'</p><h2 id="modalTitle">'+c.name+'</h2><p style="white-space:pre-line">'+c.story+'</p><button class="primary" data-ui="embark" data-index="'+next+'"><span>舟を出す</span><span>↗</span></button>');
  }
  function startLevel(next, showIntro = false) {
    if (!unlocked(next)) return;
    sound.unlock(); clearTimeout(completionTimer);
    index = next; state = T.initial(current()); history = []; busy = false; finished = false; hint = null; preview = null;
    visualState = null; commands = []; save.last = current().id; save.voyage = {id:current().id,actions:[]}; persist(); activeSession = { index, state, history, commands };
    setView('play'); $('announcement').classList.remove('show');
    if (showIntro) intro(next); else { $('boardArea').focus({preventScroll:true}); announce(current().note); }
  }
  function resumeIndex() {
    const last=LEVELS.findIndex(l=>l.id===save.last);
    if (unlocked(last)&&!save.records[LEVELS[last].id]) return last;
    const next=LEVELS.findIndex((l,i)=>unlocked(i)&&!save.records[l.id]);
    return next<0?LEVELS.length-1:next;
  }
  function updateHUD() {
    const l = current(), c = CHAPTERS[l.chapter], display = visualState || state;
    $('chapterName').textContent = c.en; $('levelName').textContent = l.name;
    $('boardIndex').textContent = 'VOYAGE ' + String(index + 1).padStart(2,'0') + ' / 18';
    $('boardCaption').textContent = c.name + '　·　最短 ' + l.par + ' 手（貝殻全部）';
    $('tideDisplay').classList.toggle('high', !!display.tide);
    $('tideName').textContent = display.tide ? '満ち潮' : '引き潮'; $('tideSymbol').textContent = display.tide ? '◓' : '◒';
    $('tideRule').textContent = display.tide ? '浅瀬を渡れる · 矢印に流される' : '浅瀬は通れない · 潮流は止まる';
    $('tideNext').textContent = display.tide ? '一手のあと：引き潮' : '一手のあと：満ち潮';
    $('mailCount').textContent = T.count(display.mail) + ' / ' + l.mail.length;
    $('shellCount').textContent = T.count(display.shells) + ' / ' + l.shells.length;
    $('turnCount').textContent = display.turns; $('levelNote').textContent = l.note;
    $('undo').disabled = busy || !history.length;
    for (const b of document.querySelectorAll('[data-action]')) { b.disabled = busy || finished; b.classList.toggle('hinted', hint === b.dataset.action); }
    $('hint').disabled = busy || finished;
    $('play').dataset.x = state.x; $('play').dataset.y = state.y; $('play').dataset.tide = state.tide;
    $('play').dataset.mail = state.mail; $('play').dataset.shells = state.shells; $('play').dataset.busy = busy; $('play').dataset.turns = state.turns;
    updateArt(); updateTiles();
  }
  function buildTiles() {
    const container = $('tileButtons'); container.replaceChildren();
    for (let y=0;y<current().height;y++) for(let x=0;x<current().width;x++) {
      if(T.tile(current(),x,y)==='#')continue;
      const b=document.createElement('button');b.type='button';b.className='tile-hit';b.dataset.x=x;b.dataset.y=y;
      b.addEventListener('click',()=> { const dx=x-state.x,dy=y-state.y;const a=T.ACTIONS.find(a=>a!=='A'&&T.DIRS[a][0]===dx&&T.DIRS[a][1]===dy);if(a)act(a); });
      b.addEventListener('pointerenter',()=> { if(b.dataset.action&&!busy&&!finished){preview=b.dataset.action;updateArt();} });
      b.addEventListener('pointerleave',()=>{preview=null;updateArt();});
      b.addEventListener('focus',()=>{if(b.dataset.action){preview=b.dataset.action;updateArt();}});
      b.addEventListener('blur',()=>{preview=null;updateArt();});
      container.append(b);
    }
    positionTiles(); updateTiles();
  }
  const tileNames = { '.':'海', '~':'浅瀬', '^':'北への潮流', '>':'東への潮流', 'v':'南への潮流', '<':'西への潮流', 'O':'潮の門', 'm':'手紙', 'o':'貝殻', 'B':'灯台', 'S':'出発の桟橋' };
  const actionNames = { N:'北', E:'東', S:'南', W:'西', A:'錨を下ろして潮を変える' };
  function positionTiles() {
    if(!sea.g)return; const r=$('boardArea').getBoundingClientRect();
    for(const b of $('tileButtons').children){const p=sea.point(Number(b.dataset.x),Number(b.dataset.y));b.style.left=(p.x-r.left)+'px';b.style.top=(p.y-r.top)+'px';b.style.width=(sea.g.sx*1.85)+'px';b.style.height=(sea.g.sy*1.85)+'px';b.style.transform='translate(-50%,-50%)';b.style.clipPath='polygon(50% 0,100% 50%,50% 100%,0 50%)';}
  }
  function updateTiles() {
    if(!state)return;
    for(const b of $('tileButtons').children){const x=Number(b.dataset.x),y=Number(b.dataset.y),dx=x-state.x,dy=y-state.y;
      const a=T.ACTIONS.find(a=>a!=='A'&&T.DIRS[a][0]===dx&&T.DIRS[a][1]===dy);
      b.disabled=busy||finished||!a; b.tabIndex=a&&!busy&&!finished?0:-1;
      b.dataset.action=a||''; b.setAttribute('aria-label',(a?actionNames[a]+'へ進む：':'')+tileNames[T.tile(current(),x,y)]+'（'+(x+1)+','+(y+1)+'）');
    }
  }
  function act(action) {
    if(scene!=='play'||busy||finished||modalKind)return;
    const result=T.step(current(),state,action);
    if(!result.ok){const messages={'shallow':'ここは浅瀬。錨で満ち潮を待ちましょう。','rock':'その先は岩。点線のマスへ進めます。','current-rock':'満ち潮の流れの先は岩。引き潮なら止まれます。','loop':'潮が輪になっています。引き潮を待ちましょう。'};toast(messages[result.reason]||'今は進めません。');sound.fx('blocked');return;}
    history.push({...state});commands.push(action);const before={...state};visualState=before;state=result.state;hint=null;preview=null;busy=true;
    sound.fx(action==='A'?'anchor':'move');updateHUD();
    sea.sail(result,before,()=>{
      busy=false;visualState=null;
      for(const e of result.events){sea.burst(e.x,e.y,e.type);sound.fx(e.type==='portal'?'portal':e.type);}
      if(result.events.some(e=>e.type==='mail')){announce(state.mail===current().allMail?'手紙がそろいました。灯台へ届けましょう。':'手紙を預かりました。');}
      else if(action==='A'){announce(state.tide?'潮が満ちました。浅瀬と流れを渡れます。':'潮が引きました。流れの上でも止まれます。');}
      updateHUD();
      if(T.won(current(),state)) finish(); else saveVoyage();
    });
  }
  function undo() {
    if(scene!=='play'||busy||modalKind||!history.length)return;
    clearTimeout(completionTimer); finished=false;
    const before={...state}, previous=history.pop(), action=commands.pop();visualState=before;state=previous;hint=null;preview=null;busy=true;updateHUD();sound.fx('undo');
    const forward=[{x:previous.x,y:previous.y},...T.step(current(),previous,action).path];
    const reverse=forward.slice(0,-1).reverse().map((point,i)=>({...point,portal:!!forward[forward.length-1-i].portal}));
    sea.sail({path:reverse},before,()=>{busy=false;visualState=null;updateHUD();saveVoyage();announce('一手前の海へ。');},true);
  }
  function requestHint() {
    if(busy||finished)return;
    openModal('hint',closeButton+'<p class="eyebrow">A LITTLE HELP FROM THE SEA</p><h2 id="modalTitle">次の一手を、見る。</h2><p>いまの舟の位置と潮から、最短の航路を探します。ヒントを使っても記録は変わりません。</p><div class="hint-choice"><button data-ui="hint-clear">灯台への一手</button><button data-ui="hint-all">貝殻も集める一手</button></div>');
  }
  function showHint(all) {
    closeModal();const route=T.solve(current(),state,all);
    if(!route?.length){toast(all?'この航路からは貝殻をすべて集められません。一手戻すか、海図からやり直せます。':'この先は閉じています。一手戻すか、海図からやり直しましょう。');return;}
    hint=route[0];updateHUD();toast((hint==='A'?'錨を下ろして、潮を変えてみましょう。':actionNames[hint]+'へ一マス進んでみましょう。')+'（あと '+route.length+' 手）');
  }
  function finish() {
    finished=true;hint=null;preview=null;updateHUD();sound.fx('win');
    const l=current(), n=T.medal(l,state), old=save.records[l.id];
    save.records[l.id]={stars:Math.max(n,old?.stars||0),turns:Math.min(state.turns,old?.turns||Infinity),all:state.shells===l.allShells?Math.min(state.turns,old?.all||Infinity):old?.all||null};
    activeSession=null; save.voyage=null; save.last=LEVELS[Math.min(index+1,LEVELS.length-1)].id;persist();
    completionTimer=setTimeout(resultModal,motion()?700:100);
  }
  function postcard(l) { return '<div class="postcard"><div class="envelope" aria-hidden="true">✉</div><p>'+esc(l.letter)+'</p><small>— '+esc(l.from)+'</small></div>'; }
  function resultModal() {
    const l=current(),n=T.medal(l,state),all=state.shells===l.allShells;
    const desc=n===3?'貝殻も手紙も、いちばん短い航路で。':all?'寄り道の貝殻も、すべて届けました。':'手紙は、待っていた人のもとへ。';
    openModal('result','<div class="result-head"><div class="result-stamp '+(n===3?'gold':n===2?'silver':'')+'"><span>DELIVERED</span><b>'+'✦'.repeat(n)+'</b></div><p class="eyebrow">VOYAGE '+String(index+1).padStart(2,'0')+' / COMPLETE</p><h2 id="modalTitle">'+l.name+'</h2></div><div class="result-stats"><span>手数<b>'+state.turns+'</b></span><span>貝殻<b>'+T.count(state.shells)+' / '+l.shells.length+'</b></span><span>最短・貝殻全部<b>'+l.par+'</b></span></div><p class="result-caption">'+desc+'</p>'+postcard(l)+'<button class="primary" data-ui="next"><span>'+(index===17?'最後の灯りをみる':'次の航路へ')+'</span><span>↗</span></button><button class="text-button" data-ui="result-chart">海図に戻る</button><button class="text-button" data-ui="retry">この航路をもう一度</button>'+(stored?'':'<p class="micro">このブラウザでは記録を保存できませんでした。</p>'));
  }
  function buildChart() {
    $('chapterCards').replaceChildren();$('chartProgress').textContent=completed()+' / 18 届けた航路　·　'+stars()+' / 54';
    CHAPTERS.forEach((c,chapter)=>{
      const section=document.createElement('section');section.className='chapter-card';
      section.innerHTML='<p class="eyebrow">'+c.en+'</p><h3>'+c.name+'</h3><p class="chapter-description">'+c.description+'</p>';
      LEVELS.forEach((l,i)=>{if(l.chapter!==chapter)return;const r=save.records[l.id],row=document.createElement('div');row.className='chart-stage';
        const b=document.createElement('button');b.className='stage-button';b.disabled=!unlocked(i);b.setAttribute('aria-label',String(i+1)+' '+l.name+(r?' 記録 '+r.stars+'':'')+(b.disabled?' 未開放':''));
        b.innerHTML='<span class="stage-number">'+String(i+1).padStart(2,'0')+'</span><span class="stage-info"><strong>'+l.name+'</strong><small>'+(r?'BEST '+r.turns+' TURNS':unlocked(i)?'READY TO SAIL':'未開放')+'</small></span><span class="stage-medal">'+(r?'✦'.repeat(r.stars):unlocked(i)?'↗':'·')+'</span>';
        b.addEventListener('click',()=>{if(activeSession?.index===i&&!finished&&activeSession.state){index=i;state=activeSession.state;history=activeSession.history;commands=activeSession.commands;visualState=null;setView('play');announce('航海の途中から。');}else startLevel(i,i%6===0&&!r);});row.append(b);
        if(r){const letter=document.createElement('button');letter.className='letter-button';letter.textContent='✉';letter.setAttribute('aria-label',l.name+' の手紙を読む');letter.addEventListener('click',()=>openModal('letter',closeButton+'<p class="eyebrow">LETTERS YOU DELIVERED</p><h2 id="modalTitle">'+l.name+'</h2>'+postcard(l)));row.append(letter);}
        section.append(row);
      });$('chapterCards').append(section);
    });
  }
  function saveVoyage() {
    save.voyage = {id:current().id,actions:commands.slice()};
    activeSession = {index,state,history,commands}; persist();
  }
  function continueVoyage() {
    if (activeSession) { index=activeSession.index;state=activeSession.state;history=activeSession.history;commands=activeSession.commands;visualState=null;finished=false;busy=false;hint=null;preview=null;sound.unlock();setView('play');$('boardArea').focus({preventScroll:true});announce('前回の舟の位置から、航海をつづけます。'); }
    else startLevel(resumeIndex(),!save.records[LEVELS[resumeIndex()].id]&&resumeIndex()%6===0);
  }
  function chart() { if(busy)return; clearTimeout(completionTimer); if(scene==='play'&&!finished)activeSession={index,state,history,commands}; else activeSession=null; closeModal();hint=null;preview=null;setView('chart');$('chartBack').focus(); }
  function help() {
    openModal('help',closeButton+'<p class="eyebrow">HOW TO READ THE SEA</p><h2 id="modalTitle">海には、二つの道がある。</h2><div class="rules"><div class="rule"><span class="rule-symbol">✉</span><div><strong>手紙を集めて、灯台へ</strong>舟の隣のマスをタップ。点線が進める場所です。すべての手紙がそろうと、灯台の灯りがつきます。</div></div><div class="rule"><span class="rule-symbol">◒</span><div><strong>一手ごとに、満ち引き</strong>いま表示されている潮で進み、その後で潮が変わります。砂色の浅瀬は、満ち潮だけ渡れます。</div></div><div class="rule"><span class="rule-symbol">⚓</span><div><strong>錨を下ろして、待つ</strong>その場で一手。舟は流されず、潮だけが変わります。浅瀬にいるときも安心して待てます。</div></div><div class="rule"><span class="rule-symbol">≫</span><div><strong>満ち潮は、流れと門を運ぶ</strong>矢印は連続して流され、輪はもう一つの輪へつながります。引き潮なら、その場所に止まれます。</div></div><div class="rule"><span class="rule-symbol">↶</span><div><strong>何度でも、やり直せる</strong>一手戻す、次の一手のヒントに制限はありません。貝殻は任意。全部集め、最短で届けると金の記録。</div></div></div><button class="primary" data-ui="close"><span>海へ戻る</span><span>↗</span></button>');
  }
  function settings() {
    openModal('settings',closeButton+'<p class="eyebrow">A SEA AT YOUR PACE</p><h2 id="modalTitle">海の設定</h2><div class="setting"><div>音楽<small>三つの海のためのオリジナル曲</small></div><button data-ui="music" aria-pressed="'+save.music+'">'+(save.music?'ON':'OFF')+'</button></div><div class="setting"><div>効果音<small>舟、波、届いた手紙</small></div><button data-ui="effects" aria-pressed="'+save.effects+'">'+(save.effects?'ON':'OFF')+'</button></div><div class="setting"><div>海の動き<small>端末の視差効果設定も反映します</small></div><button data-ui="motion" aria-pressed="'+save.motion+'">'+(save.motion?'ON':'OFF')+'</button></div><p class="micro">記録は、このブラウザだけに保存されます。<br>時間制限も、失敗回数の制限もありません。</p><button class="primary" data-ui="close"><span>戻る</span><span>↗</span></button>');
  }
  function pause() { if(scene!=='play'||busy||finished||modalKind)return;openModal('pause','<p class="eyebrow">THE SEA CAN WAIT</p><h2 id="modalTitle">少し、ひと息。</h2><p>舟はここで待っています。<br>この航路は '+state.turns+' 手目。手紙 '+T.count(state.mail)+' / '+current().mail.length+'。</p><button class="primary" data-ui="close"><span>航海をつづける</span><span>↗</span></button><button class="text-button" data-ui="retry">最初からやり直す</button><button class="text-button" data-ui="result-chart">海図へ戻る</button><button class="text-button" data-ui="settings">音と海の設定</button>'); }
  function ending() {
    closeModal();setView('ending');sound.scene(0,true);sea.set({...sea.view,scene:'ending',chapter:0});
    openModal('ending','<p class="eyebrow">ALL LETTERS FIND A SHORE</p><h2 id="modalTitle">灯りは、次の誰かへ。</h2><p>18の航路を渡り、すべての手紙を届けました。<br>あなたが結んだ道は、海には残らない。<br>それでも、誰かの心に残っています。</p><div class="result-stats"><span>届けた航路<b>18</b></span><span>航海の記録<b>'+stars()+' / 54</b></span></div><p>まだ拾っていない貝殻も、<br>まだ見つけていない近道も。<br>海は、いつでもここに。</p><p class="micro">AFTERTIDE — 潮の郵便屋<br>Concept, art, code & music · GPT 6.1 sol</p><button class="primary" data-ui="result-chart"><span>海図と手紙へ</span><span>↗</span></button><button class="text-button" data-ui="title">タイトルへ戻る</button>');
  }
  $('modalCard').addEventListener('click',event=>{
    const b=event.target.closest('[data-ui]');if(!b)return;const action=b.dataset.ui;sound.unlock();
    if(action==='close'){if(modalKind==='intro')return;closeModal();}
    else if(action==='embark'){closeModal();$('boardArea').focus({preventScroll:true});announce(current().note);}
    else if(action==='next'){closeModal();if(index===17)ending();else startLevel(index+1,(index+1)%6===0);}
    else if(action==='retry'){closeModal();startLevel(index);}
    else if(action==='result-chart')chart();
    else if(action==='title'){closeModal();setView('title');}
    else if(action==='settings'){settings();}
    else if(action==='hint-clear')showHint(false);
    else if(action==='hint-all')showHint(true);
    else if(['music','effects','motion'].includes(action)){save[action]=!save[action];persist();sound.settings(save.music,save.effects);updateArt();b.setAttribute('aria-pressed',save[action]);b.textContent=save[action]?'ON':'OFF';}
  });
  $('start').addEventListener('click',continueVoyage);
  $('openChart').addEventListener('click',()=>{sound.unlock();setView('chart');});
  $('chartButton').addEventListener('click',chart);$('chartBack').addEventListener('click',()=>setView('title'));
  $('titleSettings').addEventListener('click',settings);$('chartSettings').addEventListener('click',settings);
  $('pause').addEventListener('click',pause);$('undo').addEventListener('click',undo);$('hint').addEventListener('click',requestHint);$('help').addEventListener('click',help);
  for(const b of document.querySelectorAll('[data-action]'))b.addEventListener('click',()=>{sound.unlock();act(b.dataset.action);});
  window.addEventListener('keydown',e=>{
    const key=e.key.toLowerCase();
    if(modalKind){
      if(key==='escape'&&!['intro','result','ending'].includes(modalKind)){e.preventDefault();closeModal();}
      if(key==='tab'){const a=[...$('modalCard').querySelectorAll('button:not(:disabled),a[href]')];if(a.length){const first=a[0],last=a[a.length-1];if(e.shiftKey&&(document.activeElement===first||document.activeElement===$('modalCard'))){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===$('modalCard'))){e.preventDefault();first.focus();}}}
      return;
    }
    if(scene!=='play')return;
    const a={arrowup:'N',w:'N',arrowright:'E',d:'E',arrowdown:'S',s:'S',arrowleft:'W',a:'W',' ':'A'}[key];
    const control=e.target.closest?.('button,a');
    if(a&&!(key===' '&&control)){e.preventDefault();if(!e.repeat){$('boardArea').focus({preventScroll:true});sound.unlock();act(a);}}
    else if(key==='z'||key==='backspace'){e.preventDefault();if(!e.repeat)undo();}
    else if(key==='escape'||key==='p'){e.preventDefault();if(!e.repeat)pause();}
    else if(key==='h'&&!e.repeat)requestHint();
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden){sound.suspend();if(scene==='play'&&!busy&&!finished&&!modalKind)pause();}else if(!modalKind)sound.unlock();});
  window.addEventListener('blur',()=>{if(scene==='play'&&!busy&&!finished&&!modalKind)pause();});
  window.addEventListener('resize',()=>{sea.geometry();positionTiles();});
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change',updateArt);
  setView('title');
  if('serviceWorker' in navigator&&['http:','https:'].includes(location.protocol))navigator.serviceWorker.register('../sw.js').catch(()=>{});
})();
