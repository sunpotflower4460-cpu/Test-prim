const test=require('node:test'),assert=require('node:assert/strict');
const host=require('./helpers/controller.cjs');
const sim=require('../sync-sim.js');
function sync(audio=false){return host('sync.js',{audio,globals:{SyncSim:sim},instrument:s=>s.replace('window.__sync = {','window.__sync = { pause, resume, commitRecord, pumpScheduler, scheduled: () => scheduledBeat,')});}
const key=(code,key)=>({code,key,repeat:false,preventDefault(){}});

test('SYNC releases a held note during pause using the frozen song time',()=>{
  const h=sync(),c=h.window.__sync;c.enter();c.start(1,[]);
  const g=c.getGame(),note=g.chart.notes.find(n=>n.kind==='hold');
  h.setTime((note.time+.28)*1000);
  h.events.keydown(key(sim.LANE_KEYS[note.lane],'a'));
  assert.equal(g.held[note.lane],true);
  c.pause();h.setTime((note.time+100)*1000);
  h.events.keyup(key(sim.LANE_KEYS[note.lane],'a'));
  assert.equal(g.held[note.lane],false);
  assert.equal(note.holdBroken,true,'time spent paused cannot complete a long note');
  c.resume();assert.equal(c.getMode(),'play');
});
test('SYNC losing window focus pauses and does not swallow the next key press',()=>{
  const h=sync(),c=h.window.__sync;c.enter();c.start(0,[]);
  h.events.keydown(key('KeyA','a'));
  const before=c.getGame().stats.whiff;
  h.events.blur();assert.equal(c.getMode(),'paused');
  h.setTime(50000);c.resume();h.events.keydown(key('KeyA','a'));
  assert.equal(c.getGame().stats.whiff,before+1);
});
test('SYNC cancels queued music on pause and schedules the imminent beat on resume',()=>{
  const h=sync(true),c=h.window.__sync;c.enter();c.start(0,[]);
  h.setTime(800);h.frame();c.pumpScheduler();
  // Paused song time .52 s: the next beat is less than SCHEDULE_AHEAD away.
  c.pause();assert.ok(h.sources.some(s=>s.cancelled),'music sources were stopped');
  h.setTime(10800);c.resume();
  assert.equal(c.scheduled(),2,'beat 1 has been queued instead of skipped');
  const expected=10.28+c.getGame().chart.spb;
  assert.ok(h.sources.some(s=>!s.cancelled&&Math.abs(s.started-expected)<1e-8));
});
test('SYNC loss in the final chapter does not count as an all-clear',()=>{
  const h=sync(),c=h.window.__sync;c.enter();c.start(4,[]);
  const g=c.getGame();g.over=true;g.running=false;g.stats.perfect=7;
  h.frame();assert.equal(c.getMode(),'over');assert.equal(c.getRecord().clears,0);
  assert.equal(JSON.parse(h.data['sync-record-v1']).perfects,7);
});
test('SYNC resume retains the remaining half-beat without replaying elapsed music',()=>{
  const h=sync(true),c=h.window.__sync;c.enter();c.start(0,[]);
  h.setTime(480);c.pumpScheduler();c.pause();h.setTime(10480);c.resume();
  const pending=h.sources.filter(s=>!s.cancelled);
  assert.ok(pending.length>0);
  assert.ok(pending.every(s=>s.started>10.48),'no expired cue is played late');
  assert.ok(pending.some(s=>Math.abs(s.started-(10.28+c.getGame().chart.spb/2))<1e-8),'the next half-beat remains audible');
});
test('SYNC saves perfect totals even when a repeated run does not improve the best',()=>{
  const h=sync(),c=h.window.__sync;c.enter();c.start(0,[]);
  let g=c.getGame();g.stats.perfect=4;g.stats.score=100;g.over=true;g.running=false;h.frame();
  c.start(0,[]);g=c.getGame();g.stats.perfect=3;g.stats.score=50;g.over=true;g.running=false;h.frame();
  assert.equal(JSON.parse(h.data['sync-record-v1']).perfects,7);
});
test('all fifteen RELAY programs pass through the controller and save their stars',()=>{
  const code=require('../code-sim.js');
  const h=host('code.js',{globals:{CodeSim:code},instrument:s=>s.replace('  /* ---------- 起動 ---------- */','  window.audit = {startLevel,onPalette,onRowTap,runProgramUI,updateAnim}; /* ---------- 起動 ---------- */')});
  const c=h.window.audit;
  for(const level of code.LEVELS){
    c.startLevel(level.id);
    level.solution.forEach((text,i)=>{const token=code.tokenOf(text);c.onPalette(token.t);if(token.t==='rep')for(let n=2;n<token.n;n++)h.el('codeProgram').children[i].trigger('keydown',{key:'Enter',repeat:false});});
    c.runProgramUI();for(let i=0;i<2000;i++)c.updateAnim(.05);
    assert.equal(JSON.parse(h.data['relay-progress-v1']).stars[level.id],3,'stage '+level.id+' reached its result');
  }
});
test('AFTERTIDE leaving the completed board cancels the delayed result card',()=>{
  class Sea {constructor(){this.view={};}set(v){this.view=v;}sail(r,s,done){done();}burst(){} }
  class Sound {settings(){}scene(){}unlock(){}fx(){} }
  const T=require('../sol/sim.js'),levels=require('../sol/levels.js');
  const h=host('sol/game.js',{globals:{Tide:T,TideLevels:levels,SeaArt:Sea,TideSound:Sound},
    instrument:s=>s.replace("  setView('title');","  window.audit = {startLevel,act,chart,kind:()=>modalKind,scene:()=>scene}; setView('title');")});
  const c=h.window.audit;c.startLevel(0);for(const a of T.solve(T.parse(levels[0])))c.act(a);
  c.chart();h.flushTimers();assert.equal(c.scene(),'chart');assert.equal(c.kind(),null);
});

test('SYNC an ending queued by the final clear cannot appear after returning to the gallery',()=>{
 const h=sync(),c=h.window.__sync;c.enter();c.start(4,[]);
 const g=c.getGame();g.cleared=true;g.running=false;h.frame();
 h.el('syncReturnBtn').click();assert.equal(c.getMode(),'off');
 assert.doesNotThrow(()=>h.flushTimers());assert.equal(c.getMode(),'off');
});

function reprise(){
 const rules=require('../gpt6-sol/rules.js'),levels=require('../gpt6-sol/levels.js');
 const sound={effect(){},startAmbient(){},stopAmbient(){},setEnabled(){}};
 const h=host('gpt6-sol/game.js',{globals:{RepriseRules:rules,RepriseLevels:levels,RepriseSound:sound},instrument:s=>s.replace('  title();\n})();','  window.audit={enterScene,move,record,sceneSelect,title,getModal:()=>modal,getScreen:()=>screen}; title();\n})();')});
 h.el('board').parentElement=h.el('stage-shell');return h;
}
test('REPRISE all twelve scenes clear through the controller and save fragments and unlocks',()=>{
 const h=reprise(),c=h.window.audit,rules=require('../gpt6-sol/rules.js'),levels=require('../gpt6-sol/levels.js'),route=require('./helpers/reprise-solve.cjs');
 for(const [index,level] of levels.entries()){
  c.enterScene(index);h.flushTimers();
  if(c.getModal())h.el('dialog').trigger('click',{target:{closest:()=>({dataset:{dialog:'close'}})}});
  const echoes=[];
  for(const plate of level.plates){const path=route(level,echoes,plate);for(const action of path)c.move(action);c.record();echoes.push(path);}
  for(const action of route(level,echoes,level.goal,true))c.move(action);
  h.flushTimers();assert.ok(c.getModal(),'scene '+index+' displays a result');
  const saved=JSON.parse(h.data['reprise-gpt6-sol-v1']);assert.ok(saved.completed.includes(index));assert.ok(saved.fragments.includes(index));assert.equal(saved.unlocked,Math.min(11,index+1));assert.equal(saved.session,null);
  c.sceneSelect();
 }
 c.title();assert.equal(c.getScreen(),'title');
});
test('REPRISE closing the page after a clear cannot resurrect the finished session',()=>{
 const h=reprise(),c=h.window.audit;c.enterScene(0);h.flushTimers();
 h.el('dialog').trigger('click',{target:{closest:()=>({dataset:{dialog:'close'}})}});
 for(const move of 'DDD')c.move(move);c.record();for(const move of 'RRWRRRDDUUR')c.move(move);
 assert.equal(JSON.parse(h.data['reprise-gpt6-sol-v1']).session,null);
 h.events.pagehide();assert.equal(JSON.parse(h.data['reprise-gpt6-sol-v1']).session,null);
});

test('REPRISE a queued first-scene tutorial cannot interrupt the next scene',()=>{
 const h=reprise(),c=h.window.audit;c.enterScene(0);
 for(const move of 'DDD')c.move(move);c.record();for(const move of 'RRWRRRDDUUR')c.move(move);
 c.enterScene(1);h.flushTimers();assert.equal(c.getModal(),null);assert.equal(c.getScreen(),'play');
});
