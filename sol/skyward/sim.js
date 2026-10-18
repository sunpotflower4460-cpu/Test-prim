/* SKYWARD: deterministic flight, navigation and combat. SI units; fixed 120 Hz. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SkySim=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
'use strict';
const PI=Math.PI,TAU=PI*2,DEG=PI/180,G=9.80665;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),mix=(a,b,t)=>a+(b-a)*t;
const vec=(x=0,y=0,z=0)=>({x,y,z}),add=(a,b)=>vec(a.x+b.x,a.y+b.y,a.z+b.z),sub=(a,b)=>vec(a.x-b.x,a.y-b.y,a.z-b.z),mul=(a,k)=>vec(a.x*k,a.y*k,a.z*k),dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z,len=a=>Math.hypot(a.x,a.y,a.z),norm=a=>mul(a,1/Math.max(len(a),1e-9));
function forward(a){return vec(Math.sin(a.heading)*Math.cos(a.pitch),Math.sin(a.pitch),Math.cos(a.heading)*Math.cos(a.pitch));}
function aimForward(a){return forward({...a,pitch:a.pitch+(a.aoa||0)});}
function basis(a){const f=forward(a),r=vec(Math.cos(a.heading),0,-Math.sin(a.heading)),u=vec(-Math.sin(a.heading)*Math.sin(a.pitch),Math.cos(a.pitch),-Math.cos(a.heading)*Math.sin(a.pitch));return {f,r:add(mul(r,Math.cos(a.bank)),mul(u,-Math.sin(a.bank))),u:add(mul(u,Math.cos(a.bank)),mul(r,Math.sin(a.bank)))};}
const ISLANDS=[{x:0,z:-5500,rx:5200,rz:4300,h:780},{x:8500,z:7500,rx:5600,rz:7200,h:1600},{x:-9000,z:14000,rx:4200,rz:6500,h:1100},{x:11000,z:26000,rx:9000,rz:6000,h:1800},{x:-14000,z:-15000,rx:6000,rz:4800,h:1300}];
const BASE={x:0,y:26,z:-4900};
function terrain(x,z){let h=-18;for(const a of ISLANDS){const d=Math.hypot((x-a.x)/a.rx,(z-a.z)/a.rz);if(d<1){const ridge=.62+.22*Math.sin(x*.0013+z*.0007)+.16*Math.cos(z*.0018-x*.0006);h=Math.max(h,Math.pow(1-d,1.55)*a.h*ridge-18);}}if(Math.abs(x)<580&&z>-7100&&z<-2700)h=26;return h;}
const GATES=[vec(0,1500,3800),vec(600,1600,6200),vec(1800,1800,8600),vec(1800,1800,11300),vec(600,1600,13800),vec(-1700,1500,15000),vec(-3600,1400,13300),vec(-4300,1300,10800)];
const MISSIONS=[
{id:'school',name:'翼を知る',tag:'01 / FLIGHT SCHOOL',desc:'青い輪を8つくぐって、基地へ帰ろう。',radio:'オーロラ管制より。青い輪が次の目印。スマホは左下の円、PCは A/D で翼を傾けよう。',kind:'gates',enemies:0,missiles:0,time:0,goal:'航法リング 8個 → 帰投',weather:'morning'},
{id:'tracer',name:'白い航跡',tag:'02 / GUNNERY',desc:'無人標的3機を追い、機関砲の見越し射撃を学ぶ。',radio:'訓練空域へようこそ。黄色い見越し点を照準へ。距離1.8km以内で機関砲が届く。',kind:'drone',enemies:3,missiles:0,time:0,goal:'標的 3機 → 帰投',weather:'morning'},
{id:'intercept',name:'海峡の影',tag:'03 / INTERCEPT',desc:'海峡を南下する3機を迎撃。島の基地を守り、帰投する。',radio:'北の海峡に侵入機3機。基地へ向かっている。射程6.2km以内で捕捉し、ミサイルで迎撃せよ。',kind:'bomber',enemies:3,missiles:8,time:320,goal:'侵入機 3機 → 帰投',weather:'noon'},
{id:'escort',name:'灯を守る',tag:'04 / ESCORT',desc:'補給船団を襲う戦闘機を排除し、船団の航行を守る。',radio:'船団は岬へ向かっている。敵戦闘機3機が接近。敵の照準から逃れ、船団を守ってくれ。',kind:'fighter',enemies:3,missiles:8,time:0,goal:'敵戦闘機 3機・船団防衛 → 帰投',weather:'noon'},
{id:'home',name:'蒼穹の帰路',tag:'05 / FINAL SORTIE',desc:'最後の襲来。二波の敵編隊を退け、すべての灯が待つ基地へ帰る。',radio:'これが最後の出撃だ。二波の編隊を退けよう。空を守り終えたら、必ずここへ帰ってきてくれ。',kind:'ace',enemies:6,missiles:12,time:0,goal:'二波の編隊 6機 → 帰投',weather:'sunset'},
{id:'free',name:'空の余白',tag:'FREE FLIGHT',desc:'任務のない空。群島を巡り、飛行と着陸を自由に練習する。',kind:'free',enemies:0,missiles:0,time:0,goal:'自由飛行・着陸の練習',weather:'morning'}
];
function plane(x=0,y=1500,z=500){return {x,y,z,speed:205,heading:0,pitch:0,bank:0,rollRate:0,load:1,aoa:11200*G/(.5*1.225*Math.exp(-y/8500)*205**2*34*4.8),throttle:.68,health:100,fuel:100,stall:false,afterburner:false,gear:false,landed:false,dead:false};}
function flight(a,input,dt,assist=true){
 if(a.dead||a.landed)return;
 a.throttle=clamp(a.throttle+(input.throttle||0)*dt*.32,.05,1);const ab=!!input.boost,power=ab?1:a.throttle;a.afterburner=ab;
 const roll=(input.roll||0);let rate=roll*1.72;if(assist&&Math.abs(roll)<.02)rate=-a.bank*1.8;
 if(input.level){rate=-a.bank*2.8;}
 a.rollRate=mix(a.rollRate,rate,1-Math.exp(-dt*7));a.bank=wrap(a.bank+a.rollRate*dt);
 let pull=clamp(input.pitch||0,-1,1);if(input.level)pull=clamp(-a.pitch*4+(1/Math.max(Math.cos(a.bank),.5)-1)/6,-.5,1);
 const commanded=1+pull*(pull>0?6.5:3),rho=1.225*Math.exp(-Math.max(a.y,0)/8500),q=.5*rho*a.speed*a.speed,wing=34,mass=11200;
 const desiredCL=commanded*mass*G/Math.max(q*wing,1),alpha=desiredCL/4.8;
 a.aoa=mix(a.aoa,alpha,1-Math.exp(-dt*5));a.stall=Math.abs(a.aoa)>16*DEG||a.speed<82;
 let cl=clamp(a.aoa*4.8,-1.1,1.34);if(a.stall)cl*=Math.max(.32,1-(Math.abs(a.aoa)-16*DEG)*2.1);
 const actual=q*wing*cl/(mass*G);a.load=clamp(actual,-3,9);
 const drag=q*wing*(.024+.072*cl*cl+(a.gear?.034:0)+(.4*Math.max(0,a.speed/340-.9)**2)+(a.stall?.14:0));
 const thrust=(a.fuel>0?(power*82000+(ab?44000:0)):0)*Math.max(.4,1-a.y/24000);
 a.speed=clamp(a.speed+((thrust-drag)/mass-G*Math.sin(a.pitch))*dt,35,440);
 a.pitch=clamp(a.pitch+(a.load*G*Math.cos(a.bank)-G*Math.cos(a.pitch))/Math.max(a.speed,45)*dt,-85*DEG,85*DEG);
 a.heading=wrap(a.heading+(a.load*G*Math.sin(a.bank)/Math.max(a.speed*Math.cos(a.pitch),30)+(input.yaw||0)*.15)*dt);
 const f=forward(a);a.x+=f.x*a.speed*dt;a.y+=f.y*a.speed*dt;a.z+=f.z*a.speed*dt;
 a.fuel=clamp(a.fuel-dt*(ab?.048:.014)*(power+.1),0,100);
 return {ab,drag,thrust};
}
function create(mission=0){const m=MISSIONS[mission]||MISSIONS[0],s={version:1,mission:MISSIONS.indexOf(m),time:0,phase:m.kind==='free'?'free':'active',player:plane(),enemies:[],missiles:[],bullets:[],effects:[],events:[],gate:0,kills:0,selected:null,lock:0,gunHeat:0,overheated:false,gunTimer:0,missileTimer:0,flares:14,flareTimer:0,ammo:650,remaining:m.missiles,convoy:100,wave:1,nextId:1,stats:{shots:0,hits:0,gunHits:0,missiles:0,damage:0,maxG:1,maxSpeed:205,lowAltitude:1500},ended:false,result:null};
 if(m.kind!=='free'&&m.kind!=='gates')spawn(s,m.kind==='ace'?3:m.enemies);return s;}
function spawn(s,count){const m=MISSIONS[s.mission];for(let i=0;i<count;i++){const e=plane((i-1)*1800,1600+i*160,(m.kind==='bomber'?24500:5500)+i*1250+(s.wave-1)*3500);e.id=s.nextId++;e.type=m.kind;e.health=m.kind==='bomber'?150:90;e.speed=m.kind==='bomber'?112:m.kind==='drone'?148:180;e.heading=m.kind==='bomber'?PI:m.kind==='drone'?0:PI;e.cooldown=4+i*3;e.evade=0;e.flares=(m.kind==='ace'||m.kind==='fighter')?1:0;s.enemies.push(e);}if(s.selected==null)s.selected=alive(s)[0]?.id??null;}
function alive(s){return s.enemies.filter(e=>!e.dead);}
function target(s){return s.enemies.find(e=>e.id===s.selected&&!e.dead)||null;}
function cycleTarget(s){const list=alive(s);if(!list.length){s.selected=null;return;}const i=list.findIndex(e=>e.id===s.selected);s.selected=list[(i+1)%list.length].id;s.lock=0;}
function gunLead(p,e){const d=sub(e,p),v=mul(forward(e),e.speed),bulletSpeed=920+p.speed,a=dot(v,v)-bulletSpeed*bulletSpeed,b=2*dot(d,v),c=dot(d,d),disc=b*b-4*a*c;let t=len(d)/bulletSpeed;if(disc>=0){const t1=(-b+Math.sqrt(disc))/(2*a),t2=(-b-Math.sqrt(disc))/(2*a);t=Math.min(...[t1,t2].filter(n=>n>0));}return add(e,mul(v,Number.isFinite(t)?t:0));}
function targetInfo(s,e=target(s)){if(!e)return null;const d=sub(e,s.player),distance=len(d),angle=Math.acos(clamp(dot(norm(d),aimForward(s.player)),-1,1)),velocity=mul(forward(e),e.speed),lead=gunLead(s.player,e);return {distance,angle,lead,canLock:distance<6200&&distance>250&&angle<24*DEG};}
function event(s,type,text){s.events.push({type,text});}
function end(s,success,reason,landing=false){if(s.ended)return;s.ended=true;s.phase='ended';const medal=success?(landing&&s.player.health>=60?'S':s.player.health>=65?'A':'B'):null;s.result={success,reason,landing,medal,time:s.time,kills:s.kills,health:Math.round(s.player.health),fuel:Math.round(s.player.fuel),...s.stats};event(s,'end',reason);}
function hit(s,e,damage,gun=false){if(e.dead)return;e.health-=damage;s.stats.hits++;if(gun)s.stats.gunHits++;if(e.health<=0){e.dead=true;s.kills++;s.effects.push({x:e.x,y:e.y,z:e.z,life:3,size:85,type:'burst'});event(s,'kill',`目標撃破 ${s.kills} / ${MISSIONS[s.mission].enemies}`);if(e.id===s.selected)cycleTarget(s);}}
function launch(s){const t=target(s),info=targetInfo(s);if(!t||!info?.canLock||s.lock<1.5||s.remaining<=0||s.missileTimer>0)return false;s.remaining--;s.stats.missiles++;s.missileTimer=1.2;s.lock=0;const f=aimForward(s.player);s.missiles.push({...vec(s.player.x,s.player.y-2,s.player.z),vx:f.x*420,vy:f.y*420,vz:f.z*420,target:t.id,enemy:false,life:14,trail:[]});event(s,'launch','ミサイル発射');return true;}
function flare(s){if(s.flares<=0||s.flareTimer>0)return false;s.flares--;s.flareTimer=1.4;for(const m of s.missiles)if(m.enemy&&len(sub(m,s.player))<2600){m.target=null;m.life=Math.min(m.life,1.4);}s.effects.push({...vec(s.player.x,s.player.y,s.player.z),life:2.3,size:30,type:'flare'});event(s,'flare','フレア散布');return true;}
function segmentDistance(p,a,b){const d=sub(b,a),t=clamp(dot(sub(p,a),d)/Math.max(dot(d,d),1e-8),0,1);return len(sub(p,add(a,mul(d,t))));}
function convoyPosition(s){return vec(-3400,10,7200+s.time*10);}
function enemyStep(s,e,dt){if(e.dead)return;const m=MISSIONS[s.mission],a=s.player;
 if(e.type==='drone'){e.heading+=dt*.016;e.pitch=Math.sin(s.time*.15+e.id)*.025;e.bank=.12;}
 else if(e.type==='bomber'){e.heading=mix(e.heading,PI,dt*.15);e.pitch=-.004;}
 else {const playerDelta=sub(a,e),dist=len(playerDelta),ship=convoyPosition(s),engageShip=m.kind==='fighter'&&dist>4500,aim=engageShip?{...ship,y:500}:a,d=sub(aim,e),desired=Math.atan2(d.x,d.z);let turn=wrap(desired-e.heading);e.evade=Math.max(0,e.evade-dt);const incoming=s.missiles.find(b=>!b.enemy&&b.target===e.id&&len(sub(b,e))<1450);if(incoming&&e.flares>0&&e.evade<=0){e.flares--;e.evade=2.8;incoming.target=null;incoming.life=Math.min(incoming.life,1.5);s.effects.push({x:e.x,y:e.y,z:e.z,life:2.3,size:30,type:'flare'});event(s,'enemyFlare','敵がフレアを散布。再捕捉し、もう一度迎撃を。');}if(e.evade>0)turn=1.2*(e.id%2?1:-1);else if((s.time+e.id*3)%22>16)turn=0;if(dist<550&&Math.abs(turn)<.9)turn+=.85;e.heading=wrap(e.heading+clamp(turn,-1,1)*dt*(e.type==='ace'?.33:.24));e.bank=mix(e.bank,clamp(turn,-1,1)*.9,dt*3);e.pitch=mix(e.pitch,clamp(Math.atan2(d.y,Math.hypot(d.x,d.z))*.35+(1600+e.id*80-e.y)*.0003,-.25,.25),dt*.6);e.speed=mix(e.speed,dist>1600?220:165,dt*.25);e.cooldown-=dt;
 if(dist<5500&&dist>650&&Math.abs(turn)<.32&&e.cooldown<=0){e.cooldown=e.type==='ace'?17:25;const f=forward(e);s.missiles.push({x:e.x,y:e.y,z:e.z,vx:f.x*380,vy:f.y*380,vz:f.z*380,target:'player',enemy:true,life:13,trail:[]});event(s,'threat','ミサイル警報。フレア C、旋回して回避！');}
 if(dist<1500&&Math.abs(turn)<.11&&Math.abs(a.y-e.y)<170){a.health-=dt*3.8;s.stats.damage+=dt*3.8;}
 }
 const f=forward(e);e.x+=f.x*e.speed*dt;e.y+=f.y*e.speed*dt;e.z+=f.z*e.speed*dt;
 e.y=Math.max(e.y,terrain(e.x,e.z)+260);if(len(sub(e,a))<18){a.health=0;event(s,'hit','敵機と衝突しました。');}
 if(e.type==='bomber'&&e.z<BASE.z+2500){s.convoy-=dt*9;}
 if(m.kind==='fighter'){const ship=convoyPosition(s),delta=sub(ship,e),range=Math.hypot(delta.x,delta.z),angle=Math.abs(wrap(Math.atan2(delta.x,delta.z)-e.heading));if(range<2400&&angle<.4)s.convoy-=dt*1.8;}
}
function gateNormal(i){const prev=i===0?vec(0,1500,500):GATES[i-1],next=GATES[Math.min(i+1,GATES.length-1)],d=sub(next,prev);return norm(vec(d.x,0,d.z));}
function crossesGate(before,after,i){const center=GATES[i],n=gateNormal(i),a=dot(sub(before,center),n),b=dot(sub(after,center),n);if(a>0||b<0||Math.abs(b-a)<1e-8)return false;const crossing=add(before,mul(sub(after,before),-a/(b-a)));return len(sub(crossing,center))<390;}
function update(s,input={},dt=1/120,assist=true){if(s.ended)return;s.time+=dt;const p=s.player,m=MISSIONS[s.mission];if(p.landed){p.speed=Math.max(0,p.speed-dt*22);p.x+=Math.sin(p.heading)*p.speed*dt;p.z+=Math.cos(p.heading)*p.speed*dt;if(p.speed<=.5)end(s,true,'着陸完了。おかえり、オーロラ1。',true);return;}s.missileTimer=Math.max(0,s.missileTimer-dt);s.flareTimer=Math.max(0,s.flareTimer-dt);s.gunTimer-=dt;const beforeFlight=vec(p.x,p.y,p.z);
 flight(p,input,dt,assist);s.stats.maxG=Math.max(s.stats.maxG,p.load);s.stats.maxSpeed=Math.max(s.stats.maxSpeed,p.speed);s.stats.lowAltitude=Math.min(s.stats.lowAltitude,p.y);
 const ground=Math.max(0,terrain(p.x,p.z));if(p.y<=ground+3){const runway=Math.abs(p.x)<55&&p.z>-6300&&p.z<-3450&&Math.abs(wrap(p.heading-PI))<.3;const safe=runway&&p.gear&&p.speed<115&&p.speed>45&&p.pitch>-.08&&p.pitch<.12&&Math.abs(p.bank)<.17;
 if(safe){p.y=29;p.landed=true;p.pitch=p.bank=p.aoa=0;p.throttle=0;p.afterburner=p.stall=false;if(s.phase==='return'||m.kind==='free'){s.phase='landing';event(s,'landing','接地。制動中。おかえり、オーロラ1。');}else end(s,false,'任務が残っています。整備を済ませ、再出撃しましょう。');}else {p.dead=true;end(s,false,'地表に接触しました。高度と失速に注意して再出撃を。');}return;}
 if(p.health<=0){p.dead=true;end(s,false,'機体が損傷限界に達しました。');return;}if(Math.hypot(p.x,p.z)>70000){end(s,false,'任務空域を離脱しました。');return;}
 for(const e of s.enemies)enemyStep(s,e,dt);
 const info=targetInfo(s);s.lock=info?.canLock?Math.min(1.8,s.lock+dt):Math.max(0,s.lock-dt*3);
 if(input.gun&&s.ammo>0&&!s.overheated&&s.gunTimer<=0){s.gunTimer=.075;s.ammo--;s.stats.shots++;s.gunHeat=Math.min(1.08,s.gunHeat+.017);const f=aimForward(p),b={x:p.x+f.x*15,y:p.y+f.y*15,z:p.z+f.z*15,vx:f.x*(920+p.speed),vy:f.y*(920+p.speed),vz:f.z*(920+p.speed),life:1.75};s.bullets.push(b);}if(s.gunHeat>=1)s.overheated=true;if(!input.gun||s.overheated)s.gunHeat=Math.max(0,s.gunHeat-dt*.34);if(s.overheated&&s.gunHeat<=.25)s.overheated=false;
 for(const b of s.bullets){const before=vec(b.x,b.y,b.z);b.x+=b.vx*dt;b.y+=b.vy*dt;b.z+=b.vz*dt;b.life-=dt;for(const e of s.enemies)if(!e.dead&&segmentDistance(e,before,b)<25){hit(s,e,19,true);b.life=0;break;}}
 for(const missile of s.missiles){missile.life-=dt;const t=missile.enemy?(missile.target==='player'?p:null):s.enemies.find(e=>e.id===missile.target&&!e.dead);const before=vec(missile.x,missile.y,missile.z);
 if(t){const v=vec(missile.vx,missile.vy,missile.vz),speed=len(v),wanted=norm(sub(add(t,mul(forward(t),t.speed*.28)),missile)),current=norm(v),angle=Math.acos(clamp(dot(current,wanted),-1,1)),fraction=angle<1e-4?1:Math.min(1,dt*(missile.enemy?.36:.85)/angle),next=norm(add(mul(current,1-fraction),mul(wanted,fraction))),ns=Math.min(missile.enemy?520:720,speed+dt*125);missile.vx=next.x*ns;missile.vy=next.y*ns;missile.vz=next.z*ns;}
 missile.x+=missile.vx*dt;missile.y+=missile.vy*dt;missile.z+=missile.vz*dt;if(!missile.trail.length||len(sub(missile,missile.trail[missile.trail.length-1]))>45){missile.trail.push(vec(missile.x,missile.y,missile.z));if(missile.trail.length>28)missile.trail.shift();}
 if(t&&segmentDistance(t,before,missile)<(missile.enemy?42:65)){missile.life=0;if(missile.enemy){p.health-=32;s.stats.damage+=32;s.effects.push({x:p.x,y:p.y,z:p.z,life:.8,size:22,type:'hit'});event(s,'hit','被弾。機体を立て直せ！');}else hit(s,t,160);}
 if(missile.y<Math.max(0,terrain(missile.x,missile.z)))missile.life=0;
 }
 s.bullets=s.bullets.filter(b=>b.life>0);s.missiles=s.missiles.filter(b=>b.life>0);for(const e of s.effects)e.life-=dt;s.effects=s.effects.filter(e=>e.life>0);
 if(m.kind==='gates'&&s.gate<GATES.length&&crossesGate(beforeFlight,p,s.gate)){s.gate++;event(s,'gate',`航法リング ${s.gate} / ${GATES.length}`);}
 if(s.phase==='active'){
 if(m.kind==='ace'&&s.kills===3&&s.wave===1){s.wave=2;spawn(s,3);event(s,'wave','第二波を確認。残り3機。');}
 const done=m.kind==='gates'?s.gate===GATES.length:m.kind!=='free'&&s.kills>=m.enemies;
 if(done){s.phase='return';event(s,'return','任務達成。帰投ビーコンへ。着陸なら最高評価、上空通過でも帰投できる。');}
 if((m.time>0&&s.time>m.time&&s.kills<m.enemies)||s.convoy<=0)end(s,false,'防衛対象への侵入を許しました。迎撃を優先し、もう一度挑戦を。');
 }
 if(s.phase==='return'&&!p.gear&&Math.hypot(p.x-BASE.x,p.z-BASE.z)<1150&&p.y>100&&p.y<1000&&p.speed<270)end(s,true,'帰投完了。群島の灯を守りました。');
 if(p.fuel<=0&&p.y<100)event(s,'fuel','燃料がありません。滑空して着陸を。');
 if(s.events.length>12)s.events.splice(0,s.events.length-12);
}
function destination(s){if(s.phase==='return'||s.phase==='landing'||MISSIONS[s.mission].kind==='free')return {...BASE,y:600,label:'帰投ビーコン'};if(MISSIONS[s.mission].kind==='gates')return {...GATES[s.gate],label:`航法リング ${s.gate+1} / 8`};const t=target(s);return t?{...vec(t.x,t.y,t.z),label:'選択目標'}:null;}
function serialize(s){const c=JSON.parse(JSON.stringify(s));c.effects=[];c.bullets=[];c.events=[];return c;}
function restore(data){try{if(!data||data.version!==1||!Number.isInteger(data.mission)||data.mission<0||data.mission>=MISSIONS.length||data.ended||!['active','return','free','landing'].includes(data.phase))return null;const p=data.player;if(!p||!['x','y','z','speed','heading','pitch','bank','throttle','health','fuel','load','aoa','rollRate'].every(k=>Number.isFinite(p[k])))return null;if(Math.hypot(p.x,p.z)>70000||p.y<0||p.y>40000||p.speed<(data.phase==='landing'?0:30)||p.speed>450||p.health<=0||p.health>100||p.fuel<0||p.fuel>100||!Array.isArray(data.enemies)||data.enemies.length>6||!data.enemies.every(e=>Number.isInteger(e.id)&&['x','y','z','speed','heading','pitch','bank','health'].every(k=>Number.isFinite(e[k]))))return null;if(!Number.isFinite(data.time)||data.time<0||data.time>30000||!Number.isInteger(data.gate)||data.gate<0||data.gate>8||!Number.isInteger(data.kills)||data.kills<0||data.kills>6)return null;for(const k of ['lock','gunHeat','gunTimer','missileTimer','flares','flareTimer','ammo','remaining','convoy','wave','nextId'])if(!Number.isFinite(data[k]))return null;if(!data.stats||!['shots','hits','gunHits','missiles','damage','maxG','maxSpeed','lowAltitude'].every(k=>Number.isFinite(data.stats[k])))return null;for(const [k,max]of [['flares',14],['ammo',650],['remaining',12],['kills',6]])if(!Number.isInteger(data[k])||data[k]<0||data[k]>max)return null;if(!data.enemies.every(e=>['cooldown','evade','flares'].every(k=>Number.isFinite(e[k]))))return null;if(!Array.isArray(data.missiles)||data.missiles.length>30||!data.missiles.every(m=>['x','y','z','vx','vy','vz','life'].every(k=>Number.isFinite(m[k]))&&typeof m.enemy==='boolean'))return null;if(data.phase==='landing'&&(!p.landed||!p.gear||p.speed>115||Math.abs(p.x)>55||p.y!==29))return null;const s=serialize(data);s.missiles.forEach(m=>m.trail=[]);return s;}catch{return null;}}
return {G,DEG,TAU,clamp,wrap,mix,vec,add,sub,mul,dot,len,norm,forward,aimForward,basis,ISLANDS,BASE,GATES,MISSIONS,terrain,plane,flight,create,update,alive,target,cycleTarget,targetInfo,gunLead,convoyPosition,gateNormal,crossesGate,launch,flare,destination,serialize,restore,segmentDistance,end};
});
