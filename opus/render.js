/* MIZUHO — 瑞穂 / renderer.
   WebGL2 diorama: the valley is a block of earth floating in the weather of
   its season. Terrain, water and rice are drawn from the simulation's arrays,
   uploaded as float textures every frame. */
(function (root) {
  "use strict";

  // ---- small linear algebra ----------------------------------------------------
  const M = {
    perspective(fov, aspect, near, far) {
      const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
      return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
    },
    lookAt(e, c, u) {
      let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2];
      let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
      let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx;
      l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
      const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
      return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
        -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1]);
    },
    mul(a, b) {
      const o = new Float32Array(16);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
        o[i * 4 + j] = s;
      }
      return o;
    },
    invert(m) {
      const o = new Float32Array(16);
      const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3], a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
      const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11], a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
      const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
      const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
      const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
      let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
      if (!det) return o; det = 1 / det;
      o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
      o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
      o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
      o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
      o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
      o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
      o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
      o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
      return o;
    },
    xform(m, x, y, z) {
      const w = m[3] * x + m[7] * y + m[11] * z + m[15];
      return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w, (m[2] * x + m[6] * y + m[10] * z + m[14]) / w, w];
    }
  };

  // ---- shared GLSL ---------------------------------------------------------------
  const COMMON = `
precision highp float;
precision highp int;
uniform mat4 uVP;
uniform vec3 uCam;
uniform vec3 uSun;
uniform vec3 uSunCol;
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec3 uGroundAmb;
uniform vec3 uFog;
uniform float uFogDen;
uniform float uTime;
uniform vec2 uGrid;
uniform float uNight;
uniform float uAutumn;   // 0 before the ears colour, 1 in autumn
uniform float uFront;    // harvest: cells south of this row are cut
float hash12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),u.x),mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),u.x),u.y); }
float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<4;i++){ s+=a*vnoise(p); p=p*2.03+17.1; a*=.5; } return s; }
vec3 skyColor(vec3 d){
  float h=clamp(d.y,-.2,1.);
  vec3 c=mix(uSkyHorizon,uSkyTop,pow(clamp(h,0.,1.),.55));
  float s=max(dot(d,uSun),0.);
  c+=uSunCol*(pow(s,600.)*3.+pow(s,9.)*.22);
  return c;
}
// paddy seen from afar: rows of rice whose colour follows the growth
// k: interpolated weights of (growing, ripe, dead) so cell edges blend cleanly
vec4 riceCarpet(vec3 k, float gr, vec2 wp){
  float total=k.x+k.y+k.z;
  if(total<0.01) return vec4(0.);
  vec3 young=vec3(.5,.74,.3), green=vec3(.2,.44,.12), turn=vec3(.55,.6,.2), gold=vec3(.88,.68,.24), dead=vec3(.46,.36,.22);
  vec3 g=mix(young,green,smoothstep(.1,.55,gr));
  g=mix(g,turn,smoothstep(.85,1.,gr)*uAutumn);
  vec3 ripe=mix(mix(green,turn,.5),gold,uAutumn);
  float cut=step(uFront,wp.y);
  ripe=mix(ripe,vec3(.74,.64,.42),cut);
  vec3 c=(g*k.x+ripe*k.y+dead*k.z)/total;
  float cover=(k.x*(.35+.6*smoothstep(0.,.6,gr))+k.y*mix(1.,.55,cut)+k.z*.75)/max(total,1.);
  float rows=smoothstep(.15,.55,abs(fract(wp.x*3.)-.5)*2.);
  float hills=vnoise(wp*5.3);
  c*=.78+.22*rows+.18*hills;
  return vec4(c,cover*(.72+.28*rows));
}
vec3 plantWeights(float state){ return vec3(abs(state-1.)<.5?1.:0., abs(state-2.)<.5?1.:0., abs(state-3.)<.5?1.:0.); }
// a gentle print-like grade: a little S-curve and saturation
vec3 grade(vec3 c){
  c=clamp(c,0.,1.6);
  vec3 s=c*c*(3.-2.*clamp(c,0.,1.));
  c=mix(c,s,.32);
  float l=dot(c,vec3(.299,.587,.114));
  return mix(vec3(l),c,1.16);
}
vec3 applyFog(vec3 col, vec3 p){
  float dist=length(p-uCam);
  float f=1.-exp(-dist*uFogDen);
  float below=smoothstep(-1.,-14.,p.y);
  return grade(mix(col,uFog,clamp(f+below*.85,0.,1.)));
}
`;

  const TERRAIN_VS = `#version 300 es
${COMMON}
layout(location=0) in vec2 aCell;
layout(location=1) in float aSkirt;
uniform sampler2D uA;
uniform sampler2D uB;
uniform sampler2D uC;
uniform sampler2D uL;
uniform float uBase;
out vec3 vPos; out vec3 vN; out vec4 vB; out vec4 vC; out float vWater; out float vLight; out float vSkirt; out float vBed; out vec3 vPlant;
float G(ivec2 c){ c=clamp(c,ivec2(0),ivec2(uGrid)-1); return texelFetch(uA,c,0).r; }
void main(){
  ivec2 c=ivec2(aCell);
  vec4 a=texelFetch(uA,c,0);
  vB=texelFetch(uB,c,0); vC=texelFetch(uC,c,0);
  vPlant=plantWeights(vC.r);
  float hl=G(c-ivec2(1,0)), hr=G(c+ivec2(1,0)), hd=G(c-ivec2(0,1)), hu=G(c+ivec2(0,1));
  vN=normalize(vec3(hl-hr,2.,hd-hu));
  float y=a.r;
  vSkirt=aSkirt;
  vBed=a.r-vB.r;
  if(aSkirt>0.5){ y=uBase; }
  vPos=vec3(aCell.x,y,aCell.y);
  vWater=a.g;
  vLight=texelFetch(uL,c,0).r;
  gl_Position=uVP*vec4(vPos,1.);
}`;

  const TERRAIN_FS = `#version 300 es
${COMMON}
in vec3 vPos; in vec3 vN; in vec4 vB; in vec4 vC; in float vWater; in float vLight; in float vSkirt; in float vBed; in vec3 vPlant;
uniform vec3 uGrass; uniform vec3 uGrassDry; uniform vec3 uEarth; uniform vec3 uStone; uniform vec3 uMud;
uniform vec4 uCursor;   // x, z, radius, visible
uniform vec4 uCursor2;  // tool(0 heap,1 dig,2 level), target height, pulse, unused
uniform vec4 uMarks[4];
uniform float uMarkCount;
uniform float uShowSuit;
uniform vec3 uSkirtNormal;
out vec4 frag;
void main(){
  vec3 n=normalize(vN);
  float soil=vB.r, wet=vB.g, dist=vB.b, flags=vB.a;
  bool isRock = mod(floor(flags/16.),2.)>.5 || soil<0.1;
  vec2 wp=vPos.xz;
  float det=fbm(wp*1.7);
  float fine=vnoise(wp*7.3);
  vec3 col;
  if(vSkirt>0.5 || (gl_FrontFacing==false)){
    // diorama cross-section: soil strata over bedrock
    float depthBelow=-vPos.y;
    float band=sin(vPos.y*5.1+fine*1.4)*.5+.5;
    vec3 soilC=mix(uEarth*.72,uEarth*.95,band);
    vec3 rockC=mix(uStone*.55,uStone*.8,vnoise(vPos.xy*2.+vPos.zz*2.));
    col=mix(soilC,rockC,step(vPos.y,vBed));
    col*=mix(.55,1.,smoothstep(-8.,2.,vPos.y));
    vec3 sn=uSkirtNormal;
    float lam=max(dot(sn,uSun),0.)*.55+.62;
    col*=lam*mix(vec3(.75,.8,.95),uSunCol,.5);
    frag=vec4(applyFog(col,vPos),1.);
    return;
  }
  float slope=1.-n.y;
  vec3 grass=mix(uGrass,uGrassDry,smoothstep(.35,.75,det)*.6);
  grass*=.86+.28*fine;
  col=grass;
  // banks too steep for turf show their earth
  col=mix(col,uEarth*(.85+.2*fine),smoothstep(.22,.42,slope));
  // stone: walls and bare rock
  if(isRock){
    // walls are textured on their face, flat rock from above
    vec2 q=slope>.45?vec2((wp.x+wp.y)*2.2,vPos.y*3.4):wp*vec2(2.2,3.1);
    float cell=hash12(floor(q+vec2(floor(q.y)*.5,0.)));
    vec2 f=fract(q+vec2(floor(q.y)*.5,0.));
    float mortar=smoothstep(.0,.12,min(min(f.x,1.-f.x),min(f.y,1.-f.y)));
    vec3 st=uStone*(.75+.45*cell)*(.6+.4*mortar);
    col=mix(col,st,clamp(1.-soil*8.,0.,1.)*.92+(soil<0.1?0.:0.));
  }
  // freshly worked earth
  col=mix(col,uEarth*(.7+.25*fine),clamp(dist*1.4,0.,.9));
  // wet soil darkens; the floor under paddy water is mud
  col*=mix(1.,.66,clamp(wet,0.,1.));
  float sub=smoothstep(.0,.06,vWater);
  col=mix(col,uMud*(.8+.3*fine),sub*.85);
  vec4 rc=riceCarpet(vPlant,vC.g,wp);
  col=mix(col,rc.rgb,rc.a*smoothstep(.8,.96,n.y));
  // light
  float lam=max(dot(n,uSun),0.);
  float sh=vLight;
  vec3 amb=mix(uGroundAmb,uSkyTop*.75+uSkyHorizon*.2,n.y*.5+.5);
  vec3 lit=col*(amb*(.42+.38*sh)+uSunCol*lam*sh*1.0);
  // rice paddies that are ready glow faintly before planting
  float suit=vC.a;
  if(uShowSuit>0.){
    float s=smoothstep(.6,1.2,suit);
    float pulse=.55+.45*sin(uTime*2.2+wp.x*.4+wp.y*.3);
    lit=mix(lit,vec3(.75,1.,.62),s*.22*pulse*uShowSuit);
  }
  // hint marks
  for(int i=0;i<4;i++){
    if(float(i)>=uMarkCount) break;
    vec4 m=uMarks[i];
    float d=length(wp-m.xy);
    float ringW=abs(d-m.z*(.82+.18*sin(uTime*3.)));
    vec3 mc=m.w>.5?vec3(.45,.75,1.):vec3(1.,.86,.5);
    float sp=m.w>.5?7.:3.;
    lit+=mc*(smoothstep(.22,.0,ringW)*.75+smoothstep(m.z,0.,d)*.12)*(.6+.4*sin(uTime*sp));
  }
  // brush
  if(uCursor.w>.5){
    float d=length(wp-uCursor.xy);
    float r=uCursor.z;
    vec3 tc=uCursor2.x<.5?vec3(1.,.78,.42):uCursor2.x<1.5?vec3(.55,.8,1.):vec3(.92,1.,.88);
    float ring=smoothstep(.14,.0,abs(d-r));
    float fill=smoothstep(r,r*.2,d)*.10;
    lit=mix(lit,tc,ring*.8+fill);
    if(uCursor2.x>1.5){
      // leveling: the contour at the target height shows how far the flat will reach
      float c=smoothstep(.07,.0,abs(vPos.y-uCursor2.y))*smoothstep(r*2.6,r,d);
      lit=mix(lit,vec3(1.),c*.7);
    }
  }
  // lanterns at night warm the ground around the houses
  frag=vec4(applyFog(lit,vPos),1.);
}`;

  const WATER_VS = `#version 300 es
${COMMON}
layout(location=0) in vec2 aCell;
uniform sampler2D uA;
uniform sampler2D uC;
out vec3 vPos; out float vDepth; out vec2 vVel; out vec3 vN; out vec2 vRice; out float vLightW; out vec3 vPlant; out float vDry; out float vSuit;
uniform sampler2D uL;
vec2 S(ivec2 c){ c=clamp(c,ivec2(0),ivec2(uGrid)-1); vec4 a=texelFetch(uA,c,0); return vec2(a.r+a.g,a.g); }
void main(){
  ivec2 c=ivec2(aCell);
  vec4 a=texelFetch(uA,c,0);
  float d=a.g;
  // dry cells tuck the surface under the ground so shorelines meet cleanly
  float surf=a.r+d;
  vDry=d<0.004?1.:0.;
  if(d<0.004){
    // borrow the level of the wettest neighbour so the edge of a pond is flat
    float best=-1e9;
    for(int k=0;k<4;k++){
      ivec2 o=k==0?ivec2(1,0):k==1?ivec2(-1,0):k==2?ivec2(0,1):ivec2(0,-1);
      vec2 s=S(c+o); if(s.y>0.004) best=max(best,s.x);
    }
    surf= best>-1e8 ? min(best, a.r+0.0) - 0.02 : a.r-0.25;
  }
  vec2 l=S(c-ivec2(1,0)), r=S(c+ivec2(1,0)), dn=S(c-ivec2(0,1)), up=S(c+ivec2(0,1));
  float hl=l.y>0.004?l.x:surf, hr=r.y>0.004?r.x:surf, hd=dn.y>0.004?dn.x:surf, hu=up.y>0.004?up.x:surf;
  vN=normalize(vec3(hl-hr,2.,hd-hu));
  vPos=vec3(aCell.x,surf,aCell.y);
  vDepth=d;
  vec4 pc=texelFetch(uC,c,0);
  vRice=pc.rg; vSuit=pc.a;
  vPlant=plantWeights(vRice.x);
  vLightW=texelFetch(uL,c,0).r;
  vVel=a.ba;
  gl_Position=uVP*vec4(vPos,1.);
}`;

  const WATER_FS = `#version 300 es
${COMMON}
in vec3 vPos; in float vDepth; in vec2 vVel; in vec3 vN; in vec2 vRice; in float vLightW; in vec3 vPlant; in float vDry; in float vSuit;
uniform float uRain;
uniform float uShowSuit;
uniform vec3 uWaterDeep; uniform vec3 uWaterShallow;
out vec4 frag;
vec2 ripple(vec2 p, float t){
  float e=.05;
  float a=fbm(p+t), b=fbm(p+vec2(e,0.)+t), c=fbm(p+vec2(0.,e)+t);
  return vec2(b-a,c-a)/e;
}
void main(){
  float d=vDepth;
  // no sheets of water hung between a dry ridge and the paddy below it
  if(d<0.003 || vDry>.5) discard;
  vec3 n=normalize(vN);
  float speed=length(vVel);
  vec2 flow=vVel*.6;
  float ph0=fract(uTime*.35), ph1=fract(uTime*.35+.5);
  vec2 p=vPos.xz*2.2;
  vec2 g0=ripple(p-flow*ph0*2.,uTime*.05), g1=ripple(p-flow*ph1*2.+.37,uTime*.05);
  vec2 g=mix(g0,g1,abs(ph0*2.-1.));
  float calm=1.-smoothstep(.05,.8,speed);
  float amp=mix(.32,.06,calm)+uRain*.25;
  // rain rings
  if(uRain>0.01){
    vec2 rp=vPos.xz*1.6;
    vec2 ci=floor(rp); vec2 cf=fract(rp)-.5;
    float rt=fract(uTime*.9+hash12(ci)*7.);
    float rr=length(cf+(vec2(hash12(ci+3.1),hash12(ci+7.7))-.5)*.5);
    float ringv=sin((rr-rt*.5)*40.)*smoothstep(.5,.0,abs(rr-rt*.45)*6.)*(1.-rt);
    g+=vec2(ringv)*uRain*.8;
  }
  n=normalize(n+vec3(g.x,0.,g.y)*amp);
  vec3 v=normalize(uCam-vPos);
  float fres=.03+.97*pow(1.-max(dot(n,v),0.),5.);
  vec3 r=reflect(-v,n);
  vec3 refl=skyColor(r);
  // reflected clouds make still paddies read as mirrors
  float cl=fbm(r.xz/(max(r.y,.08))*1.6+uTime*.01);
  refl=mix(refl,mix(uSkyHorizon,vec3(1.),.6),smoothstep(.55,.85,cl)*.45*(1.-uRain*.3));
  vec3 absorb=exp(-d*vec3(3.4,1.5,1.0)*2.2);
  vec3 body=mix(uWaterDeep,uWaterShallow,absorb.g);
  vec3 col=body*(uSunCol*.45+uSkyTop*.45)*(.6+.4*vLightW);
  float reflAmt=clamp(.22+fres*1.2+calm*.38,0.,.9);
  col=mix(col,refl,reflAmt);
  float spec=pow(max(dot(r,uSun),0.),180.)*2.6*(1.-uNight)*(.4+.6*vLightW);
  col+=uSunCol*spec;
  // a running brook glints
  float glint=smoothstep(.75,.95,vnoise(vPos.xz*6.-vVel*uTime*.9))*smoothstep(.4,1.5,speed);
  col+=vec3(.9,.95,1.)*glint*.32;
  col=mix(col,col*1.12+vec3(.02,.03,.04),smoothstep(.3,1.4,speed)*(1.-calm));
  // white water where it falls fast
  float foam=smoothstep(2.2,4.5,speed)*smoothstep(.02,.12,d)*(.45+.55*vnoise(vPos.xz*5.-vVel*uTime*1.5));
  float edge=smoothstep(.03,.0,d)*.18*vnoise(vPos.xz*9.+uTime);
  col=mix(col,vec3(.93,.96,.98)*(uSunCol*.4+.65),clamp(foam+edge,0.,1.)*.8);
  float alpha=smoothstep(.003,.02,d)*clamp(.66+d*2.5+fres*.3+smoothstep(.3,1.2,speed)*.2,0.,1.);
  alpha=max(alpha,clamp(foam,0.,.9));
  // water that will take seedlings shimmers pale green until planting
  if(uShowSuit>0.){
    float sg=smoothstep(.5,1.4,vSuit);
    float pulse=.6+.4*sin(uTime*2.4+vPos.x*.35+vPos.z*.25);
    col=mix(col,vec3(.72,.95,.55),sg*.32*pulse*uShowSuit);
  }
  // rice standing in the paddy covers the water in rows
  vec4 rc=riceCarpet(vPlant,vRice.y,vPos.xz);
  if(rc.a>0.){
    vec3 amb=uSkyTop*.6+uGroundAmb*.4;
    vec3 riceLit=rc.rgb*(amb*.55+uSunCol*(.35+.65*vLightW)*.8);
    float k=rc.a*.88;
    col=mix(col,riceLit,k);
    alpha=mix(alpha,1.,k);
  }
  frag=vec4(applyFog(col,vPos),alpha);
}`;

  const RICE_VS = `#version 300 es
${COMMON}
layout(location=0) in vec4 aBlade;   // local x, local z, height fraction, side
layout(location=1) in vec2 aTuft;    // tuft angle, tuft seed
layout(location=2) in float aCellIdx;
uniform sampler2D uA;
uniform sampler2D uC;
uniform sampler2D uL;
out vec3 vCol; out vec3 vPos; out float vLight;
void main(){
  int idx=int(aCellIdx+.5);
  ivec2 c=ivec2(idx%int(uGrid.x), idx/int(uGrid.x));
  vec4 a=texelFetch(uA,c,0);
  vec4 pc=texelFetch(uC,c,0);
  float state=pc.r, gr=pc.g, stress=pc.b;
  float seed=hash12(vec2(c)+aTuft.y*13.1);
  float h=mix(.12,.78,smoothstep(0.,1.,gr))*(.8+.35*seed);
  if(state>2.5) h*=.45;
  bool cut=state>1.5&&state<2.5&&float(c.y)>uFront;
  if(cut) h=.1;
  float t=aBlade.z;
  vec2 base=vec2(c)+aBlade.xy;
  float ang=aTuft.x+seed*6.283;
  vec2 dir=vec2(cos(ang),sin(ang));
  float lean=(.18+.5*smoothstep(.7,1.,gr)*float(state>1.5&&state<2.5)*uAutumn)*t*t;
  float sway=sin(uTime*1.7+base.x*.55+base.y*.35)*.07*t*t + sin(uTime*3.1+base.x*1.3)*.025*t;
  vec2 off=dir*(lean+sway)+vec2(aBlade.w*.05*(1.-t),0.)*mat2(dir.x,dir.y,-dir.y,dir.x);
  float y=a.r+t*h-lean*.4*h;
  vPos=vec3(base.x+off.x,y,base.y+off.y);
  vec3 young=vec3(.56,.78,.33), green=vec3(.22,.46,.14), gold=vec3(.86,.66,.22), deadc=vec3(.45,.36,.22);
  vec3 col=mix(young,green,smoothstep(.1,.55,gr));
  col=mix(col,vec3(.62,.62,.2),smoothstep(.7,.95,gr));
  if(state>1.5&&state<2.5) col=mix(mix(vec3(.4,.52,.16),gold,uAutumn),mix(vec3(.62,.66,.24),vec3(.95,.8,.36),uAutumn),t);
  if(cut) col=vec3(.7,.6,.4)*(.7+.3*t);
  if(state>2.5) col=deadc;
  col=mix(col,vec3(.6,.52,.25),clamp(stress/9.,0.,1.)*.6);
  col*=.55+.6*t;
  vCol=col;
  vLight=texelFetch(uL,c,0).r;
  gl_Position=uVP*vec4(vPos,1.);
}`;
  const RICE_FS = `#version 300 es
${COMMON}
in vec3 vCol; in vec3 vPos; in float vLight;
out vec4 frag;
void main(){
  vec3 amb=uSkyTop*.6+uGroundAmb*.4;
  vec3 col=vCol*(amb*.7+uSunCol*(.35+.65*vLight)*.75);
  frag=vec4(applyFog(col,vPos),1.);
}`;

  const MESH_VS = `#version 300 es
${COMMON}
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNor;
layout(location=2) in vec4 aCol;  // rgb, emissive
uniform sampler2D uA;
out vec3 vPos; out vec3 vN; out vec4 vCol;
void main(){
  vPos=aPos; vN=aNor; vCol=aCol;
  gl_Position=uVP*vec4(aPos,1.);
}`;
  const MESH_FS = `#version 300 es
${COMMON}
in vec3 vPos; in vec3 vN; in vec4 vCol;
out vec4 frag;
void main(){
  vec3 n=normalize(vN);
  float lam=max(dot(n,uSun),0.);
  vec3 amb=mix(uGroundAmb*1.3,uSkyTop*.8+uSkyHorizon*.4,n.y*.5+.5);
  vec3 col=vCol.rgb*(amb*1.05+uSunCol*lam*.85);
  col+=vec3(1.,.72,.38)*vCol.a*(.25+uNight*1.6);
  frag=vec4(applyFog(col,vPos),1.);
}`;

  const TREE_VS = `#version 300 es
${COMMON}
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNor;
layout(location=2) in float aPart;   // 0 trunk, 1 crown
layout(location=3) in vec4 aInst;    // x, z, scale, kind
layout(location=4) in float aHue;
uniform sampler2D uA;
uniform sampler2D uB;
uniform sampler2D uC;
uniform vec3 uLeaf[4];   // sugi, broadleaf, sakura, maple
out vec3 vPos; out vec3 vN; out vec3 vCol;
void main(){
  ivec2 c=clamp(ivec2(aInst.xy+.5),ivec2(0),ivec2(uGrid)-1);
  vec4 a=texelFetch(uA,c,0);
  float s=aInst.z;
  // trees give way to worked ground, standing water and fields
  if(a.g>.05 || texelFetch(uB,c,0).b>.25 || texelFetch(uC,c,0).r>.5) s=0.;
  vec3 p=aPos*s;
  float sway=sin(uTime*1.1+aInst.x*.7+aInst.y*.3)*.05*max(aPos.y,0.)*aPart;
  p.x+=sway;
  vPos=vec3(aInst.x,a.r-.1,aInst.y)+p;
  vN=aNor;
  int k=int(aInst.w+.5);
  vec3 leaf=uLeaf[k];
  leaf*=.82+.36*aHue;
  vCol=aPart>.5?leaf:vec3(.32,.22,.15);
  gl_Position=uVP*vec4(vPos,1.);
}`;
  const TREE_FS = `#version 300 es
${COMMON}
in vec3 vPos; in vec3 vN; in vec3 vCol;
out vec4 frag;
void main(){
  vec3 n=normalize(vN);
  float lam=max(dot(n,uSun),0.)*.85+.15;
  vec3 amb=mix(uGroundAmb*1.2,uSkyTop*.8+uSkyHorizon*.3,n.y*.5+.5);
  vec3 col=vCol*(amb*.9+uSunCol*lam*.8);
  frag=vec4(applyFog(col,vPos),1.);
}`;

  const SKY_VS = `#version 300 es
layout(location=0) in vec2 aP;
out vec2 vP;
void main(){ vP=aP; gl_Position=vec4(aP,.9999,1.); }`;
  const SKY_FS = `#version 300 es
${COMMON}
in vec2 vP;
uniform mat4 uInvVP;
uniform vec3 uMount;
uniform float uCloudY;
out vec4 frag;
void main(){
  vec4 a=uInvVP*vec4(vP,-1.,1.), b=uInvVP*vec4(vP,1.,1.);
  vec3 d=normalize(b.xyz/b.w-a.xyz/a.w);
  vec3 col=skyColor(d);
  // clouds
  if(d.y>0.){
    vec2 cp=d.xz/(d.y+.12)*1.3+vec2(uTime*.006,0.);
    float c=fbm(cp)*1.1+fbm(cp*2.7)*.35;
    float cov=smoothstep(.55,.95,c);
    col=mix(col,mix(uSkyHorizon*1.05,vec3(1.),.55)*(.8+.3*uSunCol.r),cov*.55*smoothstep(0.,.2,d.y));
  }
  // distant ridges, layered into the haze
  float az=atan(d.z,d.x);
  for(int i=0;i<3;i++){
    float fi=float(i);
    float hgt=.03+.06*fbm(vec2(az*(2.5+fi*1.7)+fi*11.,fi*3.))+.02*fi;
    hgt-=fi*.035;
    if(d.y<hgt){
      vec3 m=mix(uMount,uFog,.35+fi*.22);
      col=mix(m,col,fi*.15);
    }
  }
  if(d.y<-.02) col=mix(col,uFog,smoothstep(-.02,-.2,d.y));
  // a sea of clouds far below the floating valley
  if(d.y<0.){
    vec3 o=uCam;
    float t=(uCloudY-o.y)/d.y;
    if(t>0.){
      vec2 q=(o.xz+d.xz*t)*.018+vec2(uTime*.004,uTime*.0015);
      float c=fbm(q)*.75+fbm(q*2.3+4.)*.35;
      float top=smoothstep(.35,.85,c);
      vec3 lit=mix(uFog*.92,mix(uFog,vec3(1.),.45)*(.85+.25*uSunCol),top);
      float shade=1.-smoothstep(.55,.95,c)*.12;
      float fade=exp(-t*.004);
      col=mix(col,lit*shade,clamp(fade*1.2,0.,1.)*smoothstep(0.,-.12,d.y));
    }
  }
  col=grade(col);
  // stars on the harvest night
  if(uNight>0.){
    vec2 sp=d.xz/(d.y+.3)*40.;
    float st=step(.995,hash12(floor(sp)))*smoothstep(.0,.3,d.y);
    col+=vec3(st)*uNight*.8;
  }
  frag=vec4(col,1.);
}`;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      const lines = src.split("\n").map((l, i) => (i + 1) + ": " + l).join("\n");
      throw new Error("shader: " + log + "\n" + lines.slice(0, 4000));
    }
    return s;
  }
  function program(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("link: " + gl.getProgramInfoLog(p));
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      const name = info.name.replace(/\[0\]$/, "");
      u[name] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }

  // ---- geometry builders ----------------------------------------------------------
  function pushBox(v, cx, cy, cz, sx, sy, sz, rot, col, em) {
    // eight corners, six faces, flat normals
    const c = Math.cos(rot), s = Math.sin(rot);
    const P = (x, y, z) => [cx + x * c - z * s, cy + y, cz + x * s + z * c];
    const N = (x, y, z) => [x * c - z * s, y, x * s + z * c];
    const faces = [
      [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1], [0, 0, 1]],
      [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1], [0, 0, -1]],
      [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1], [1, 0, 0]],
      [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, 0, 0]],
      [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1], [0, 1, 0]]
    ];
    for (const f of faces) {
      const q = f.slice(0, 4).map(p => P(p[0] * sx, p[1] * sy, p[2] * sz));
      const n = N(...f[4]);
      for (const k of [0, 1, 2, 0, 2, 3]) v.push(...q[k], ...n, ...col, em || 0);
    }
  }
  function pushTri(v, a, b, c2, col, em) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c2[0] - a[0], wy = c2[1] - a[1], wz = c2[2] - a[2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (const p of [a, b, c2]) v.push(...p, nx, ny, nz, ...col, em || 0);
  }
  function house(v, h, W) {
    const cx = h.x + h.w / 2 - 0.5, cz = h.y + h.h / 2 - 0.5, base = h.base;
    const rot = h.rot || 0, c = Math.cos(rot), s = Math.sin(rot);
    const hw = h.w / 2 - 0.15, hd = h.h / 2 - 0.25, wallH = 0.95;
    const wall = h.damaged ? [0.42, 0.36, 0.3] : [0.78, 0.7, 0.58];
    const timber = [0.3, 0.2, 0.14];
    // stone plinth, walls, timber posts
    pushBox(v, cx, base + 0.08, cz, hw + 0.15, 0.12, hd + 0.15, rot, [0.5, 0.48, 0.45]);
    pushBox(v, cx, base + 0.2 + wallH / 2, cz, hw, wallH / 2, hd, rot, wall);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const px = sx * hw, pz = sz * hd;
      pushBox(v, cx + px * c - pz * s, base + 0.2 + wallH / 2, cz + px * s + pz * c, 0.07, wallH / 2 + 0.01, 0.07, rot, timber);
    }
    // a warm window on the long side
    const wx = 0, wz = hd + 0.02;
    pushBox(v, cx + wx * c - wz * s, base + 0.62, cz + wx * s + wz * c, 0.32, 0.18, 0.03, rot, [0.95, 0.78, 0.45], h.damaged ? 0 : 1);
    // thatched hip roof (kayabuki): thick, steep
    const y0 = base + 0.2 + wallH, rh = 1.35;
    const ox = hw + 0.42, oz = hd + 0.45, ridge = Math.max(0.2, ox - oz);
    const P = (x, y, z) => [cx + x * c - z * s, y, cz + x * s + z * c];
    const thatch = h.damaged ? [0.32, 0.28, 0.22] : [0.56, 0.45, 0.28];
    const thatchDark = h.damaged ? [0.26, 0.22, 0.18] : [0.45, 0.35, 0.22];
    const A = P(-ox, y0, oz), B = P(ox, y0, oz), C = P(ox, y0, -oz), D = P(-ox, y0, -oz);
    const R1 = P(-ridge, y0 + rh, 0), R2 = P(ridge, y0 + rh, 0);
    pushTri(v, A, B, R2, thatch); pushTri(v, A, R2, R1, thatch);
    pushTri(v, C, D, R1, thatch); pushTri(v, C, R1, R2, thatch);
    pushTri(v, B, C, R2, thatchDark); pushTri(v, D, A, R1, thatchDark);
    // roof eave thickness
    const eave = 0.12;
    const A2 = P(-ox, y0 - eave, oz), B2 = P(ox, y0 - eave, oz), C2 = P(ox, y0 - eave, -oz), D2 = P(-ox, y0 - eave, -oz);
    for (const [p, q, p2, q2] of [[A, B, A2, B2], [B, C, B2, C2], [C, D, C2, D2], [D, A, D2, A2]]) { pushTri(v, p2, q2, q, thatchDark); pushTri(v, p2, q, p, thatchDark); }
    // ridge cap
    const r0 = P(-ridge - 0.1, y0 + rh + 0.06, 0), r1 = P(ridge + 0.1, y0 + rh + 0.06, 0);
    pushBox(v, (r0[0] + r1[0]) / 2, y0 + rh + 0.02, (r0[2] + r1[2]) / 2, ridge + 0.12, 0.07, 0.12, rot, [0.24, 0.2, 0.17]);
  }
  function treeTemplate() {
    // a cone (sugi) and a lumpy crown (broadleaf) share one buffer: part 0 trunk, 1 crown
    const sugi = [], broad = [];
    const ring = (arr, y0, y1, r0, r1, seg, part) => {
      for (let k = 0; k < seg; k++) {
        const a0 = k / seg * Math.PI * 2, a1 = (k + 1) / seg * Math.PI * 2;
        const p = [[Math.cos(a0) * r0, y0, Math.sin(a0) * r0], [Math.cos(a1) * r0, y0, Math.sin(a1) * r0], [Math.cos(a1) * r1, y1, Math.sin(a1) * r1], [Math.cos(a0) * r1, y1, Math.sin(a0) * r1]];
        const ny = (r0 - r1) / (y1 - y0 || 1);
        const n0 = [Math.cos(a0), ny, Math.sin(a0)], n1 = [Math.cos(a1), ny, Math.sin(a1)];
        for (const [pi, nn] of [[0, n0], [1, n1], [2, n1], [0, n0], [2, n1], [3, n0]]) arr.push(...p[pi], ...nn, part);
      }
    };
    ring(sugi, 0, 0.7, 0.09, 0.07, 6, 0);
    ring(sugi, 0.5, 1.6, 0.62, 0.32, 8, 1); ring(sugi, 1.25, 2.3, 0.5, 0.22, 8, 1); ring(sugi, 1.95, 3.1, 0.36, 0.0, 8, 1);
    ring(broad, 0, 0.8, 0.1, 0.08, 6, 0);
    const lump = (cx, cy, cz, r) => {
      const st = 6, sl = 8;
      for (let i = 0; i < st; i++) for (let j = 0; j < sl; j++) {
        const v0 = i / st * Math.PI, v1 = (i + 1) / st * Math.PI, u0 = j / sl * Math.PI * 2, u1 = (j + 1) / sl * Math.PI * 2;
        const S = (u, vv) => [Math.sin(vv) * Math.cos(u), Math.cos(vv), Math.sin(vv) * Math.sin(u)];
        const q = [S(u0, v0), S(u1, v0), S(u1, v1), S(u0, v1)];
        for (const k of [0, 1, 2, 0, 2, 3]) broad.push(cx + q[k][0] * r, cy + q[k][1] * r * 0.85, cz + q[k][2] * r, ...q[k], 1);
      }
    };
    lump(0, 1.25, 0, 0.75); lump(0.35, 1.0, 0.2, 0.5); lump(-0.3, 1.05, -0.15, 0.55); lump(0.05, 1.7, -0.05, 0.45);
    return { sugi: new Float32Array(sugi), broad: new Float32Array(broad) };
  }

  // ---- renderer -------------------------------------------------------------------------
  function create(canvas) {
    const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, premultipliedAlpha: false, powerPreference: "high-performance", preserveDrawingBuffer: false });
    if (!gl) return null;
    let progs;
    try {
      progs = {
        terrain: program(gl, TERRAIN_VS, TERRAIN_FS),
        water: program(gl, WATER_VS, WATER_FS),
        rice: program(gl, RICE_VS, RICE_FS),
        mesh: program(gl, MESH_VS, MESH_FS),
        tree: program(gl, TREE_VS, TREE_FS),
        sky: program(gl, SKY_VS, SKY_FS)
      };
    } catch (e) {
      console.error(e);
      return null;
    }
    const R = { gl, canvas, progs, world: null, vp: null, invVP: null, cam: null, eye: [0, 0, 0], lost: false };

    const skyBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const skyVAO = gl.createVertexArray();
    gl.bindVertexArray(skyVAO);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    const tmpl = treeTemplate();
    function makeTex(fmt, internal, type, w, h) {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, fmt, type, null);
      return t;
    }

    R.setWorld = function (w) {
      R.world = w;
      const { W, H } = w;
      if (R.res) {
        for (const k of ["texA", "texB", "texC", "texL"]) gl.deleteTexture(R.res[k]);
        for (const k of ["gridVAO", "riceVAO", "meshVAO"]) if (R.res[k]) gl.deleteVertexArray(R.res[k]);
        for (const s of R.res.skirts) gl.deleteVertexArray(s.vao);
        for (const k in R.res.treeVAO) gl.deleteVertexArray(R.res.treeVAO[k].vao);
        for (const b of R.res.buffers) gl.deleteBuffer(b);
      }
      const res = { buffers: [] };
      res.texA = makeTex(gl.RGBA, gl.RGBA32F, gl.FLOAT, W, H);
      res.texB = makeTex(gl.RGBA, gl.RGBA32F, gl.FLOAT, W, H);
      res.texC = makeTex(gl.RGBA, gl.RGBA32F, gl.FLOAT, W, H);
      res.texL = makeTex(gl.RED, gl.R32F, gl.FLOAT, W, H);
      res.A = new Float32Array(W * H * 4); res.B = new Float32Array(W * H * 4); res.C = new Float32Array(W * H * 4);
      res.L = new Float32Array(W * H).fill(1);
      // grid mesh
      const verts = new Float32Array(W * H * 3);
      for (let y = 0, k = 0; y < H; y++) for (let x = 0; x < W; x++) { verts[k++] = x; verts[k++] = y; verts[k++] = 0; }
      const idx = new Uint32Array((W - 1) * (H - 1) * 6);
      let k = 0;
      for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
        const i = y * W + x;
        // alternate the diagonal so slopes do not stripe in one direction
        if ((x + y) & 1) { idx[k++] = i; idx[k++] = i + W; idx[k++] = i + 1; idx[k++] = i + 1; idx[k++] = i + W; idx[k++] = i + W + 1; }
        else { idx[k++] = i; idx[k++] = i + W; idx[k++] = i + W + 1; idx[k++] = i; idx[k++] = i + W + 1; idx[k++] = i + 1; }
      }
      res.gridCount = idx.length;
      res.gridVAO = gl.createVertexArray();
      gl.bindVertexArray(res.gridVAO);
      const vb = gl.createBuffer(); res.buffers.push(vb);
      gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 12, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 12, 8);
      const ib = gl.createBuffer(); res.buffers.push(ib);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      // diorama skirt: one strip per side, with its own outward normal
      res.skirts = [];
      const sides = [
        { pts: Array.from({ length: W }, (_, x) => [x, H - 1]), n: [0, 0, 1] },
        { pts: Array.from({ length: W }, (_, x) => [W - 1 - x, 0]), n: [0, 0, -1] },
        { pts: Array.from({ length: H }, (_, y) => [W - 1, H - 1 - y]), n: [1, 0, 0] },
        { pts: Array.from({ length: H }, (_, y) => [0, y]), n: [-1, 0, 0] }
      ];
      for (const side of sides) {
        const sv = [];
        for (let j = 0; j < side.pts.length - 1; j++) {
          const a = side.pts[j], b = side.pts[j + 1];
          sv.push(a[0], a[1], 0, b[0], b[1], 0, b[0], b[1], 1, a[0], a[1], 0, b[0], b[1], 1, a[0], a[1], 1);
        }
        const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
        const bb = gl.createBuffer(); res.buffers.push(bb);
        gl.bindBuffer(gl.ARRAY_BUFFER, bb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(sv), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 12, 0);
        gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 12, 8);
        gl.bindVertexArray(null);
        res.skirts.push({ vao, count: sv.length / 3, n: side.n });
      }
      // rice blades: 4 tufts x 4 blades per cell, each blade one triangle
      const blades = [], tufts = [];
      const off = [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]];
      for (let t = 0; t < 4; t++) for (let b = 0; b < 4; b++) {
        const ang = b / 4 * Math.PI * 2 + t * 0.7;
        const ox = off[t][0] + Math.cos(ang) * 0.02, oz = off[t][1] + Math.sin(ang) * 0.02;
        blades.push(ox, oz, 0, -1, ox, oz, 0, 1, ox, oz, 1, 0);
        tufts.push(ang, t, ang, t, ang, t);
      }
      res.bladeVerts = blades.length / 4;
      res.riceVAO = gl.createVertexArray(); gl.bindVertexArray(res.riceVAO);
      const bb = gl.createBuffer(); res.buffers.push(bb);
      gl.bindBuffer(gl.ARRAY_BUFFER, bb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(blades), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
      const tb = gl.createBuffer(); res.buffers.push(tb);
      gl.bindBuffer(gl.ARRAY_BUFFER, tb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(tufts), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
      res.riceInst = gl.createBuffer(); res.buffers.push(res.riceInst);
      gl.bindBuffer(gl.ARRAY_BUFFER, res.riceInst); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(W * H), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(2, 1);
      gl.bindVertexArray(null);
      res.riceList = new Float32Array(W * H); res.riceCount = 0;
      // trees
      res.treeVAO = {};
      res.trees = scatterTrees(w);
      for (const kind of ["sugi", "broad"]) {
        const list = res.trees.filter(t => (kind === "sugi") === (t.kind === 0));
        const inst = new Float32Array(list.length * 5);
        list.forEach((t, j) => inst.set([t.x, t.z, t.s, t.kind, t.hue], j * 5));
        const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
        const gb = gl.createBuffer(); res.buffers.push(gb);
        gl.bindBuffer(gl.ARRAY_BUFFER, gb); gl.bufferData(gl.ARRAY_BUFFER, tmpl[kind], gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
        gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 28, 12);
        gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 28, 24);
        const ibf = gl.createBuffer(); res.buffers.push(ibf);
        gl.bindBuffer(gl.ARRAY_BUFFER, ibf); gl.bufferData(gl.ARRAY_BUFFER, inst, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 20, 0); gl.vertexAttribDivisor(3, 1);
        gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 20, 16); gl.vertexAttribDivisor(4, 1);
        gl.bindVertexArray(null);
        res.treeVAO[kind] = { vao, count: tmpl[kind].length / 7, inst: list.length };
      }
      res.meshBuf = gl.createBuffer(); res.buffers.push(res.meshBuf);
      res.meshVAO = gl.createVertexArray(); gl.bindVertexArray(res.meshVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, res.meshBuf);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 40, 12);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 24);
      gl.bindVertexArray(null);
      res.meshKey = "";
      res.lightVersion = -1; res.lightSun = ""; res.lightClock = 0;
      res.slowClock = 0;
      R.res = res;
      let min = Infinity, max = -Infinity;
      for (let i = 0; i < w.N; i++) { min = Math.min(min, w.ground[i]); max = Math.max(max, w.ground[i]); }
      R.minGround = min; R.maxGround = max;
      R.base = min - Math.max(4, (max - min) * 0.45);
      uploadAll(true);
    };

    function scatterTrees(w) {
      const L = w.level, out = [];
      const rnd = mulberry(L.seed * 7 + 3);
      const want = L.trees === undefined ? Math.round((w.W + w.H) * 0.55) : L.trees;
      const kinds = L.treeKinds || [0, 0, 1, 1, 2, 3];
      let tries = 0;
      while (out.length < want && tries++ < want * 40) {
        // trees keep to the margins and the steep, dry ground
        const edge = rnd() < 0.75;
        let x, y;
        if (edge) {
          const side = Math.floor(rnd() * 4), d = rnd() * 3.5;
          x = side === 0 ? d : side === 1 ? w.W - 1 - d : rnd() * (w.W - 1);
          y = side === 2 ? d : side === 3 ? w.H - 1 - d : rnd() * (w.H - 1);
          if (side < 2 && rnd() < 0.5) y = rnd() * (w.H - 1);
        } else { x = rnd() * (w.W - 1); y = rnd() * (w.H - 1); }
        const i = Math.round(y) * w.W + Math.round(x);
        if (w.flags[i] & (1 | 2 | 4 | 32)) continue;
        if (w.water[i] > 0.01) continue;
        if (L.noTrees && L.noTrees.some(r => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3])) continue;
        if (out.some(t => Math.hypot(t.x - x, t.z - y) < 1.4)) continue;
        out.push({ x, z: y, s: 0.75 + rnd() * 0.55, kind: kinds[Math.floor(rnd() * kinds.length)], hue: rnd() });
      }
      if (L.extraTrees) for (const t of L.extraTrees) out.push({ x: t.x, z: t.y, s: t.s || 1, kind: t.kind || 0, hue: 0.5 });
      return out;
    }
    function mulberry(a) { return function () { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

    function computeVel(w, A) {
      const { W, H, fl, fr, ft, fb, water } = w;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const inL = x > 0 ? fr[i - 1] : 0, inR = x < W - 1 ? fl[i + 1] : 0, inT = y > 0 ? fb[i - W] : 0, inB = y < H - 1 ? ft[i + W] : 0;
        const d = Math.max(water[i], 0.03);
        A[i * 4 + 2] = ((inL - fl[i]) + (fr[i] - inR)) * 0.5 / d;
        A[i * 4 + 3] = ((inT - ft[i]) + (fb[i] - inB)) * 0.5 / d;
      }
    }

    function uploadAll(full) {
      const w = R.world, res = R.res, { W, H, N } = w;
      const A = res.A;
      for (let i = 0; i < N; i++) { A[i * 4] = w.ground[i]; A[i * 4 + 1] = w.water[i]; }
      computeVel(w, A);
      gl.bindTexture(gl.TEXTURE_2D, res.texA);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RGBA, gl.FLOAT, A);
      if (full || res.slowClock <= 0) {
        res.slowClock = 0.12;
        const B = res.B, C = res.C;
        let count = 0;
        for (let i = 0; i < N; i++) {
          B[i * 4] = w.ground[i] - w.bed[i]; B[i * 4 + 1] = w.wet[i]; B[i * 4 + 2] = w.disturb[i]; B[i * 4 + 3] = w.flags[i];
          C[i * 4] = w.plant[i]; C[i * 4 + 1] = w.grow[i]; C[i * 4 + 2] = w.stress[i]; C[i * 4 + 3] = w.suit[i];
          if (w.plant[i]) res.riceList[count++] = i;
        }
        gl.bindTexture(gl.TEXTURE_2D, res.texB);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RGBA, gl.FLOAT, B);
        gl.bindTexture(gl.TEXTURE_2D, res.texC);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RGBA, gl.FLOAT, C);
        gl.bindBuffer(gl.ARRAY_BUFFER, res.riceInst);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, res.riceList.subarray(0, count));
        res.riceCount = count;
      }
    }

    // Sun shadows and ambient occlusion from the height field, baked on the CPU.
    function bakeLight(sun) {
      const w = R.world, res = R.res, { W, H, ground } = w, L = res.L;
      const hz = Math.hypot(sun[0], sun[2]) || 1e-3;
      const dx = sun[0] / hz, dz = sun[2] / hz, rise = sun[1] / hz;
      const extra = new Float32Array(w.N);
      for (const h of w.houses) for (let y = h.y; y < h.y + h.h; y++) for (let x = h.x; x < h.x + h.w; x++) extra[y * W + x] = 2;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, g0 = ground[i] + 0.05;
        let lit = 1;
        for (let s = 1; s < 40; s++) {
          const px = x + dx * s * 0.8, pz = y + dz * s * 0.8;
          if (px < 0 || pz < 0 || px > W - 1 || pz > H - 1) break;
          const j = Math.round(pz) * W + Math.round(px);
          const over = ground[j] + extra[j] - (g0 + rise * s * 0.8);
          if (over > 0) { lit = Math.min(lit, 1 - Math.min(1, over * 2.2)); if (lit <= 0) break; }
        }
        // occlusion: how far the neighbourhood rises above this cell
        let occ = 0, n = 0;
        for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
          if (!ox && !oy) continue;
          const xx = x + ox, yy = y + oy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          occ += Math.max(0, ground[yy * W + xx] - ground[i]) / Math.hypot(ox, oy); n++;
        }
        const ao = 1 - Math.min(0.3, occ / n * 0.32);
        L[i] = (0.42 + 0.58 * lit) * ao;
      }
      gl.bindTexture(gl.TEXTURE_2D, res.texL);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RED, gl.FLOAT, L);
    }

    function buildMeshes() {
      const w = R.world, res = R.res;
      const key = w.houses.map(h => h.damaged ? 1 : 0).join("") + "|" + (R.extraMeshKey || "");
      if (key === res.meshKey) return;
      res.meshKey = key;
      const v = [];
      for (const h of w.houses) house(v, h, w.W);
      // springs: a small stone basin
      for (const s of w.springs) {
        const g = w.ground[s.y * w.W + s.x];
        for (let k = 0; k < 7; k++) {
          const a = k / 7 * Math.PI * 2;
          pushBox(v, s.x + Math.cos(a) * 0.9, g + 0.08, s.y + Math.sin(a) * 0.9, 0.22, 0.16 + (k % 3) * 0.04, 0.18, a, [0.55, 0.55, 0.52]);
        }
      }
      if (R.extraMesh) R.extraMesh(v, w, { pushBox, pushTri });
      res.meshCount = v.length / 10;
      gl.bindBuffer(gl.ARRAY_BUFFER, res.meshBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.DYNAMIC_DRAW);
    }

    function setCommon(pr, env) {
      const u = pr.u;
      gl.uniformMatrix4fv(u.uVP, false, R.vp);
      if (u.uCam) gl.uniform3fv(u.uCam, R.eye);
      if (u.uSun) gl.uniform3fv(u.uSun, env.sun);
      if (u.uSunCol) gl.uniform3fv(u.uSunCol, env.sunCol);
      if (u.uSkyTop) gl.uniform3fv(u.uSkyTop, env.skyTop);
      if (u.uSkyHorizon) gl.uniform3fv(u.uSkyHorizon, env.skyHorizon);
      if (u.uGroundAmb) gl.uniform3fv(u.uGroundAmb, env.groundAmb);
      if (u.uFog) gl.uniform3fv(u.uFog, env.fog);
      if (u.uFogDen) gl.uniform1f(u.uFogDen, env.fogDen);
      if (u.uTime) gl.uniform1f(u.uTime, env.time);
      if (u.uGrid) gl.uniform2f(u.uGrid, R.world.W, R.world.H);
      if (u.uNight) gl.uniform1f(u.uNight, env.night || 0);
      if (u.uAutumn) gl.uniform1f(u.uAutumn, env.autumn || 0);
      if (u.uFront) gl.uniform1f(u.uFront, env.front === undefined ? 1e6 : env.front);
    }
    function bindTex(pr, name, unit, tex) {
      if (!pr.u[name]) return;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(pr.u[name], unit);
    }

    R.camera = function (cam) {
      const w = R.world;
      const cw = canvas.width, ch = canvas.height, aspect = cw / ch;
      const tx = cam.target[0], ty = cam.target[1], tz = cam.target[2];
      const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
      const eye = [tx + Math.sin(cam.yaw) * cp * cam.dist, ty + sp * cam.dist, tz + Math.cos(cam.yaw) * cp * cam.dist];
      R.eye = eye;
      const view = M.lookAt(eye, cam.target, [0, 1, 0]);
      const proj = M.perspective(cam.fov, aspect, 0.5, cam.dist * 4 + 200);
      // lift the view on screen (the HUD and title copy sit below it)
      const sy = cam.shiftY || 0;
      proj[1] += sy * proj[3]; proj[5] += sy * proj[7]; proj[9] += sy * proj[11]; proj[13] += sy * proj[15];
      const sx = cam.shiftX || 0;
      proj[0] += sx * proj[3]; proj[4] += sx * proj[7]; proj[8] += sx * proj[11]; proj[12] += sx * proj[15];
      R.vp = M.mul(proj, view);
      R.invVP = M.invert(R.vp);
      R.cam = cam;
      return R.vp;
    };

    R.render = function (cam, env, dt) {
      if (!R.world || R.lost) return;
      const w = R.world, res = R.res;
      const dpr = env.dpr || 1;
      const cw = Math.max(1, Math.round(canvas.clientWidth * dpr)), ch = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      gl.viewport(0, 0, cw, ch);
      R.camera(cam);
      res.slowClock -= dt;
      uploadAll(false);
      res.lightClock -= dt;
      const sunKey = env.sun.map(v => v.toFixed(2)).join(",");
      if ((res.lightVersion !== w.terrainVersion && res.lightClock <= 0) || res.lightSun !== sunKey) {
        res.lightVersion = w.terrainVersion; res.lightSun = sunKey; res.lightClock = 0.2;
        bakeLight(env.sun);
      }
      buildMeshes();

      gl.disable(gl.BLEND);
      gl.enable(gl.DEPTH_TEST); gl.depthMask(true);
      gl.clearColor(env.fog[0], env.fog[1], env.fog[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      // sky
      let pr = progs.sky;
      gl.useProgram(pr.p); setCommon(pr, env);
      gl.uniformMatrix4fv(pr.u.uInvVP, false, R.invVP);
      gl.uniform3fv(pr.u.uMount, env.mount);
      gl.uniform1f(pr.u.uCloudY, R.base - 10);
      gl.depthMask(false);
      gl.bindVertexArray(skyVAO); gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.depthMask(true);

      // terrain
      pr = progs.terrain;
      gl.useProgram(pr.p); setCommon(pr, env);
      bindTex(pr, "uA", 0, res.texA); bindTex(pr, "uB", 1, res.texB); bindTex(pr, "uC", 2, res.texC); bindTex(pr, "uL", 3, res.texL);
      gl.uniform1f(pr.u.uBase, R.base);
      gl.uniform3fv(pr.u.uGrass, env.grass); gl.uniform3fv(pr.u.uGrassDry, env.grassDry);
      gl.uniform3fv(pr.u.uEarth, env.earth); gl.uniform3fv(pr.u.uStone, env.stone); gl.uniform3fv(pr.u.uMud, env.mud);
      const cur = env.cursor || {};
      gl.uniform4f(pr.u.uCursor, cur.x || 0, cur.y || 0, cur.r || 1, cur.visible ? 1 : 0);
      gl.uniform4f(pr.u.uCursor2, cur.tool === "dig" ? 1 : cur.tool === "level" ? 2 : 0, cur.target || 0, 0, 0);
      const marks = env.marks || [];
      const mk = new Float32Array(16);
      marks.slice(0, 4).forEach((m, i) => mk.set([m.x, m.y, m.r, m.danger ? 1 : 0], i * 4));
      gl.uniform4fv(pr.u.uMarks, mk); gl.uniform1f(pr.u.uMarkCount, Math.min(4, marks.length));
      gl.uniform1f(pr.u.uShowSuit, env.showSuit || 0);
      gl.uniform3f(pr.u.uSkirtNormal, 0, 1, 0);
      gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.frontFace(gl.CCW);
      gl.bindVertexArray(res.gridVAO);
      gl.drawElements(gl.TRIANGLES, res.gridCount, gl.UNSIGNED_INT, 0);
      gl.disable(gl.CULL_FACE);
      for (const s of res.skirts) {
        gl.uniform3fv(pr.u.uSkirtNormal, s.n);
        gl.bindVertexArray(s.vao); gl.drawArrays(gl.TRIANGLES, 0, s.count);
      }

      // houses and props
      if (res.meshCount) {
        pr = progs.mesh; gl.useProgram(pr.p); setCommon(pr, env);
        gl.bindVertexArray(res.meshVAO); gl.drawArrays(gl.TRIANGLES, 0, res.meshCount);
      }
      // trees
      pr = progs.tree; gl.useProgram(pr.p); setCommon(pr, env);
      bindTex(pr, "uA", 0, res.texA); bindTex(pr, "uB", 1, res.texB); bindTex(pr, "uC", 2, res.texC);
      gl.uniform3fv(pr.u.uLeaf, env.leaves.flat());
      for (const k of ["sugi", "broad"]) {
        const t = res.treeVAO[k];
        if (!t.inst) continue;
        gl.bindVertexArray(t.vao); gl.drawArraysInstanced(gl.TRIANGLES, 0, t.count, t.inst);
      }
      // rice
      if (res.riceCount) {
        pr = progs.rice; gl.useProgram(pr.p); setCommon(pr, env);
        bindTex(pr, "uA", 0, res.texA); bindTex(pr, "uC", 2, res.texC); bindTex(pr, "uL", 3, res.texL);
        gl.bindVertexArray(res.riceVAO);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, res.bladeVerts, res.riceCount);
      }
      // water
      pr = progs.water; gl.useProgram(pr.p); setCommon(pr, env);
      bindTex(pr, "uA", 0, res.texA); bindTex(pr, "uC", 2, res.texC); bindTex(pr, "uL", 3, res.texL);
      gl.uniform1f(pr.u.uRain, env.rain || 0);
      gl.uniform1f(pr.u.uShowSuit, env.showSuit || 0);
      gl.uniform3fv(pr.u.uWaterDeep, env.waterDeep); gl.uniform3fv(pr.u.uWaterShallow, env.waterShallow);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.bindVertexArray(res.gridVAO);
      gl.drawElements(gl.TRIANGLES, res.gridCount, gl.UNSIGNED_INT, 0);
      gl.depthMask(true); gl.disable(gl.BLEND);
      gl.bindVertexArray(null);
    };

    // World position under a screen point (CSS pixels), marching the height field.
    R.pick = function (sx, sy) {
      if (!R.invVP || !R.world) return null;
      const w = R.world;
      const nx = sx / canvas.clientWidth * 2 - 1, ny = 1 - sy / canvas.clientHeight * 2;
      const a = M.xform(R.invVP, nx, ny, -1), b = M.xform(R.invVP, nx, ny, 1);
      let dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      const len = Math.hypot(dx, dy, dz); dx /= len; dy /= len; dz /= len;
      const hAt = (x, z) => {
        if (x < 0 || z < 0 || x > w.W - 1 || z > w.H - 1) return -Infinity;
        const x0 = Math.floor(x), z0 = Math.floor(z), x1 = Math.min(x0 + 1, w.W - 1), z1 = Math.min(z0 + 1, w.H - 1);
        const fx = x - x0, fz = z - z0, g = w.ground;
        return (g[z0 * w.W + x0] * (1 - fx) + g[z0 * w.W + x1] * fx) * (1 - fz) + (g[z1 * w.W + x0] * (1 - fx) + g[z1 * w.W + x1] * fx) * fz;
      };
      let t = 0, prev = 0, hit = false;
      const maxT = len;
      const stepLen = 0.25;
      for (; t < maxT; t += stepLen) {
        const x = a[0] + dx * t, y = a[1] + dy * t, z = a[2] + dz * t;
        if (y < hAt(x, z)) { hit = true; break; }
        prev = t;
      }
      if (!hit) return null;
      let lo = prev, hi = t;
      for (let k = 0; k < 12; k++) {
        const m = (lo + hi) / 2;
        const x = a[0] + dx * m, y = a[1] + dy * m, z = a[2] + dz * m;
        if (y < hAt(x, z)) hi = m; else lo = m;
      }
      const x = a[0] + dx * hi, z = a[2] + dz * hi;
      return { x, y: z, h: a[1] + dy * hi };
    };
    R.project = function (x, y, z) {
      if (!R.vp) return null;
      const p = M.xform(R.vp, x, y, z);
      if (p[3] <= 0) return null;
      return { x: (p[0] * 0.5 + 0.5) * canvas.clientWidth, y: (0.5 - p[1] * 0.5) * canvas.clientHeight, depth: p[2] };
    };
    R.setExtraMesh = function (fn, key) { R.extraMesh = fn; R.extraMeshKey = key; if (R.res) R.res.meshKey = ""; };

    canvas.addEventListener("webglcontextlost", e => { e.preventDefault(); R.lost = true; }, false);
    canvas.addEventListener("webglcontextrestored", () => { location.reload(); }, false);
    return R;
  }

  root.MizuhoRender = { create, M };
})(typeof self !== "undefined" ? self : this);
