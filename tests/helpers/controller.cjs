const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Controllers run unchanged, with a small DOM/audio host and a controlled clock.
// Rendering is covered by the browser checks; these tests exercise transitions.
module.exports = function controller(file, options = {}) {
  let now = 0, nextId = 0;
  const elements = new Map(), events = {}, timers = new Map(), data = {};
  const ctx = new Proxy({}, { get: (o, k) => o[k] || (k.includes('Gradient') ? () => ({addColorStop(){}}) : () => {}), set: (o,k,v) => (o[k]=v,true) });
  const el = id => {
    if (elements.has(id)) return elements.get(id);
    const classes = new Set(), listeners = {};
    const node = { id, tagName:'BUTTON', style:{}, dataset:{}, children:[], textContent:'', innerHTML:'', hidden:false,
      classList:{add(...a){a.forEach(x=>classes.add(x));},remove(...a){a.forEach(x=>classes.delete(x));},contains(x){return classes.has(x);},toggle(x,on){if(on===undefined)on=!classes.has(x);on?classes.add(x):classes.delete(x);return on;}},
      addEventListener(t,fn){(listeners[t] ||= []).push(fn);},
      trigger(t,e={}){for(const fn of listeners[t]||[])fn({target:node,preventDefault(){},stopPropagation(){},detail:0,...e});},
      click(){node.trigger('click');},focus(){document.activeElement=node;},setAttribute(k,v){node[k]=String(v);},
      getAttribute(k){return node[k]||null;},getContext(){return ctx;},
      append(...items){node.children.push(...items);},appendChild(item){node.children.push(item);},replaceChildren(...items){node.children=items;},
      querySelectorAll(){return [];},querySelector(selector){return el(id+'-'+selector);},closest(){return null;},
      getBoundingClientRect(){return {left:0,top:0,right:390,bottom:844,width:390,height:844};},setPointerCapture(){},isConnected:true
    };
    let html='';
    Object.defineProperty(node,'innerHTML',{get:()=>html,set:value=>{html=String(value);node.children=[];}});
    Object.defineProperty(node,'firstElementChild',{get(){return node.children[0] || el(id+'-first');}});
    elements.set(id,node); return node;
  };
  const document = {getElementById:el,createElement:()=>el('dynamic-'+(++nextId)),querySelectorAll:()=>[],querySelector:()=>null,
    body:el('body'),activeElement:null,hidden:false,addEventListener(t,fn){events['document:'+t]=fn;}};
  document.body.tagName='BODY';
  const sources=[];
  const param=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},linearRampToValueAtTime(){},cancelScheduledValues(){},setTargetAtTime(){}});
  const audioNode=()=>({connect(){return this;},frequency:param(),gain:param(),detune:param(),Q:param(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param()});
  const source=()=>{const n=audioNode();n.start=t=>{n.started=t;sources.push(n);};n.stop=t=>{if(t===undefined){n.cancelled=true;n.onended?.();}};return n;};
  class AudioContext {
    constructor(){this.state='running';this.sampleRate=8000;this.destination=audioNode();}
    get currentTime(){return now/1000;}
    resume(){this.state='running';return Promise.resolve();}
    createGain(){return audioNode();}createDynamicsCompressor(){return audioNode();}createBiquadFilter(){return audioNode();}
    createOscillator(){return source();}createBufferSource(){return source();}
    createBuffer(ch,len){return {getChannelData:()=>new Float32Array(len)};}
  }
  const window = {innerWidth:390,innerHeight:844,devicePixelRatio:1,matchMedia:()=>({matches:false,addEventListener(){}}),
    addEventListener(t,fn){events[t]=fn;},...options.globals};
  if(options.audio)window.AudioContext=AudioContext;
  let code=fs.readFileSync(path.join(__dirname,'../..',file),'utf8');
  if(options.instrument)code=options.instrument(code);
  const queue=[];
  vm.runInNewContext(code,{...options.globals,window,document,localStorage:{getItem:k=>data[k]||null,setItem:(k,v)=>data[k]=v},
    performance:{now:()=>now},navigator:{vibrate(){}},location:{protocol:'http:',hostname:'localhost'},
    requestAnimationFrame:fn=>queue.push(fn),setTimeout:(fn)=>{const id=++nextId;timers.set(id,fn);return id;},
    clearTimeout:id=>timers.delete(id),setInterval:()=>++nextId,clearInterval(){}}, {timeout:4000});
  return {window,document,el,events,data,sources,timers,setTime:t=>now=t,
    frame(){const f=queue.splice(0);f.forEach(fn=>fn(now));},flushTimers(){const t=[...timers.values()];timers.clear();t.forEach(fn=>fn());}};
};
