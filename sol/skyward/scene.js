import * as T from './vendor/three.module.js';
const S=window.SkySim;
const mat=(color,metalness=.05,roughness=.7)=>new T.MeshStandardMaterial({color,metalness,roughness});
function mesh(g,m,x=0,y=0,z=0){const o=new T.Mesh(g,m);o.position.set(x,y,z);return o;}
function polygon(vertices,material,thickness=.1){const shape=new T.Shape();vertices.forEach(([x,z],i)=>i?shape.lineTo(x,z):shape.moveTo(x,z));shape.closePath();const g=new T.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:false});g.rotateX(Math.PI/2);g.translate(0,thickness/2,0);return mesh(g,material);}
export function aircraft(enemy=false){
 const group=new T.Group(),skin=mat(enemy?'#667279':'#c2d0d6',.52,.37),dark=mat('#34434b',.35,.6),trim=mat(enemy?'#ce764d':'#dba261',.4,.45),canopy=new T.MeshPhysicalMaterial({color:'#426479',metalness:.5,roughness:.12,clearcoat:1});
 // A tapered fuselage, swept wings, twin stabilizers and engine nozzles.
 const zs=[-7,-5,-2,1,3.5,5.8,8.5],rs=[.55,1.3,1.36,1.05,.83,.48,.015],positions=[],indices=[],sides=12;
 for(let j=0;j<zs.length;j++)for(let i=0;i<sides;i++){const a=i/sides*Math.PI*2;positions.push(Math.cos(a)*rs[j],Math.sin(a)*rs[j]*.63,zs[j]);}
 for(let j=0;j<zs.length-1;j++)for(let i=0;i<sides;i++){const a=j*sides+i,b=j*sides+(i+1)%sides,c=a+sides,d=b+sides;indices.push(a,c,b,b,c,d);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();group.add(mesh(g,skin));
 group.add(polygon([[-.9,2.7],[-6.7,-2.7],[-6.2,-4],[-1.1,-3.3]],skin,.17));group.add(polygon([[.9,2.7],[6.7,-2.7],[6.2,-4],[1.1,-3.3]],skin,.17));
 group.add(polygon([[-.75,-4.7],[-3.3,-6.1],[-3.1,-7.2],[-.7,-6.8]],skin,.1));group.add(polygon([[.75,-4.7],[3.3,-6.1],[3.1,-7.2],[.7,-6.8]],skin,.1));
 const glass=mesh(new T.SphereGeometry(1,16,12),canopy,0,.57,2.3);glass.scale.set(.65,.65,2.2);group.add(glass);
 for(const side of [-1,1]){
  const fg=new T.BufferGeometry();fg.setAttribute('position',new T.Float32BufferAttribute([side*.65,.35,-4.0,side*1.25,2.8,-5.7,side*1.25,2.8,-6.9,side*.65,.35,-6.4],3));fg.setIndex([0,1,2,0,2,3]);fg.computeVertexNormals();const fm=skin.clone();fm.side=T.DoubleSide;group.add(mesh(fg,fm));
  const inlet=mesh(new T.BoxGeometry(.63,.6,2.2),dark,side*1.07,-.15,.1);group.add(inlet);
  const nozzle=mesh(new T.CylinderGeometry(.47,.40,1.6,12,1,true),dark,side*.55,-.12,-6.6);nozzle.rotation.x=Math.PI/2;group.add(nozzle);
  const flame=mesh(new T.ConeGeometry(.38,4.2,12),new T.MeshBasicMaterial({color:'#ffb968',transparent:true,opacity:.85,depthWrite:false}),side*.55,-.12,-9.2);flame.rotation.x=-Math.PI/2;group.add(flame);flame.name='flame';
  const inner=mesh(new T.ConeGeometry(.18,3,10),new T.MeshBasicMaterial({color:'#d9edff',transparent:true,opacity:.8}),side*.55,-.12,-8.9);inner.rotation.x=-Math.PI/2;group.add(inner);inner.name='flame';
  const stripe=polygon([[side*3,-2],[side*4.3,-2.8],[side*4.3,-3.15],[side*3,-2.4]],trim,.19);stripe.position.y=.02;group.add(stripe);
 }
 const gear=new T.Group();for(const [x,z]of [[0,3.2],[-1.2,-2.7],[1.2,-2.7]]){gear.add(mesh(new T.CylinderGeometry(.08,.08,1.15,6),dark,x,-1.2,z));const wheel=mesh(new T.CylinderGeometry(.28,.28,.18,10),dark,x,-1.9,z);wheel.rotation.z=Math.PI/2;gear.add(wheel);}gear.name='gear';gear.visible=false;group.add(gear);
 return group;
}
export class World{
 constructor(canvas){
  this.renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.08;
  this.scene=new T.Scene();this.scene.fog=new T.Fog('#acc2ce',8500,48000);this.camera=new T.PerspectiveCamera(61,1,1,110000);this.clock=0;this.enemyMeshes=new Map();this.effectMeshes=[];this.quality='high';this.reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  this.scene.add(new T.HemisphereLight('#e4effa','#6f796a',2.2));this.sun=new T.DirectionalLight('#ffe4bc',3.5);this.sun.position.set(-17000,16000,8000);this.scene.add(this.sun);
  const skyMat=new T.ShaderMaterial({side:T.BackSide,uniforms:{sun:{value:new T.Vector3(-.55,.38,.2).normalize()},dusk:{value:0}},vertexShader:'varying vec3 vPos;void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`varying vec3 vPos;uniform vec3 sun;uniform float dusk;void main(){vec3 d=normalize(vPos);float h=max(d.y,0.);vec3 horizon=mix(vec3(.68,.79,.84),vec3(.77,.52,.40),dusk);vec3 zenith=mix(vec3(.17,.39,.61),vec3(.16,.24,.40),dusk);vec3 c=mix(horizon,zenith,pow(h,.48));float s=max(dot(d,sun),0.);c+=vec3(1.,.71,.35)*(pow(s,28.)*.22+pow(s,600.)*.8+smoothstep(.99965,.99985,s)*1.6);gl_FragColor=vec4(c,1.);}`});
  this.sky=mesh(new T.SphereGeometry(98000,32,16),skyMat);this.scene.add(this.sky);
  this.ocean=mesh(new T.PlaneGeometry(180000,180000,1,1),new T.ShaderMaterial({uniforms:{time:{value:0},sun:{value:new T.Vector3(-.55,.38,.2).normalize()},dusk:{value:0}},vertexShader:`varying vec3 world;void main(){world=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);}`,fragmentShader:`varying vec3 world;uniform float time;uniform vec3 sun;uniform float dusk;void main(){vec3 v=normalize(cameraPosition-world);float wave=sin(world.x*.025+time*.8)*cos(world.z*.017-time*.55);vec3 n=normalize(vec3(.035*cos(world.x*.025+time*.8),1.,.045*sin(world.z*.017-time*.55)));float f=pow(1.-max(dot(n,v),0.),3.);vec3 deep=mix(vec3(.055,.19,.24),vec3(.11,.19,.27),dusk);vec3 col=mix(deep,vec3(.51,.65,.70),f*.86);float glare=pow(max(dot(reflect(-sun,n),v),0.),70.);col+=vec3(1.,.76,.46)*glare*.85;col+=wave*.013;float dist=length(cameraPosition-world);col=mix(col,mix(vec3(.65,.75,.80),vec3(.66,.47,.38),dusk),smoothstep(12000.,65000.,dist));gl_FragColor=vec4(col,1.);}`}));this.ocean.rotation.x=-Math.PI/2;this.ocean.position.y=-.5;this.scene.add(this.ocean);
  this.makeTerrain();this.makeBase();this.makeClouds();this.playerMesh=aircraft();this.scene.add(this.playerMesh);
  this.gates=S.GATES.map((p,i)=>{const ring=mesh(new T.TorusGeometry(390,7,8,48),new T.MeshBasicMaterial({color:'#67dfd2',transparent:true,opacity:.7}));ring.position.set(p.x,p.y,p.z);const next=S.GATES[Math.min(i+1,S.GATES.length-1)],prev=S.GATES[Math.max(i-1,0)];ring.rotation.y=Math.atan2(next.x-prev.x,next.z-prev.z);this.scene.add(ring);return ring;});
  this.beacon=mesh(new T.TorusGeometry(450,9,8,48),new T.MeshBasicMaterial({color:'#edcb85',transparent:true,opacity:.85}));this.beacon.position.set(0,600,S.BASE.z);this.scene.add(this.beacon);
  this.bulletGeometry=new T.BufferGeometry();this.bulletGeometry.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(300*6),3));this.bulletLines=new T.LineSegments(this.bulletGeometry,new T.LineBasicMaterial({color:'#ffeeb4',transparent:true,opacity:.9}));this.bulletLines.frustumCulled=false;this.scene.add(this.bulletLines);
  this.missileGeometry=new T.BufferGeometry();this.missileGeometry.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(30*30*6),3));this.missileLines=new T.LineSegments(this.missileGeometry,new T.LineBasicMaterial({color:'#dfddd2',transparent:true,opacity:.5}));this.missileLines.frustumCulled=false;this.scene.add(this.missileLines);
  this.shipGroup=new T.Group();const hull=mat('#334b57',.2,.7),deck=mat('#b5b8aa');for(let i=0;i<3;i++){const ship=new T.Group();const h=mesh(new T.BoxGeometry(35,14,120),hull);ship.add(h,mesh(new T.BoxGeometry(29,5,100),deck,0,8,0),mesh(new T.BoxGeometry(18,22,22),deck,0,21,-25));ship.position.set(-3400+i*170,8,7200+i*250);this.shipGroup.add(ship);}this.scene.add(this.shipGroup);
  this._q=new T.Quaternion();this._matrix=new T.Matrix4();this._v=new T.Vector3();this._cam=new T.Vector3();this._look=new T.Vector3();this._r=new T.Vector3();this._u=new T.Vector3();this._f=new T.Vector3();
 }
 makeTerrain(){
  const n=224,size=62000,positions=[],colors=[],indices=[];
  for(let z=0;z<=n;z++)for(let x=0;x<=n;x++){const wx=(x/n-.5)*size,wz=(z/n-.25)*size,h=S.terrain(wx,wz);positions.push(wx,h,wz);let c=h<15?new T.Color('#b5b5a0'):h<90?new T.Color('#969f71'):h<500?new T.Color('#60745b'):h<950?new T.Color('#697b68'):new T.Color('#aaa99b');const shade=.85+.15*Math.sin(wx*.01)*Math.cos(wz*.008);c.multiplyScalar(shade);colors.push(c.r,c.g,c.b);}
  for(let z=0;z<n;z++)for(let x=0;x<n;x++){const a=z*(n+1)+x,b=a+1,c=a+n+1,d=c+1;indices.push(a,c,b,b,c,d);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();this.scene.add(mesh(g,new T.MeshStandardMaterial({vertexColors:true,roughness:1,metalness:0})));
 }
 makeBase(){
  const runway=mesh(new T.BoxGeometry(110,1,2800),mat('#4a5455'),0,26.6,-4900);this.scene.add(runway);const white=new T.MeshBasicMaterial({color:'#e2dfca'}),gold=new T.MeshBasicMaterial({color:'#e8cd7d'});
  for(let i=0;i<24;i++){this.scene.add(mesh(new T.BoxGeometry(3,.15,45),white,0,27.2,-6250+i*115));for(const x of [-53,53])this.scene.add(mesh(new T.BoxGeometry(1.5,.15,100),white,x,27.1,-6250+i*115));}
  for(let side of [-1,1])for(let i=0;i<5;i++)this.scene.add(mesh(new T.BoxGeometry(4,.2,115),white,side*(10+i*8),27.2,-6110));
  const hangar=mat('#a0a8a0'),roof=mat('#687a7d');for(let i=0;i<6;i++){this.scene.add(mesh(new T.BoxGeometry(100,35,100),hangar,220,44,-5850+i*180));this.scene.add(mesh(new T.BoxGeometry(105,3,105),roof,220,63,-5850+i*180));}
  this.scene.add(mesh(new T.CylinderGeometry(13,18,55,8),hangar,-180,53,-3900),mesh(new T.BoxGeometry(36,15,36),mat('#405966'),-180,87,-3900));
  for(let i=0;i<16;i++)for(const x of [-62,62])this.scene.add(mesh(new T.SphereGeometry(1.8,6,4),gold,x,29,-6300+i*190));
 }
 makeClouds(){
  const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');for(let i=0;i<17;i++){const x=77+(Math.sin(i*12.7)*.5+.5)*100,y=99+(Math.cos(i*7.3)*.5+.5)*50,r=34+i%5*4;const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(255,255,255,.34)');g.addColorStop(.5,'rgba(255,255,255,.21)');g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(0,0,256,256);}
  const texture=new T.CanvasTexture(c);for(let i=0;i<105;i++){const m=new T.SpriteMaterial({map:texture,color:'#e9eff0',transparent:true,opacity:.7,depthWrite:false});const cloud=new T.Sprite(m);cloud.position.set(Math.sin(i*2.399)*(.4+i/105)*30000,3400+Math.sin(i*17.4)*650,Math.cos(i*2.399)*30000+8000);cloud.scale.set(1700+i%6*250,750+i%3*250,1);this.scene.add(cloud);}
 }
 resize(w,h,quality='high'){this.quality=quality;this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,quality==='high'?1.6:1));this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
 orient(obj,a){const b=S.basis({...a,pitch:a.pitch+(a.aoa||0)});this._r.set(b.r.x,b.r.y,b.r.z);this._u.set(b.u.x,b.u.y,b.u.z);this._f.set(b.f.x,b.f.y,b.f.z);this._matrix.makeBasis(this._r,this._u,this._f);obj.quaternion.setFromRotationMatrix(this._matrix);obj.position.set(a.x,a.y,a.z);}
 project(p,w,h){this._v.set(p.x,p.y,p.z).project(this.camera);return {x:(this._v.x*.5+.5)*w,y:(-.5*this._v.y+.5)*h,behind:this._v.z>1};}
 resetCamera(s){const p=s.player,f=S.forward(p);this.camera.position.set(p.x-f.x*45,p.y-f.y*45+15,p.z-f.z*45);this._look.set(p.x+f.x*180,p.y+f.y*180,p.z+f.z*180);}
 render(s,dt,view='chase',menu=false){
  this.clock+=dt;const p=s.player,m=S.MISSIONS[s.mission],dusk=m.weather==='sunset'?1:0;this.sky.material.uniforms.dusk.value=dusk;this.ocean.material.uniforms.dusk.value=dusk;this.ocean.material.uniforms.time.value=this.clock;this.scene.fog.color.set(dusk?'#ae8c7d':'#acc2ce');this.orient(this.playerMesh,p);this.playerMesh.getObjectByName('gear').visible=p.gear;this.playerMesh.visible=view!=='nose'||menu;this.playerMesh.traverse(o=>{if(o.name==='flame'){o.visible=p.afterburner;o.scale.y=1+(Math.sin(this.clock*37)*.05);}});
  for(const e of s.enemies){let o=this.enemyMeshes.get(e.id);if(!o){o=aircraft(true);this.enemyMeshes.set(e.id,o);this.scene.add(o);}o.visible=!e.dead;this.orient(o,e);}
  for(const [id,o]of this.enemyMeshes)if(!s.enemies.some(e=>e.id===id)){this.scene.remove(o);this.enemyMeshes.delete(id);o.traverse(x=>{x.geometry?.dispose();if(x.material)x.material.dispose();});}
  this.gates.forEach((o,i)=>{o.visible=m.kind==='gates'&&i>=s.gate&&!menu;o.material.opacity=i===s.gate?.85:.18;});this.beacon.visible=s.phase==='return'||m.kind==='free';
  this.shipGroup.visible=m.kind==='fighter'||m.kind==='ace';this.shipGroup.position.z=s.time*10;
  const bp=this.bulletGeometry.attributes.position.array;let n=0;for(const b of s.bullets.slice(-300)){bp.set([b.x,b.y,b.z,b.x-b.vx*.035,b.y-b.vy*.035,b.z-b.vz*.035],n*6);n++;}this.bulletGeometry.setDrawRange(0,n*2);this.bulletGeometry.attributes.position.needsUpdate=true;
  const mp=this.missileGeometry.attributes.position.array;n=0;for(const b of s.missiles.slice(-30)){mp.set([b.x,b.y,b.z,b.x-b.vx*.09,b.y-b.vy*.09,b.z-b.vz*.09],n++*6);for(let i=1;i<b.trail.length;i++){const a=b.trail[i-1],t=b.trail[i];mp.set([a.x,a.y,a.z,t.x,t.y,t.z],n++*6);}}this.missileGeometry.setDrawRange(0,n*2);this.missileGeometry.attributes.position.needsUpdate=true;
  for(let i=0;i<20;i++){let o=this.effectMeshes[i];const e=s.effects[i];if(!e){if(o)o.visible=false;continue;}if(!o){o=mesh(new T.IcosahedronGeometry(1,1),new T.MeshBasicMaterial({color:'#ffa852',transparent:true,depthWrite:false}));this.effectMeshes[i]=o;this.scene.add(o);}o.visible=true;o.position.set(e.x,e.y,e.z);const t=e.life/(e.type==='burst'?3:2.3);o.scale.setScalar(e.size*(1-t*.7));o.material.opacity=Math.max(0,t*.75);o.material.color.set(e.type==='flare'?'#fff2ba':'#ffaf67');}
  const f=S.forward(p);let desired,look;
  if(menu){const t=this.clock*.07;desired=new T.Vector3(p.x+Math.sin(t)*50,p.y+8,p.z+Math.cos(t)*50);look=new T.Vector3(p.x,p.y,p.z);}
  else if(view==='nose'){desired=new T.Vector3(p.x+f.x*7,p.y+f.y*7+1.7,p.z+f.z*7);look=new T.Vector3(p.x+f.x*1000,p.y+f.y*1000,p.z+f.z*1000);}
  else {const dist=view==='wide'?78:45;desired=new T.Vector3(p.x-f.x*dist,p.y-f.y*dist+(view==='wide'?27:14),p.z-f.z*dist);look=new T.Vector3(p.x+f.x*250,p.y+f.y*250+2,p.z+f.z*250);}
  const fov=61+(!this.reduceMotion&&!menu?S.clamp((p.speed-220)*.035,0,7):0);if(Math.abs(this.camera.fov-fov)>.04){this.camera.fov=fov;this.camera.updateProjectionMatrix();}this.camera.position.lerp(desired,menu?1:1-Math.exp(-dt*8));this._look.lerp(look,1-Math.exp(-dt*11));this.camera.up.set(f.x*Math.sin(-p.bank*.16),1,f.z*Math.sin(p.bank*.16));this.camera.lookAt(this._look);this.sky.position.copy(this.camera.position);this.renderer.render(this.scene,this.camera);
 }
}
