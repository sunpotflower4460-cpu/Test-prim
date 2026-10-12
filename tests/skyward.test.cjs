const test=require('node:test'),assert=require('node:assert/strict'),S=require('../sol/skyward/sim.js'),pilot=require('./helpers/skyward-pilot.cjs');
function steps(s,n,input={},assist=true){for(let i=0;i<n;i++)S.update(s,input,1/120,assist);}
test('SKYWARD neutral trim keeps a healthy cruising flight, a hard turn spends energy, low speed stalls',()=>{
 const p=S.plane();for(let i=0;i<120*30;i++)S.flight(p,{},1/120);assert.ok(p.y>1350&&p.y<1600);assert.ok(p.speed>205);assert.ok(!p.stall);
 const straight={...p},turn={...p,bank:1.1};for(let i=0;i<120*5;i++){S.flight(straight,{},1/120,false);S.flight(turn,{pitch:.6},1/120,false);}assert.ok(turn.speed<straight.speed);assert.ok(turn.heading>0);assert.ok(turn.load>1);
 const slow=S.plane();slow.speed=70;S.flight(slow,{pitch:1},1/120);assert.equal(slow.stall,true);
});
test('SKYWARD afterburner gains energy, gear adds drag, fuel exhaustion removes thrust',()=>{
 const a=S.plane(),b=S.plane();a.throttle=b.throttle=.68;for(let i=0;i<120*8;i++){S.flight(a,{boost:true},1/120);S.flight(b,{},1/120);}assert.ok(a.speed>b.speed);assert.ok(a.fuel<b.fuel);assert.ok(a.afterburner);assert.equal(a.throttle,.68);
 const clean=S.plane(),gear={...clean,gear:true},empty={...clean,fuel:0};for(let i=0;i<120*8;i++){S.flight(clean,{},1/120);S.flight(gear,{},1/120);S.flight(empty,{},1/120);}assert.ok(gear.speed<clean.speed);assert.ok(empty.speed<gear.speed);
});
test('SKYWARD bank return is optional and the level command recovers attitude',()=>{
 const a=S.plane(),b=S.plane();a.bank=b.bank=.7;for(let i=0;i<120*4;i++){S.flight(a,{},1/120,true);S.flight(b,{},1/120,false);}assert.ok(Math.abs(a.bank)<.01);assert.equal(b.bank,.7);
 for(let i=0;i<120*5;i++)S.flight(b,{level:true},1/120,false);assert.ok(Math.abs(b.bank)<.01);assert.ok(Math.abs(b.pitch)<.05);
});
test('SKYWARD gun lead intercepts a moving target at the actual projectile speed',()=>{
 const p=S.plane(),e=S.plane(500,1700,2000);e.heading=.9;e.speed=180;const lead=S.gunLead(p,e),travel=S.len(S.sub(lead,p))/(920+p.speed),expected=S.add(e,S.mul(S.forward(e),e.speed*travel));assert.ok(S.len(S.sub(lead,expected))<1e-6);
});
test('SKYWARD missile requires a stable lock, range, ammunition and cooldown',()=>{
 const s=S.create(3);assert.equal(S.launch(s),false);s.lock=1.5;assert.equal(S.launch(s),true);assert.equal(s.remaining,7);assert.equal(S.launch(s),false);
 s.missileTimer=0;s.lock=1.5;s.player.heading=Math.PI;assert.equal(S.launch(s),false);s.player.heading=0;s.remaining=0;assert.equal(S.launch(s),false);
});
test('SKYWARD flares decoy close missiles, leave distant missiles active, and spend one charge',()=>{
 const s=S.create(3),f=S.forward(s.player);s.missiles=[{...S.add(s.player,S.mul(f,1400)),enemy:true,target:'player',life:10},{...S.add(s.player,S.mul(f,4000)),enemy:true,target:'player',life:10}];assert.ok(S.flare(s));assert.equal(s.flares,13);assert.equal(s.missiles[0].target,null);assert.equal(s.missiles[1].target,'player');assert.equal(S.flare(s),false);
});
test('SKYWARD cannon overheats, cools with the trigger held, and can fire again',()=>{
 const s=S.create(5);steps(s,120*5,{gun:true});assert.equal(s.overheated,true);const ammo=s.ammo;steps(s,120,{gun:true});assert.equal(s.ammo,ammo);steps(s,120*4,{gun:true});assert.ok(s.ammo<ammo);assert.ok(s.gunHeat<1.1);
});
test('SKYWARD second wave selects a living new target and uses distinct ids',()=>{
 const s=S.create(4);s.enemies.forEach(e=>e.dead=true);s.kills=3;s.selected=null;S.update(s);assert.equal(s.wave,2);assert.equal(s.enemies.length,6);assert.equal(S.target(s).id,4);assert.equal(S.alive(s).length,3);
});
test('SKYWARD all five missions clear through legal flight inputs, aiming, ordnance and return navigation',()=>{
 for(let mission=0;mission<5;mission++){
 const s=S.create(mission);let frames=0;
 while(!s.ended&&frames<120*700){const e=S.target(s),d=s.phase==='return'||mission===0?S.destination(s):e?S.gunLead(s.player,e):S.destination(s);
 const info=S.targetInfo(s),speed=mission===1&&info?.distance<1200?(e?.speed||148)+S.clamp((info.distance-500)*.04,-15,15):mission===1?200:220;
 const input=pilot(s,d||{x:0,y:1500,z:1000},speed);
 if(mission>0&&s.phase==='active'){
 if(info&&info.distance<1750&&S.dot(S.norm(S.sub(info.lead,s.player)),S.aimForward(s.player))>Math.cos(.045))input.gun=true;
 if(info&&s.lock>=1.5&&!s.missiles.some(b=>!b.enemy&&b.target===s.selected))S.launch(s);
 if(s.missiles.some(m=>m.enemy&&S.len(S.sub(m,s.player))<2200))S.flare(s);
 }
 S.update(s,input,1/120,false);frames++;s.events=[];
 }
 assert.ok(s.result?.success,S.MISSIONS[mission].name+': '+JSON.stringify(s.result));assert.equal(s.kills,S.MISSIONS[mission].enemies);if(mission===0)assert.equal(s.gate,8);assert.equal(s.phase,'ended');assert.ok(s.player.health>0);assert.ok(s.remaining>=0&&s.ammo>=0);
 }
});
test('SKYWARD runway touchdown requires safe alignment, descent, gear and speed',()=>{
 function approach(){const s=S.create(5);Object.assign(s.player,{x:0,y:30,z:-4000,speed:95,heading:Math.PI,pitch:-.035,gear:true,throttle:.05});return s;}
 const good=approach();steps(good,120*6);assert.ok(good.result?.success);assert.equal(good.result.medal,'S');assert.ok(good.player.landed);
 for(const bad of [{gear:false},{speed:200},{bank:.7},{heading:Math.PI/2},{x:200}]){const s=approach();Object.assign(s.player,bad);steps(s,120);assert.equal(s.result?.success,false,JSON.stringify(bad));}
});
test('SKYWARD snapshot keeps flight, enemies, missiles and ammunition; rejects corrupted saves',()=>{
 const s=S.create(3);steps(s,120*5);const restored=S.restore(S.serialize(s));assert.ok(restored);assert.deepEqual(restored.player,s.player);assert.equal(restored.enemies.length,3);assert.equal(restored.missiles.length,s.missiles.length);
 for(const mutate of [d=>d.player.speed=NaN,d=>d.player.health=-1,d=>d.enemies[0].x=Infinity,d=>d.stats={},d=>d.mission=999,d=>d.ammo=-3,d=>d.missiles=[{enemy:true}],d=>d.ended=true]){const d=S.serialize(s);mutate(d);assert.equal(S.restore(d),null);}
 const a=S.restore(S.serialize(s)),b=S.restore(S.serialize(s));steps(a,120*3);steps(b,120*3);assert.deepEqual(a,b);
});
test('SKYWARD failure paths cannot grant success and ended flights remain frozen',()=>{
 const s=S.create(2);s.convoy=0;S.update(s);assert.equal(s.result.success,false);const old=S.serialize(s);steps(s,120);assert.deepEqual(S.serialize(s),old);
 const t=S.create(2);t.time=321;S.update(t);assert.equal(t.result.success,false);
});

test('SKYWARD rings require passing through their plane rather than merely flying nearby',()=>{
 const i=0,c=S.GATES[i],n=S.gateNormal(i);assert.ok(S.crossesGate(S.sub(c,S.mul(n,20)),S.add(c,S.mul(n,20)),i));
 assert.equal(S.crossesGate(S.add(c,S.vec(0,500,-20)),S.add(c,S.vec(0,500,20)),i),false);
 assert.equal(S.crossesGate(S.add(c,S.mul(n,20)),S.sub(c,S.mul(n,20)),i),false);
});
test('SKYWARD complete landing approach, flare and rollout succeed without an early flyover ending',()=>{
 const s=S.create(5);Object.assign(s.player,{x:0,y:230,z:0,speed:105,heading:Math.PI,pitch:-.05,gear:true});s.phase='return';let touchdown=false;
 for(let i=0;i<120*65&&!s.ended;i++){
 const p=s.player,aimPitch=p.z>-3350?-.05:-.018,load=Math.cos(p.pitch)+p.speed*(aimPitch-p.pitch)*2/S.G;
 if(!p.landed)p.throttle=S.clamp(.2+(100-p.speed)*.03,.05,.65);
 S.update(s,{pitch:(load-1)/(load>1?6.5:3)},1/120,false);
 if(s.phase==='landing'){touchdown=true;assert.ok(!s.ended);assert.deepEqual(S.destination(s),{...S.BASE,y:600,label:'帰投ビーコン'});if(p.speed<30){const r=S.restore(S.serialize(s));assert.ok(r,'a landing checkpoint can resume');}}
 }
 assert.ok(touchdown);assert.ok(s.result.success&&s.result.landing);assert.ok(s.player.speed<1);assert.ok(s.time>50);assert.equal(s.result.medal,'S');
});
