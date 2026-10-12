const test=require('node:test'),assert=require('node:assert/strict');
const host=require('./helpers/controller.cjs');
function luna(){return host('luna/luna.js',{globals:{innerWidth:390,innerHeight:844,devicePixelRatio:1},instrument:s=>s.replace('function predictPath(ship,vel){', 'function predictPath(ship,vel){window.lastPrediction={...vel};').replace('  resize();updateRecord();',`  window.audit={startRoute,closeModal,showHow,showPause,undo,step,render,pointerDown,pointerMove,pointerUp,predictPath,burnVelocity,grav,integrate,getState:()=>state,getPointer:()=>pointer,getView:()=>view,routes:ROUTES}; resize();updateRecord();`)});}
function launch(h){const c=h.window.audit;c.startRoute(0);c.closeModal();const s=c.getState();s.vx=120;s.running=true;return c;}
const key=k=>({key:k,repeat:false,target:{closest:()=>null},preventDefault(){}});
test('LUNA focus loss offers a pause and resumes the same flight without spending fuel',()=>{
 const h=luna(),c=launch(h),s=c.getState(),fuel=s.fuel;
 h.document.hidden=true;h.events['document:visibilitychange']();
 assert.equal(s.running,false);assert.equal(h.el('modal').hidden,false);
 h.document.hidden=false;c.closeModal();assert.equal(s.running,true);assert.equal(s.fuel,fuel);
});
test('LUNA shortcuts cannot restart or undo behind an open dialog',()=>{
 const h=luna(),c=launch(h),s=c.getState();c.showPause();
 h.events.keydown(key('r'));assert.equal(c.getState(),s,'restart cannot replace the flight behind pause');
 s.burns.push({x:105,y:310,vx:0,vy:0,fuel:4,shards:[false,false,false],elapsed:0,trail:[]});
 h.events.keydown(key('Backspace'));assert.equal(s.burns.length,1);
});
test('LUNA the drawn prediction and actual second burn include the same velocity',()=>{
 const h=luna(),c=launch(h),s=c.getState();
 const pointer={pointerId:1,clientX:(s.x+20)*.39,clientY:301.1+s.y*.39,preventDefault(){}};
 c.pointerDown(pointer);c.render();
 const prediction=h.window.lastPrediction;assert.ok(prediction,'a short valid drag draws a prediction');
 assert.equal(prediction.x,210,'90 px/s impulse is added to existing 120 px/s velocity');assert.ok(Math.abs(prediction.y)<1e-9);
 c.pointerUp(pointer);assert.equal(s.vx,prediction.x);assert.equal(s.vy,prediction.y);assert.equal(s.fuel,3);
});
test('LUNA help does not start a flight deliberately stopped by undo',()=>{
 const h=luna(),c=launch(h),s=c.getState();s.running=false;c.showHow();c.closeModal();assert.equal(s.running,false);
});
test('LUNA a failed flight cannot resume by dismissing the collision dialog',()=>{
 const h=luna(),c=launch(h),s=c.getState();s.x=999;c.step(1/120);assert.equal(s.running,false);
 h.events.keydown(key('Escape'));assert.equal(s.running,false);assert.equal(h.el('modal').hidden,false);
});

test('LUNA every mandatory star and endpoint lies outside collision geometry',()=>{
 const c=luna().window.audit;
 for(const r of c.routes){
  for(const [x,y] of [r.start,r.goal,...r.stars]){
   assert.ok(x>5&&x<995&&y>5&&y<615,r.name+' lies within the field');
   for(const [bx,by,radius] of r.bodies)assert.ok(Math.hypot(x-bx,y-by)>radius+7,r.name+' has a reachable objective at '+x+','+y);
  }
 }
});

test('LUNA all twelve routes clear with their allotted fuel through actual burns and physics',()=>{
 const h=luna(),c=h.window.audit,solutions=require('./fixtures/luna-routes.json');
 assert.equal(solutions.length,c.routes.length);
 for(const [i,route] of c.routes.entries()){
  c.startRoute(i);c.closeModal(false);const s=c.getState(),solution=solutions[i];
  assert.ok(solution,route.name+' has a verified route');assert.ok(solution.length<=route.fuel);
  for(const [burn,segment] of solution.entries()){
   assert.ok(Math.hypot(segment.ix,segment.iy)>=90-1e-8&&Math.hypot(segment.ix,segment.iy)<=390+1e-8,'only player-reachable impulses are used');
   const from={pointerId:burn+1,clientX:s.x*.39,clientY:301.1+s.y*.39,preventDefault(){}};
   const to={...from,clientX:from.clientX+segment.ix/1.55*.39,clientY:from.clientY+segment.iy/1.55*.39};
   c.pointerDown(from);c.pointerUp(to);assert.equal(s.fuel,route.fuel-burn-1);
   for(let tick=0;tick<segment.ticks;tick++)c.step(1/120);
   assert.equal(s.failed,false,route.name+' avoids collisions on burn '+(burn+1));
  }
  assert.ok(s.finished&&s.shards.every(Boolean),route.name+' collects all stars and reaches its beacon');
  const saved=JSON.parse(h.data['luna-star-routes-v1']);assert.ok(saved.cleared.includes(i));assert.ok(saved.shards.includes(i));
 }
 assert.equal(JSON.parse(h.data['luna-star-routes-v1']).cleared.length,12);
 assert.match(h.el('dialog').innerHTML,/星の名前を、あなたに/);
});
