const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function setup(){
  const root='https://example.test/gallery/',listeners={},stores=new Map();
  const absolute=r=>new URL(typeof r==='string'?r:r.url,root).href;
  const caches={
    async open(name){if(!stores.has(name))stores.set(name,new Map());const map=stores.get(name);return {
      async addAll(urls){for(const u of urls){const file='./'+new URL(absolute(u)).pathname.replace('/gallery/','');assert.equal(u.cache,'reload','installation refreshes stale HTTP resources');assert.ok(fs.existsSync(path.join(__dirname,'..',file)),'precache asset exists: '+file);map.set(absolute(u),new Response(file));}},
      async put(r,response){map.set(absolute(r),response);},
      async match(r,opt={}){const key=new URL(absolute(r));for(const [url,res] of map){const candidate=new URL(url);if(opt.ignoreSearch){key.search='';candidate.search='';}if(key.href===candidate.href)return res.clone();}}
    };},async keys(){return [...stores.keys()];},async delete(k){return stores.delete(k);}
  };
  const self={location:{origin:'https://example.test',href:root+'sw.js'},addEventListener:(t,f)=>listeners[t]=f,skipWaiting:async()=>{},clients:{claim:async()=>{}}};
  let online=false;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8'),{self,caches,URL,Request,Response,fetch:async(r,opts)=>{assert.equal(opts.cache,'no-cache');if(!online)throw Error('offline');return new Response('fresh');}});
  async function event(name,request){const waits=[];let response;listeners[name]({request,waitUntil:p=>waits.push(p),respondWith:p=>response=p});const result=await response;await Promise.all(waits);return result;}
  return {event,stores,online:v=>online=v,request:u=>({url:root+u,method:'GET'})};
}
// sw.js の ASSETS が precache の唯一の真実。得手書きの控えではなく、sw.js を読み戻す。
function declaredAssets(){const src=fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8');const block=src.match(/const ASSETS = \[([\s\S]*?)\];/);assert.ok(block,'sw.js declares ASSETS');const list=block[1].match(/"\.\/[^"]+"/g);assert.ok(list&&list.length,'ASSETS is not empty');return list.map(s=>s.slice(3,-1));}
test('every required game asset is installed for offline use',async()=>{
  const h=setup();await h.event('install');
  const assets=[...h.stores.values()][0];
  const declared=declaredAssets();
  const urls=[...assets.keys()];
  assert.equal(assets.size,declared.length,'the installed count matches the declared precache list');
  for(const p of declared)assert.ok(urls.some(u=>u.endsWith('/'+p)),'asset is precached: '+p);
  // 作品の入口。作品的取りこぼしは、この一覧に現れない。
  for(const p of ['index.html','gpt6-chat/index.html','gpt6-chat/sen.html','gpt6-chat/setsuna.html','gpt6-chat/sen.css','gpt6-chat/sen.js','gpt6-chat/setsuna.css','gpt6-chat/setsuna.js','grok/index.html','oriko/index.html','mikan/index.html','hebi/index.html','kake/index.html','echo/index.html','luna/index.html','sol/index.html','sol/skyward/index.html','sol/works.html','gpt6-sol/index.html','opus/index.html'])assert.ok(urls.some(u=>u.endsWith('/'+p)),'work entry or runtime is precached: '+p);
});
test('offline directory URLs resolve to the installed gallery and game',async()=>{
  const h=setup();await h.event('install');
  for(const [url,text] of [['','./index.html'],['gpt6-chat/','./gpt6-chat/index.html'],['gpt6-chat/sen.html','./gpt6-chat/sen.html'],['gpt6-chat/setsuna.html','./gpt6-chat/setsuna.html'],['sol/','./sol/index.html'],['sol/skyward/','./sol/skyward/index.html'],['sol/works.html','./sol/works.html'],['gpt6-sol/','./gpt6-sol/index.html'],['opus/','./opus/index.html'],['grok/','./grok/index.html'],['oriko/','./oriko/index.html'],['mikan/','./mikan/index.html'],['hebi/','./hebi/index.html'],['kake/','./kake/index.html'],['echo/','./echo/index.html'],['luna/','./luna/index.html'],['game.js?v=new','./game.js']])assert.equal(await (await h.event('fetch',h.request(url))).text(),text);
  assert.equal((await h.event('fetch',h.request('missing.html'))).type,'error');
});
test('worker activation removes previous gallery caches and preserves unrelated apps',async()=>{
  const h=setup();await h.event('install');h.stores.set('test-prim-gallery-v9',new Map());h.stores.set('other-app',new Map());await h.event('activate');
  assert.ok(!h.stores.has('test-prim-gallery-v9'));assert.ok(h.stores.has('other-app'));
});
test('successful online content becomes the next offline response',async()=>{
  const h=setup();await h.event('install');h.online(true);await h.event('fetch',h.request('index.html'));h.online(false);
  assert.equal(await (await h.event('fetch',h.request('index.html'))).text(),'fresh');
});
