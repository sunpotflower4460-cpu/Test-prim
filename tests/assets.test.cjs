const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const pages=['index.html','sol/works.html','sol/index.html','sol/skyward/index.html','luna/index.html','gpt6-sol/index.html','opus/index.html','haiku/index.html','haiku/horror/index.html','haiku/kitchen/index.html','haiku/ku/index.html'];
function local(file,url){if(/^(?:[a-z]+:|\/\/|#)/i.test(url))return;const target=path.resolve(path.dirname(path.join(root,file)),decodeURIComponent(url.split(/[?#]/)[0]));assert.ok(target.startsWith(root+path.sep));assert.ok(fs.statSync(target).isFile(),file+' links to '+url);}
test('every game page and author list has working local links and assets and unique ids',()=>{
 for(const page of pages){const html=fs.readFileSync(path.join(root,page),'utf8'),ids=new Set();
  for(const [,id] of html.matchAll(/\bid="([^"]+)"/g)){assert.ok(!ids.has(id),page+' repeats id '+id);ids.add(id);}
  for(const [,url] of html.matchAll(/\b(?:href|src)="([^"]+)"/g))local(page,url);
 }
});
test('GPT 6.1 sol opens its own list while GPT 6 sol remains a separate author',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),list=fs.readFileSync(path.join(root,'sol/works.html'),'utf8');
 assert.match(html,/id="openSolBtn"[^>]*href="sol\/works\.html"/);
 assert.match(html,/id="openGpt6SolBtn"[^>]*href="gpt6-sol\/index\.html"/);
 assert.match(list,/href="index\.html"[^>]*aria-label="AFTERTIDE/);
 assert.match(list,/GPT 6\.1 sol 2/);assert.match(list,/href="skyward\/index\.html"[^>]*aria-label="SKYWARD/);
});
test('Opus 5.5 still opens MIZUHO from its door',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.match(html,/id="openOpusBtn"[^>]*href="opus\/index\.html"/);
 const page=fs.readFileSync(path.join(root,'opus/index.html'),'utf8');
 assert.match(page,/href="\.\.\/index\.html"/,'MIZUHO leads back to the gallery');
});
test('Haiku 5.5 is the last door of the gallery and opens its three works',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.match(html,/id="openHaikuBtn"[^>]*href="haiku\/index\.html"/);
 const doors=[...html.matchAll(/class="launcher-button(?: [^"]*)?"/g)];
 assert.equal(doors.length,10,'ten doors');
 assert.match(doors[doors.length-1][0],/launcher-button-haiku/);
 const list=fs.readFileSync(path.join(root,'haiku/index.html'),'utf8');
 assert.match(list,/href="\.\.\/index\.html"/,'the Haiku list leads back to the gallery');
 for(const work of ['horror/index.html','kitchen/index.html','ku/index.html'])assert.match(list,new RegExp('href="'+work.replace('/','\\/')+'"'),'the list opens '+work);
 const dims=fs.readFileSync(path.join(root,'haiku/works.css'),'utf8');
 assert.match(dims,/\.work/);
});
