const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {metadeDeServidor}=require('./mundo-da-api6.cjs');
// A metade de servidor com o `mundo` da API 6 (`mundo.tema`, `mundo.avisar`),
// um contexto novo a cada pedido, como o servidor faz.
function server(opcoes={}){
  const manifesto=JSON.parse(fs.readFileSync(path.join(__dirname,'../mod.json'),'utf8'));
  return metadeDeServidor({codigo:fs.readFileSync(path.join(__dirname,'../servidor/main.js'),'utf8'),manifesto,...opcoes});
}
const member={person:'2',channel:1,admin:false,write:true};
test('Estilo: admin-only, persistência, escopo por servidor e revisão concorrente',()=>{
  const s=server(),initial=s.call({op:'view'});
  assert.equal(initial.enabled,false);
  assert.equal(s.call({op:'save',revision:0,theme:initial.theme,admin:true},member).ok,false);
  assert.equal(s.call({op:'save',revision:0,theme:initial.theme}).revision,1);
  assert.equal(s.call({op:'view'}, {...member,channel:5}).enabled,true);
  assert.equal(s.call({op:'save',revision:0,theme:initial.theme}).ok,false);
  assert.equal(server().call({op:'view'}).revision,0);
  assert.equal(s.call({op:'reset',revision:1}).enabled,false);
});
test('Estilo: valida contraste, CSS injetado e opções',()=>{
  const s=server(),t=s.call({op:'view'}).theme;
  for(const changed of [{text:t.background},{accent:'red;display:none'},{radius:99},{density:'broken'},{glow:'yes'}])assert.equal(s.call({op:'save',revision:0,theme:{...t,...changed}}).ok,false);
  assert.equal(s.call({op:'view'}).revision,0);
});
// **A recusa de um campo diz qual campo, e por quê.** A frase sozinha não dá à
// janela onde pôr o erro, e o formulário da API 6 marca o campo que a causou:
// `formulario.erros(erros)`. A forma é a combinada entre os MODs oficiais:
// `erros` é um mapa da `chave` do controle para um motivo curto, para quem usa;
// a recusa que não é de campo (permissão, revisão) não o leva; e `error`
// continua sendo o de hoje, que é o que o cliente da 3.x mostra.
test('Estilo: a recusa de um campo diz qual campo e por quê',()=>{
  const s=server(),t=s.call({op:'view'}).theme;
  const salvar=theme=>s.call({op:'save',revision:0,theme});
  // Texto igual ao fundo: falha sobre o fundo e sobre o painel, que é quase igual.
  const contraste=salvar({...t,text:t.background});
  assert.equal(contraste.ok,false);
  assert.match(contraste.error,/Contraste/);
  assert.deepEqual(Object.keys(contraste.erros),['text','background','panel']);
  assert.match(contraste.erros.text,/^texto sobre o fundo dá 1,00:1, e precisa de 4,5:1$/);
  assert.equal(contraste.erros.background,contraste.erros.text);
  assert.match(contraste.erros.panel,/^texto sobre o painel dá 1,\d\d:1, e precisa de 4,5:1$/);
  assert.deepEqual(salvar({...t,accent:'red;display:none'}).erros,{accent:'uma cor #rrggbb'});
  assert.deepEqual(salvar({...t,radius:99}).erros,{radius:'um inteiro de 0 a 24'});
  assert.deepEqual(salvar({...t,density:'broken'}).erros,{density:'compacta ou confortável'});
  assert.deepEqual(salvar({...t,font:'serif'}).erros,{font:'monoespaçada ou sem serifa'});
  assert.deepEqual(salvar({...t,glow:'yes'}).erros,{glow:'sim ou não'});
  // A recusa que não é de um campo continua sem `erros`.
  const revisao=s.call({op:'save',revision:7,theme:t});
  assert.equal(revisao.ok,false);
  assert.equal('erros' in revisao,false);
  assert.equal('erros' in s.call({op:'save',revision:0,theme:t},member),false);
});
// ---- a API 6: o tema é dado do servidor ----
//
// A metade de servidor declara o tema com `mundo.tema`, o servidor o guarda e o
// manda às janelas no `TemaMudou`, e o produto o aplica. O ESTILO continua
// guardando o tema no quintal (`dados.theme`, o mesmo formato desde a 1.0.0), e
// as duas cópias andam juntas: a declaração e o quintal valem na mesma tomada.
const claro={background:'#f4f1ea',panel:'#ffffff',text:'#1c1916',muted:'#5e564c',accent:'#1d4ed8',border:'#d8d0c4',radius:4,density:'comfortable',font:'sans',glow:false};
test('Estilo: publicar declara o tema ao servidor, na forma da API, e avisa as janelas',()=>{
  const s=server(),t=s.call({op:'view'}).theme;
  assert.equal(s.call({op:'save',revision:0,theme:t}).ok,true);
  assert.deepEqual(s.temas,[{fundo:'#050403',painel:'#0a0806',texto:'#eae3cf',apagado:'#908574',acento:'#f2521f',
    borda:'#241f19',densidade:'confortavel',fonte:'mono',arredondamento:0,brilho:false,modo:'escuro'}],
    'o tema publicado não foi declarado ao servidor na forma da API');
  // A carga é a revisão: a janela pede o estado só se ela for maior que a dela.
  assert.deepEqual(s.avisos,[{carga:{revision:1}}]);
});
test('Estilo: o modo do tema declarado segue o fundo, pela conta do produto',()=>{
  const s=server();
  assert.equal(s.call({op:'save',revision:0,theme:claro}).ok,true);
  assert.equal(s.temas.at(-1).modo,'claro');
  assert.equal(s.temas.at(-1).fonte,'sans');
});
test('Estilo: restaurar tira o tema do servidor, e avisa',()=>{
  const s=server(),t=s.call({op:'view'}).theme;
  s.call({op:'save',revision:0,theme:t});
  assert.equal(s.call({op:'reset',revision:1}).ok,true);
  assert.equal(s.temas.at(-1),null,'restaurar não tirou o tema do servidor');
  assert.deepEqual(s.avisos.at(-1),{carga:{revision:2}});
});
test('Estilo: com a aparência de outro MOD, publicar não grava nada e diz por quê',()=>{
  const s=server({outroModEscolhido:true}),t=s.call({op:'view'}).theme;
  const r=s.call({op:'save',revision:0,theme:t});
  assert.equal(r.ok,false);
  assert.match(r.error,/outro MOD/);
  assert.equal(s.call({op:'view'}).revision,0,'gravou no quintal um tema que o servidor recusou');
  assert.deepEqual(s.temas,[]);
  assert.deepEqual(s.avisos,[]);
});
// **Depois da subida do Servidor 0.15 para o 1.0**, o quintal do ESTILO vem
// inteiro (o `mod_data` é por identificador do MOD), mas o tema guardado pelo
// servidor é novo na 6 e começa vazio. Sem redeclarar, um servidor com tema
// ligado abriria com a aparência padrão para todo mundo até alguém publicar.
test('Estilo: depois da subida, o primeiro view redeclara o tema guardado, uma vez',()=>{
  const s=server();
  s.data.theme=JSON.stringify({revision:3,theme:claro,enabled:true});
  assert.equal(s.call({op:'view'},member).ok,true);
  assert.equal(s.temas.length,1,'o tema guardado na 3.x não foi declarado ao servidor');
  assert.equal(s.temas[0].modo,'claro');
  s.call({op:'view'},member);
  assert.equal(s.temas.length,1,'o tema foi declarado de novo sem nada mudar');
  // Desligado, não há o que declarar.
  const d=server();
  d.data.theme=JSON.stringify({revision:2,theme:claro,enabled:false});
  d.call({op:'view'});
  assert.deepEqual(d.temas,[]);
});
test('Estilo: a redeclaração recusada é dita no view',()=>{
  const s=server({outroModEscolhido:true});
  s.data.theme=JSON.stringify({revision:3,theme:claro,enabled:true});
  const r=s.call({op:'view'});
  assert.equal(r.ok,true);
  assert.equal(r.declaracao?.erro,'tema-de-outro-mod');
  assert.deepEqual(s.temas,[]);
});
test('Estilo: um pedido de escopo de servidor, sem canal, funciona',()=>{
  const s=server();
  assert.equal(s.call({op:'view'},{person:'1',channel:null,admin:true,write:true}).ok,true);
});
test('Distribuição: manifestos e JavaScript válidos, pacote independente',()=>{
  for(const mod of ['estilo']){
    const dir=path.join(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(dir,'mod.json')));
    // A API que este pacote declara e o produto executa: as aceitas do contrato.
    const aceitas=JSON.parse(fs.readFileSync(path.join(__dirname,'contrato/v6.json'),'utf8')).compatibilidade.aceitas;
    assert.ok(aceitas.includes(manifest.api),'API declarada: '+manifest.api);
    // A porta do tema: só um MOD que a declara pode chamar mundo.tema.
    assert.equal(manifest.tema,true,'o mod.json não declara a porta do tema');assert.equal(manifest.id,'seele/'+mod);
    for(const reach of manifest.reach)assert.ok(Buffer.byteLength(reach,'utf8')<=32,'Cada alcance deve caber no limite do protocolo.');
    new vm.Script(fs.readFileSync(path.join(dir,manifest.client),'utf8'));
    new vm.Script(fs.readFileSync(path.join(dir,manifest.server),'utf8'));
  }
});
// O README vai no pacote publicado, e o catálogo o serve como está. Na 3.1.0
// ele ainda dizia «2.0.0», «Requer API de MOD 3» e «aplica somente quatro
// cores», e o cabeçalho do cliente gerado dizia «API 3».
test('Distribuição: o README e o cliente gerado dizem a versão e a API do manifesto',()=>{
  const dir=path.join(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(dir,'mod.json')));
  const readme=fs.readFileSync(path.join(dir,'README.md'),'utf8');
  assert.ok(readme.split('\n')[0].endsWith('— '+manifest.version),'o título do README não diz a versão '+manifest.version+': '+readme.split('\n')[0]);
  assert.ok(readme.includes('API de MOD '+manifest.api+'**'),'o README não diz a API '+manifest.api+' que o manifesto declara');
  const cabecalho=fs.readFileSync(path.join(dir,manifest.client),'utf8').split('\n')[0];
  assert.ok(cabecalho.includes('API '+manifest.api+'.'),'o cabeçalho do cliente gerado não diz a API '+manifest.api+': '+cabecalho);
  // O contrato que ele cita é o da API declarada, e o prelúdio que ele manda
  // procurar é o que o laboratório lê: o README da 3.x citava `api/v4.json` e
  // `executor.rs`, de onde o prelúdio já tinha saído.
  assert.ok(readme.includes('api/v'+manifest.api+'.json'),'o README não cita o contrato api/v'+manifest.api+'.json');
  const preludio=fs.readFileSync(path.join(dir,'ferramentas/preview.cjs'),'utf8').match(/path\.join\(seele, '([^']+preludio[^']*)'\)/)[1];
  assert.ok(readme.includes(preludio),'o README não diz de onde o laboratório recorta o prelúdio: '+preludio);
});
// O catálogo publica a árvore inteira do commit, e não só o pacote: uma pasta
// que nada usa vai junto para quem baixa. `ferramentas/native/` (um
// `tokens.css` velho e oito fontes, cerca de 188 KiB) foi assim por três
// versões. Cada coisa em `ferramentas/` é citada pelo `package.json`, pelo
// README ou por outra ferramenta.
test('Distribuição: nada em ferramentas/ fica sem quem o use',()=>{
  const dir=path.join(__dirname,'..'),raiz=path.join(dir,'ferramentas');
  const textos=(onde,fora)=>fs.readdirSync(onde,{withFileTypes:true}).flatMap(e=>{
    const caminho=path.join(onde,e.name);
    if(caminho===fora||e.name==='target'||e.name==='node_modules')return [];
    if(e.isDirectory())return textos(caminho,fora);
    return /\.(c?js|mjs|json|md|rs|toml|css)$/.test(e.name)?[fs.readFileSync(caminho,'utf8')]:[];
  });
  const soltas=fs.readdirSync(raiz).filter(nome=>{
    const citam=[fs.readFileSync(path.join(dir,'package.json'),'utf8'),fs.readFileSync(path.join(dir,'README.md'),'utf8'),
      ...textos(raiz,path.join(raiz,nome))];
    return !citam.some(t=>t.includes(nome));
  });
  assert.deepEqual(soltas,[],'em ferramentas/, sem ninguém que as cite');
});
// O `package.json` e o lockfile dizem a versão do pacote; um dizendo outra é a
// versão de ninguém (o lockfile da 3.0.0 ainda dizia 2.0.0).
test('Distribuição: o package.json e o lockfile dizem a versão do manifesto',()=>{
  const dir=path.join(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(dir,'mod.json')));
  const pacote=JSON.parse(fs.readFileSync(path.join(dir,'package.json'),'utf8'));
  const trava=JSON.parse(fs.readFileSync(path.join(dir,'package-lock.json'),'utf8'));
  assert.deepEqual([pacote.version,trava.version,trava.packages[''].version],
    [manifest.version,manifest.version,manifest.version]);
});
module.exports={server};
