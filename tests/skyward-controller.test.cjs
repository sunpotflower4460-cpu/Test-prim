const test=require('node:test'),assert=require('node:assert/strict'),host=require('./helpers/controller.cjs'),S=require('../sol/skyward/sim.js');
class World{constructor(){}resize(){}resetCamera(){}render(){}}
class HUD{constructor(){}resize(){}draw(){}}
class Sound{constructor(){}set(){}start(){}update(){}event(){}}
function boot(storage={}){
 const h=host('sol/skyward/game.js',{storage,globals:{SkySim:S,World,HUD,Sound,innerWidth:1280,innerHeight:800,matchMedia:()=>({matches:false}),console},instrument:s=>s.replace(/^import .*;\n/gm,'').replace('try{world=new World',`window.skyAudit={getState:()=>state,getMode:()=>mode,startMission,pause,closeDialog,toMenu,manual,settings,input,getSave:()=>save,persist};try{world=new World`)});
 const dialog=h.el('dialog');dialog.open=false;dialog.showModal=()=>dialog.open=true;dialog.close=()=>dialog.open=false;
 const stick=h.el('stick');stick.getBoundingClientRect=()=>({x:0,y:0,width:128,height:128});
 const audit=h.window.skyAudit;
 assert.equal(h.el('loading').hidden,true,'controller initialized successfully');
 let now=0;return {...h,audit,advance(seconds){for(let i=0;i<Math.ceil(seconds*60);i++){now+=1000/60;h.setTime(now);h.frame();}}};
}
function key(h,k,repeat=false,target=h.el('world')){h.events.keydown({key:k,repeat,target,preventDefault(){},ctrlKey:false,altKey:false,metaKey:false});}
test('SKYWARD keyboard flight, pause, help and blur freeze and release inputs',()=>{
 const h=boot(),a=h.audit;a.startMission(0);assert.equal(h.document.activeElement.id,'world');key(h,'w');h.advance(2);const s=a.getState();assert.ok(s.player.pitch>0);a.pause();const t=s.time;h.advance(1);assert.equal(s.time,t);assert.equal(a.input().pitch,0);assert.equal(h.el('flightUI').inert,true);
 a.closeDialog();assert.equal(a.getMode(),'play');assert.equal(h.document.activeElement.id,'world');assert.equal(h.el('flightUI').inert,false);h.advance(.1);assert.ok(s.time>t);a.manual();const helpTime=s.time;h.advance(1);assert.equal(s.time,helpTime);a.closeDialog();h.events.blur();assert.equal(a.getMode(),'paused');assert.ok(h.el('dialog').open);
});
test('SKYWARD focus loss saves a resumable sortie and reload resumes actual flight state',()=>{
 const h=boot(),a=h.audit;a.startMission(3);h.advance(2); // Locked missions cannot launch from a stale UI call.
 assert.equal(a.getMode(),'menu');a.startMission(0);h.advance(3);const before=S.serialize(a.getState());h.events.pagehide();
 const again=boot(h.data);assert.equal(again.el('resumeSortie').hidden,false);again.el('resumeSortie').onclick();assert.equal(again.audit.getMode(),'play');assert.deepEqual(S.serialize(again.audit.getState()),before);
 again.document.hidden=true;again.events['document:visibilitychange']();assert.equal(again.audit.getMode(),'paused');
});
test('SKYWARD terminal report persists only real wins and unlocks the next mission',()=>{
 const h=boot(),a=h.audit;a.startMission(0);S.end(a.getState(),false,'failed');h.advance(.1);assert.equal(Object.keys(a.getSave().records).length,0);assert.equal(h.el('dialog').dataset.kind,'result');h.el('dialog').trigger('cancel');assert.equal(a.getMode(),'paused');assert.ok(h.el('dialog').open);
 a.startMission(0);S.end(a.getState(),true,'returned');h.advance(.1);assert.equal(a.getSave().records[0].medal,'A');assert.equal(a.getSave().sortie,null);h.el('nextMission').onclick();assert.equal(a.getState().mission,1);assert.equal(a.getMode(),'play');
 const saved=JSON.parse(h.data['skyward-save-v1']);assert.equal(saved.records[0].medal,'A');
});
test('SKYWARD analog stick ignores secondary pointers and cancelled holds cannot stick',()=>{
 const h=boot(),a=h.audit;a.startMission(0);const stick=h.el('stick'),event=(id,x,y)=>({pointerId:id,clientX:x,clientY:y,preventDefault(){}});
 stick.onpointerdown(event(1,100,28));const first=a.input();assert.ok(first.roll>0&&first.pitch>0);stick.onpointerdown(event(2,0,128));assert.deepEqual(a.input(),first);stick.onpointerup(event(2,0,128));assert.deepEqual(a.input(),first);stick.onpointercancel(event(1,100,28));assert.equal(a.input().roll,0);assert.equal(a.input().pitch,0);
 const gun=h.el('gunBtn');gun.onpointerdown(event(4,0,0));assert.equal(a.input().gun,true);a.pause();assert.equal(a.input().gun,false);a.closeDialog();assert.equal(a.input().gun,false);
});
test('SKYWARD buttons retain native Space and repeated toggles do not fire twice',()=>{
 const h=boot(),a=h.audit;a.startMission(0);const button={closest:()=>({tagName:'BUTTON'})};key(h,' ',false,button);assert.equal(a.input().gun,false);const p=a.getState().player;key(h,'g');assert.ok(p.gear);key(h,'g',true);assert.ok(p.gear);
 const gun=h.el('gunBtn'),e={key:' ',preventDefault(){},stopPropagation(){}};gun.onkeydown(e);assert.ok(a.input().gun);gun.onkeyup(e);assert.equal(a.input().gun,false);
});
test('SKYWARD corrupted saves and unknown preferences fall back to safe defaults',()=>{
 const h=boot({'skyward-save-v1':JSON.stringify({records:{0:{medal:'<html>',time:0}},sortie:{player:{speed:NaN}},settings:{quality:'bad',sensitivity:999,volume:-100}})});assert.equal(h.el('resumeSortie').hidden,true);assert.equal(h.audit.getSave().settings.quality,'high');assert.equal(h.audit.getSave().settings.sensitivity,1.5);assert.equal(h.audit.getSave().settings.volume,0);assert.equal(Object.keys(h.audit.getSave().records).length,0);
});
