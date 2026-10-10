'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const T = require('../sol/sim.js');
const levels = require('../sol/levels.js').map(T.parse);
function run(l, route, start=T.initial(l)) { let s=start; for(const a of route){const r=T.step(l,s,a);assert.ok(r.ok,l.id+': '+a+' at '+s.x+','+s.y);s=r.state;}return s; }

test('all 18 voyages have a route and a gold route, without early docking',()=>{
  assert.equal(levels.length,18);assert.equal(new Set(levels.map(l=>l.id)).size,18);
  for(const l of levels){
    const clear=T.solve(l),gold=T.solve(l,undefined,true);assert.ok(clear?.length);assert.ok(gold?.length);assert.ok(clear.length<=gold.length);
    l.par=gold.length;const s=run(l,gold);assert.ok(T.won(l,s));assert.equal(s.mail,l.allMail);assert.equal(s.shells,l.allShells);assert.equal(T.medal(l,s),3);
    assert.equal(T.medal(l,{...s,turns:s.turns+1}),2);assert.equal(T.medal(l,{...s,shells:0}),1);
  }
});
test('the first three lessons have deliberate minimal solutions',()=>{
  assert.equal(T.solve(levels[0]).length,4);assert.equal(T.solve(levels[0],undefined,true).length,8);
  const l=levels[2],s=T.initial(l);assert.equal(T.step(l,s,'E').reason,'shallow');
  assert.equal(T.solve(l)[0],'A');assert.equal(T.solve(l).length,5);
});
test('tide is used for the move, and changes exactly once afterwards',()=>{
  const l=levels[1],s=run(l,['E']);assert.equal(s.tide,1);
  const r=T.step(l,s,'E');assert.ok(r.ok);assert.equal(r.state.tide,0);assert.equal(r.state.x,3);
  const blocked=T.step(l,T.initial(l),'N');assert.equal(blocked.ok,false);assert.deepEqual(T.initial(l),{x:1,y:2,tide:0,mail:0,shells:0,turns:0});
});
test('anchoring changes tide without drifting, collecting, or mutating history',()=>{
  const l=levels[6],s={x:2,y:2,tide:1,mail:0,shells:0,turns:8},before={...s};
  const r=T.step(l,s,'A');assert.deepEqual(s,before);assert.deepEqual(r.state,{...before,tide:0,turns:9});assert.equal(r.path.length,1);
});
test('flood currents chain in one turn; ebb lets the boat stop',()=>{
  const l=levels[6],s=T.initial(l),r=T.step(l,s,'E');assert.equal(r.state.x,4);assert.equal(r.state.turns,1);assert.equal(r.state.mail,1);assert.equal(r.path.length,3);
  assert.equal(T.step(l,{...s,tide:0},'E').state.x,2);
});
test('current collisions and loops are rejected atomically',()=>{
  const rock=T.parse({name:'rock',map:['#####','#S>##','#m.B#','#####']}),start={...T.initial(rock),tide:1};
  assert.equal(T.step(rock,start,'E').reason,'current-rock');assert.equal(start.turns,0);
  const loop=T.parse({name:'loop',map:['######','#S>vB#','#m^<.#','######']});
  assert.equal(T.step(loop,{...T.initial(loop),tide:1},'E').reason,'loop');
});
test('a flood gate transports once and an ebb gate can be occupied',()=>{
  const l=levels[12],start={x:2,y:1,tide:1,mail:0,shells:0,turns:0};
  const r=T.step(l,start,'E');assert.ok(r.ok);assert.equal(r.path.length,2);assert.equal(r.state.x,5);assert.equal(r.state.y,1);assert.equal(r.state.tide,0);
  assert.equal(T.step(l,{...start,tide:0},'E').state.x,3);
  assert.equal(T.step(l,r.state,'A').state.x,5);
});
test('hints from every state on gold routes remain solvable, and rewind restores collectibles',()=>{
  for(const l of levels){const path=T.solve(l,undefined,true);let s=T.initial(l);const snapshots=[];
    for(const a of path){snapshots.push({...s});const hint=T.solve(l,s,true);assert.ok(hint?.length);s=T.step(l,s,a).state;}
    for(let i=snapshots.length-1;i>=0;i--) { s=snapshots[i];assert.ok(T.solve(l,s,true)?.length); }
    assert.deepEqual(s,T.initial(l));
  }
});
test('docking requires all letters and ends the voyage',()=>{
  const l=levels[0],s={...T.initial(l),x:l.goal.x,y:l.goal.y};assert.equal(T.won(l,s),false);
  const clear=run(l,T.solve(l));assert.ok(T.won(l,clear));assert.equal(T.step(l,clear,'A').ok,false);
});
test('malformed boards and local records cannot corrupt progress',()=>{
  assert.throws(()=>T.parse({name:'ragged',map:['S.mB','...']}));
  assert.throws(()=>T.parse({name:'gate',map:['SmOB']}));
  const save=T.cleanSave({last:'gone',music:false,records:{[levels[0].id]:{stars:3,turns:8,all:8},[levels[1].id]:{stars:99,turns:-8}}},levels);
  assert.equal(save.last,levels[0].id);assert.equal(save.music,false);assert.equal(Object.keys(save.records).length,1);assert.equal(save.records[levels[0].id].stars,3);
  assert.equal(Object.keys(T.cleanSave(null,levels).records).length,0);
});

test('an interrupted voyage is verified by replay, preserving undo without trusting arbitrary positions',()=>{
  const l=levels[0], valid={last:l.id,voyage:{id:l.id,actions:['E','E','S']}};
  const saved=T.cleanSave(valid,levels);assert.deepEqual(saved.voyage,valid.voyage);
  const resumed=run(l,saved.voyage.actions);assert.equal(resumed.x,3);assert.equal(resumed.y,3);assert.equal(resumed.mail,1);
  assert.equal(T.cleanSave({voyage:{id:l.id,actions:['NOPE']}},levels).voyage,null);
  assert.equal(T.cleanSave({voyage:{id:l.id,actions:['N']}},levels).voyage,null);
  assert.equal(T.cleanSave({voyage:{id:levels[17].id,actions:[]}},levels).voyage,null);
  assert.equal(T.cleanSave({voyage:{id:l.id,actions:Array(4097).fill('A')}},levels).voyage,null);
  assert.equal(T.cleanSave({voyage:{id:l.id,actions:T.solve(l)}},levels).voyage,null);
});
