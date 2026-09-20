const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function server(mod){
  const source=fs.readFileSync(path.join(__dirname,'../servidor/main.js'),'utf8');
  const data={},files={};let now=1789694000,failWrite=false;
  return {data,files,setFailWrite(v){failWrite=v;},advance(n){now+=n;},call(request,ctx={person:'1',channel:1,admin:true,write:true}){
    // API 2 instantiates a fresh JS context for each authenticated request.
    const context=vm.createContext({dados:data,arquivos:{ler:p=>files[p]??null,escrever:(p,v)=>{if(failWrite)return false;files[p]=v;return true;},apagar:p=>{delete files[p];return true;}},mundo:{agora:()=>now},Math});
    vm.runInContext(source,context,{timeout:250});
    return JSON.parse(context.aoPedir(JSON.stringify(ctx),JSON.stringify(request)));
  }};
}
const member={person:'2',channel:1,admin:false,write:true};
const profile={displayName:'Mika ✨',pronouns:'ela/dela',bio:'Mestra de RPG\nCafé e aventuras.',status:'Preparando a sessão',accent:'#a78bfa',effect:'aurora'};
test('Estilo: admin-only, persistência, escopo por servidor e revisão concorrente',()=>{
  const s=server('estilo'),initial=s.call({op:'view'});
  assert.equal(initial.enabled,false);
  assert.equal(s.call({op:'save',revision:0,theme:initial.theme,admin:true},member).ok,false);
  assert.equal(s.call({op:'save',revision:0,theme:initial.theme}).revision,1);
  assert.equal(s.call({op:'view'}, {...member,channel:5}).enabled,true);
  assert.equal(s.call({op:'save',revision:0,theme:initial.theme}).ok,false);
  assert.equal(server('estilo').call({op:'view'}).revision,0);
  assert.equal(s.call({op:'reset',revision:1}).enabled,false);
});
test('Estilo: valida contraste, CSS injetado e opções',()=>{
  const s=server('estilo'),t=s.call({op:'view'}).theme;
  for(const changed of [{text:t.background},{accent:'red;display:none'},{radius:99},{density:'broken'},{glow:'yes'}])assert.equal(s.call({op:'save',revision:0,theme:{...t,...changed}}).ok,false);
  assert.equal(s.call({op:'view'}).revision,0);
});
const gif='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
function upload(s,image=gif,ctx){
  const start=s.call({op:'upload-start',slot:'banner',length:image.length},ctx);assert.equal(start.ok,true);
  let result;for(let n=0,i=0;n<image.length;n+=6000,i++)result=s.call({op:'upload-part',token:start.token,index:i,part:image.slice(n,n+6000)},ctx);
  return result;
}
test('Distribuição: manifestos e JavaScript válidos, pacote independente',()=>{
  for(const mod of ['estilo']){
    const dir=path.join(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(dir,'mod.json')));
    // A API que este pacote declara e o produto executa — ver `APIS_ACEITAS`.
    assert.ok([3,4].includes(manifest.api),'API declarada: '+manifest.api);assert.equal(manifest.id,'seele/'+mod);
    for(const reach of manifest.reach)assert.ok(Buffer.byteLength(reach,'utf8')<=32,'Cada alcance deve caber no limite do protocolo.');
    new vm.Script(fs.readFileSync(path.join(dir,manifest.client),'utf8'));
    new vm.Script(fs.readFileSync(path.join(dir,manifest.server),'utf8'));
  }
});
module.exports={server};
