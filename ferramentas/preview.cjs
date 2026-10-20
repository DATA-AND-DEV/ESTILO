// Laboratório local, com identidades simuladas. Nunca use como servidor público.
//
// # O que este laboratório prova, e o que ele não prova
//
// A versão anterior estava **obsoleta e não dizia**: ela procurava
// `PRELUDIO_DO_MOD` dentro de `base.js`, que mudou de arquivo quando o ADR 0049
// levou a execução para o QuickJS nativo; recortava `desenharARegiaoDoMod` por
// índice de string, com uma assinatura que também mudou; e montava um `Worker`
// de navegador, que é precisamente o ambiente que o ADR tirou. A auditoria de
// 20/09/2026 encontrou os três, e observou que «corrigir o laboratório é parte
// da entrega da API, pois é o que o criador de MOD usa para aprender».
//
// O que ele faz, na API 6:
//
// - **o prelúdio vem de onde ele mora agora**: `crates/seele-motor/src/
//   preludio.rs`, recortado da constante `PRELUDIO`. Um prelúdio que não for
//   encontrado é um erro com o caminho, e não um `undefined` que roda o MOD sem
//   API. O relógio é o dele: o prelúdio monta `setTimeout` sobre um vetor de
//   pedidos, e o laboratório os recolhe a cada volta, como o motor;
// - **o código do MOD roda num contexto sem DOM e sem Node**, com a mesma
//   fachada de mensagens que o executor oferece. Não é QuickJS — é o `vm` do
//   Node, que tem `Promise`, `Map` e o resto do JavaScript moderno, como o
//   QuickJS tem. Um MOD que dependesse de algo do V8 que o QuickJS não tem
//   passaria aqui e falharia no produto, e é para isso que existe
//   `ferramentas/quickjs-check`;
// - **a metade de servidor roda no mundo de mentira dos testes**
//   (`test/mundo-da-api6.cjs`), o mesmo que `contrato.test.cjs` confere contra
//   o vetor do produto: `mundo.tema` com as recusas do servidor, `mundo.avisar`
//   com o teto dele, e os dois valendo só se o `aoPedir` terminar;
// - **o tema é do servidor**: o que a metade de servidor declara vai a todas
//   as janelas daquele servidor, ao conectar e a cada mudança, como o
//   `TemaMudou`; e o aviso, como o `ModAviso`. A janela os aplica pela casca;
// - **o renderer e a casca do tema são os do produto**, servidos dos arquivos
//   reais: `mods-estilos.js`, `mods-regiao.js`, `mods-superficies.js` e
//   `mods-contribuicoes.js`, com as folhas deles, e o tema, a prévia, as
//   capacidades e a recusa recortados de `base.js`. Não há cópia.
//
// O que ele **não** prova: o executor real, os limites de memória e tempo dele,
// a supervisão nativa, a revogação por geração e o descarte; o servidor real,
// que guarda o tema em disco e escolhe entre dois MODs de tema. Isso é o
// produto, e a auditoria pede observação nativa para dar qualquer fluxo por
// homologado.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { metadeDeServidor } = require('../test/mundo-da-api6.cjs');

const root = process.env.MOD_PACKAGE || path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'mod.json')));
const seele = process.env.SEELE_RAIZ || path.resolve(__dirname, '../../SEELE');
const produto = process.env.SEELE_UI || path.join(seele, 'apps/seele-app/ui');

/** Lê um arquivo do produto, dizendo o caminho quando ele não está lá. */
function doProduto(relativo) {
  const caminho = path.join(produto, relativo);
  if (!fs.existsSync(caminho)) {
    throw new Error(`O laboratório precisa de ${caminho}. `
      + 'Aponte SEELE_UI para a pasta `apps/seele-app/ui` de um checkout do SEELE.');
  }
  return fs.readFileSync(caminho, 'utf8');
}

/**
 * O prelúdio, recortado de onde ele mora: o motor em Rust.
 *
 * Recortar texto de outro arquivo é frágil, e é de propósito que a falha seja
 * ruidosa: um prelúdio que mudou de forma tem de quebrar o laboratório, e não
 * virar um `undefined` que roda o MOD sem API nenhuma e o faz falhar por outro
 * motivo.
 */
function preludioDoMotor() {
  const fonte = path.join(seele, 'crates/seele-motor/src/preludio.rs');
  if (!fs.existsSync(fonte)) {
    throw new Error(`O laboratório precisa de ${fonte}. `
      + 'Aponte SEELE_RAIZ para um checkout do SEELE.');
  }
  const texto = fs.readFileSync(fonte, 'utf8');
  const marca = 'pub const PRELUDIO: &str = r#"';
  const inicio = texto.indexOf(marca);
  const fim = texto.indexOf('"#;', inicio);
  if (inicio < 0 || fim < 0) {
    throw new Error(`\`PRELUDIO\` não foi encontrado em ${fonte}. `
      + 'Ele mudou de nome ou de forma, e este laboratório precisa acompanhar.');
  }
  return texto.slice(inicio + marca.length, fim);
}

const preludio = preludioDoMotor();

/**
 * Uma declaração de `base.js`, inteira, de `cabeca` até o fim dela: numa
 * função, o fecho que equilibra as chaves do corpo; numa constante, o `;` fora
 * de qualquer parêntese, colchete ou chave.
 */
function recortarDeclaracao(texto, cabeca, fonte) {
  const inicio = texto.indexOf(cabeca);
  if (inicio < 0) {
    throw new Error(`\`${cabeca}\` não foi encontrado em ${fonte}. `
      + 'Mudou de nome ou de lugar, e este laboratório precisa acompanhar.');
  }
  const funcao = cabeca.startsWith('function ');
  const abre = funcao ? '{' : '([{';
  const fecha = funcao ? '}' : ')]}';
  let fundura = 0;
  for (let i = funcao ? texto.indexOf('{', inicio) : inicio; i >= 0 && i < texto.length; i += 1) {
    if (abre.includes(texto[i])) fundura += 1;
    else if (fecha.includes(texto[i]) && (fundura -= 1) === 0 && funcao) return texto.slice(inicio, i + 1);
    else if (!funcao && texto[i] === ';' && fundura === 0) return texto.slice(inicio, i + 1);
  }
  throw new Error(`\`${cabeca}\` não fecha em ${fonte}.`);
}

/**
 * A casca do tema e das mensagens do produto, recortada de `base.js`.
 *
 * O laboratório respondia ao pedido `tema` sem pintar nada: a prévia não
 * aparecia, as recusas do produto (posse do token, contraste, intervalo) nunca
 * aconteciam, e a saída do tema não tinha como ser conferida. Para um MOD de
 * tema, era um laboratório que não mostrava o MOD.
 *
 * **Recortada como o prelúdio, e não reescrita**: uma cópia daria ao
 * laboratório uma regra de tema que o produto não tem. São três partes:
 *
 * - o bloco do tema, de `temaDosMods` até o fim de `contrasteEntre`: as
 *   tabelas, os pisos, as cores de estado derivadas, o selo da prévia e o tema
 *   do servidor;
 * - as capacidades da API e a conferência delas (`podePedir`), e o retrato;
 * - a recusa como o MOD a recebe, conferida na lista fechada do contrato, a
 *   prévia e o aviso da metade de servidor.
 *
 * Conferido de três jeitos — as marcas, as declarações que a ponte chama, e a
 * sintaxe. Qualquer um que falhe para o laboratório na partida, com o caminho:
 * um nome que mudou no produto não pode virar um laboratório que pinta nada
 * calado.
 */
function cascaDoProduto() {
  const fonte = path.join(produto, 'base.js');
  const texto = doProduto('base.js');
  const marca = 'const temaDosMods = new Map();';
  const inicio = texto.indexOf(marca);
  const ultima = texto.indexOf('function contrasteEntre(', inicio);
  if (inicio < 0 || ultima < 0) {
    throw new Error(`A aplicação do tema não foi encontrada em ${fonte}: faltam `
      + '`const temaDosMods = new Map();` ou `function contrasteEntre(`. '
      + 'Ela mudou de nome ou de lugar, e este laboratório precisa acompanhar.');
  }
  const bloco = texto.slice(inicio, ultima) + recortarDeclaracao(texto, 'function contrasteEntre(', fonte);
  const avulsas = [
    'const CAPACIDADES_POR_API = ',
    'const CAPACIDADE_DA_MENSAGEM = ',
    'function podePedir(',
    'function projetarORetrato(',
    'const REGIOES_E_CAMADAS_DA_API = ',
    'function cascaDoRetrato(',
    'function aCascaTemARegiao(',
    'function superficieDoMod(',
    'function recusaParaOMod(',
    'const RECUSAS_AO_MOD = ',
    'function recusaAoMod(',
    'function recusaDosNos(',
    'function recusaDaListaFechada(',
    'function aplicarAPreviaDoTema(',
    'const previasComDono = ',
    'function aoFecharASuperficieDaPrevia(',
    'function entregarOAvisoDoMod(',
  ].map(cabeca => recortarDeclaracao(texto, cabeca, fonte));
  const recorte = [bloco, ...avulsas].join('\n\n');
  const usadas = ['temaDosMods', 'previasDoTema', 'temaDoServidorEmVigor',
    'aplicarOTemaDoServidor', 'escreverOTemaDaSessao', 'contrasteEntre', 'CAPACIDADES_POR_API',
    'podePedir', 'projetarORetrato', 'cascaDoRetrato', 'recusaParaOMod', 'RECUSAS_AO_MOD',
    'recusaAoMod', 'recusaDosNos', 'recusaDaListaFechada', 'aplicarAPreviaDoTema',
    'aoFecharASuperficieDaPrevia', 'entregarOAvisoDoMod'];
  const faltam = usadas.filter(nome => !new RegExp(`(?:const|let|function)\\s+${nome}\\b`).test(recorte));
  if (faltam.length) {
    throw new Error(`O recorte da casca em ${fonte} não declara ${faltam.join(', ')}.`);
  }
  try {
    new vm.Script(recorte);
  } catch (erro) {
    throw new Error(`O recorte da casca em ${fonte} não é JavaScript inteiro: ${erro.message}`);
  }
  return recorte;
}

const casca = cascaDoProduto();

/**
 * As capacidades que este manifesto declara: as do produto, lidas da mesma
 * tabela que a janela usa (`CAPACIDADES_POR_API`). Uma API que o produto não
 * executa não tem capacidade nenhuma, e o prelúdio monta um MOD sem API.
 */
const CAPACIDADES_POR_API = vm.runInNewContext(
  recortarDeclaracao(doProduto('base.js'), 'const CAPACIDADES_POR_API = ', 'base.js')
    + '\nCAPACIDADES_POR_API',
);
const capacidades = [...(CAPACIDADES_POR_API[Number(manifest.api)] ?? [])];

// ------------------------------------------------------- o mundo de mentira

const codigoDoServidor = fs.readFileSync(path.join(root, manifest.server), 'utf8');

/**
 * O estado de um servidor simulado, criado na primeira vez que alguém fala: a
 * metade de servidor do MOD, e o tema que ela declarou por último — o que o
 * servidor guarda e manda a quem conecta.
 */
const mundos = new Map();
function mundoDe(chave) {
  if (!mundos.has(chave)) {
    mundos.set(chave, {
      metade: metadeDeServidor({
        codigo: codigoDoServidor,
        manifesto: manifest,
        agora: Math.floor(Date.now() / 1000),
      }),
      tema: null,
    });
  }
  return mundos.get(chave);
}

/**
 * O tema do servidor como o retrato e o `TemaMudou` o trazem: o id do MOD que o
 * declarou e os valores em JSON, ou `null`.
 */
const temaNoFio = valores => (valores === null ? null
  : { mod_id: manifest.id, valores: JSON.stringify(valores) });

/** Uma volta ao servidor deste MOD; o tema e os avisos que valeram vão às janelas. */
function aoPedir(chaveDoMundo, contexto, pedido) {
  const mundo = mundoDe(chaveDoMundo);
  const { temas, avisos } = mundo.metade;
  const [temasAntes, avisosAntes] = [temas.length, avisos.length];
  const resposta = mundo.metade.call(pedido, contexto);
  if (temas.length > temasAntes) {
    mundo.tema = temas[temas.length - 1];
    paraAsJanelas(chaveDoMundo, { nucleo: 'tema', tema: temaNoFio(mundo.tema) });
  }
  for (const aviso of avisos.slice(avisosAntes)) {
    paraAsJanelas(chaveDoMundo, {
      nucleo: 'aviso',
      aviso: { mod_id: manifest.id, canal: aviso.canal ?? null, carga: JSON.stringify(aviso.carga) },
    });
  }
  return resposta;
}

// ------------------------------------------------- o executor de mentira
//
// Um contexto por janela do laboratório. O prelúdio primeiro, o MOD depois —
// a mesma ordem do executor, e pelo mesmo motivo: se o prelúdio não subir, o
// MOD não deve subir.

const sessoes = new Map();

function novaSessao(chave, mandarParaAJanela) {
  const pendentes = [];
  const relogios = new Map();
  const contexto = vm.createContext({
    // **Sem DOM e sem Node.** O que existe aqui é o que o motor oferece: a
    // ponte (`seele.postar`) e a porta do registro (`seele.console`). O
    // `console` e os temporizadores são o prelúdio que monta.
    seele: {
      postar: texto => {
        pendentes.push(texto);
        queueMicrotask(() => {
          while (pendentes.length) mandarParaAJanela(pendentes.shift());
        });
        return true;
      },
      console: () => {},
    },
  });
  /**
   * Uma volta do motor: roda, e recolhe os temporizadores que ela pediu, como
   * `recolher_pedidos_de_relogio` faz.
   */
  const volta = codigo => {
    try {
      return vm.runInContext(codigo, contexto, { timeout: 2000 });
    } finally {
      const pedidos = JSON.parse(vm.runInContext('__seelePedidosDeRelogio()', contexto) || '[]');
      for (const { id, ms, repete, cancelar } of pedidos) {
        clearTimeout(relogios.get(id));
        relogios.delete(id);
        if (cancelar) continue;
        const disparar = () => {
          if (!repete) relogios.delete(id);
          else relogios.set(id, setTimeout(disparar, Math.max(Number(ms) || 0, 1)));
          volta(`__seeleRelogio(${Number(id)})`);
        };
        relogios.set(id, setTimeout(disparar, Math.min(Math.max(Number(ms) || 0, 0), 60000)));
      }
    }
  };
  contexto.__seeleCapacidades = capacidades;
  volta(preludio);
  volta(fs.readFileSync(path.join(root, manifest.client), 'utf8'));
  return {
    entregar: json => {
      try {
        contexto.__entrada = json;
        volta('aoResponder(__entrada)');
      } catch (erro) {
        console.error('o MOD falhou ao receber:', erro.message);
      }
    },
    parar: () => {
      for (const relogio of relogios.values()) clearTimeout(relogio);
      relogios.clear();
    },
  };
}

// ------------------------------------------------------------- a janela

const pagina = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${manifest.id} · laboratório API ${manifest.api}</title>
<link rel="stylesheet" href="/tokens.css">
<link rel="stylesheet" href="/mods-superficies.css">
<link rel="stylesheet" href="/mods-controles.css">
<link rel="stylesheet" href="/lab.css">
</head><body>
<header>
  <h1>${manifest.id} · laboratório API ${manifest.api}</h1>
  <p>Identidades e transporte simulados; renderer, casca do tema e prelúdio reais. Dados temporários.
     O executor de verdade é o QuickJS do produto — este é o <code>vm</code> do Node.</p>
  <a href="/?pessoa=1">Host</a> · <a href="/?pessoa=2">Participante</a> ·
  <a href="/?pessoa=3">Terceira pessoa</a> · <a href="/?servidor=b">Outro servidor</a>
  <label> Canal <select id="canal"><option value="1">geral</option><option value="2">outro</option></select></label>
  <button id="sair" type="button">Sair da sessão</button>
</header>
<main id="tela-sessao">
  <div id="palco-de-paginas" class="palco-de-paginas" hidden></div>
  <div id="palco-de-paineis" class="palco-de-paineis" hidden></div>
  <ul id="lista-roster" class="roster"></ul>
  <ul id="lista-mods-navegacao" class="canais" hidden></ul>
  <!--
    **Dentro da tela, como no produto.** No \`index.html\` do SEELE os dois
    palcos são filhos de \`section#tela-sessao\`, e não do \`<body>\`. Aqui eles
    ficavam no \`<body>\`, e a diferença não era cosmética: \`prenderFoco\`
    percorre os ancestrais do diálogo tornando os **irmãos** inertes, e a
    revisão de 20/09/2026 encontrou um defeito que só aparecia com a hierarquia
    do produto — o palco dentro de uma seção que virava inerte, levando o
    próprio diálogo junto.

    Um laboratório com estrutura diferente do produto não é um laboratório mais
    simples: é um que aprova o que o produto recusa, e o criador de MOD aprende
    nele.
  -->
  <div id="palco-de-camadas" class="palco-de-camadas" hidden></div>
  <div id="avisos-de-mod" class="avisos-de-mod" hidden></div>
</main>
<div id="moderar" class="camada-moderar" role="dialog" aria-modal="true" aria-labelledby="moderar-titulo" hidden>
  <h2 id="moderar-titulo"></h2>
  <p id="moderar-consequencia"></p>
  <button id="moderar-cancelar" type="button">CANCELAR</button>
  <button id="moderar-confirmar" type="button"></button>
</div>
<script src="/mods-estilos.js"></script>
<script src="/mods-regiao.js"></script>
<script src="/mods-superficies.js"></script>
<script src="/mods-contribuicoes.js"></script>
<script src="/casca-do-produto.js"></script>
<script src="/ponte.js"></script>
</body></html>`;

/**
 * A ponte da janela: o mínimo de `base.js` que o renderer e a casca exigem.
 *
 * **O mínimo, e ele é dito.** `base.js` inteiro carrega o Tauri, a sessão e a
 * supervisão; nada disso existe aqui. O que o renderer precisa são quatro
 * funções — `$`, `elemento`, `repovoar` e o dono —, e a casca do tema, mais
 * três: `modsCarregados`, `donoDaRegiao` e `superficiesDoMod`. Elas estão
 * escritas aqui em vez de recortadas de lá, porque lá elas falam com o Tauri.
 */
const ponte = `const id=${JSON.stringify(manifest.id)};
const API=${JSON.stringify(Number(manifest.api))};
const $=n=>document.getElementById(n);
const elemento=(tag,classe,dentro)=>{const no=document.createElement(tag);if(classe)no.className=classe;if(dentro!==undefined)no.textContent=dentro;return no;};
const repovoar=(no,filhos)=>no.replaceChildren(...filhos);
const params=new URLSearchParams(location.search);
const pessoa=params.get('pessoa')||'1', servidor=params.get('servidor')||'a';

// A instância de mentira: o renderer registra recursos nela, e sair os solta.
//
// **A funcao 'registrar' devolve o descartador**, como a do produto. Ela
// devolvia o tamanho do vetor — o retorno de 'push' —, e um numero e truthy:
// quem guardava esse retorno para esquecer o recurso depois guardava um 1, e
// chama-lo era 'esquecer is not a function'. O laboratorio continuava verde
// porque a saida da sessao nao era exercitada ate o fim.
//
// Idempotente e removendo a entrada, como 'InstanciaDeMod.registrar': um
// recurso que sai antes da sessao nao pode ficar retido ate ela acabar, que e
// o R4 da revisao de 20/09/2026.
const recursos=[];
const instancia={
  geracao:1,
  api:API,
  admite:()=>true,
  registrar:(porque,soltar)=>{
    let saiu=false;
    const entrada={porque,soltar};
    recursos.push(entrada);
    // As duas metades, como as do produto: 'esquecer' tira da lista e devolve
    // se havia o que tirar; chamar o descartador faz as duas coisas. Quem se
    // descarta sozinho — uma superficie, por exemplo — chama so 'esquecer',
    // para nao pedir de volta o descarte que ja esta acontecendo.
    const esquecer=()=>{
      if(saiu)return false;
      saiu=true;
      const onde=recursos.indexOf(entrada);
      if(onde>=0)recursos.splice(onde,1);
      return true;
    };
    const soltarRecurso=()=>{
      if(!esquecer())return;
      try{soltar();}catch(e){console.warn(porque,e);}
    };
    soltarRecurso.esquecer=esquecer;
    return soltarRecurso;
  },
};
const mod={id,api:API};

const dono={
  instancia,
  geracao:1,
  api:API,
  podeFalar:()=>true,
  falar:dados=>enviar({tipo:'evento',...dados}),
  // A recusa pelo nome, e a prévia que sai com a superfície dela: os dois da
  // casca recortada, como o dono do produto os liga.
  recusaParaOMod:falha=>recusaParaOMod(mod,falha),
  aoFecharASuperficie:chave=>aoFecharASuperficieDaPrevia(id,chave),
  imagemDaPessoa:async()=>null,
  abrirEndereco:url=>{console.log('abriria fora da janela:',url);},
  escolherArquivo:async pedido=>{
    // O seletor do sistema não existe aqui; o laboratório usa o do navegador,
    // e diz para quê, como o produto pede ao sistema.
    return new Promise(resolve=>{
      const entrada=document.createElement('input');
      entrada.type='file';
      if(pedido&&pedido.extensoes&&pedido.extensoes.length)entrada.accept=pedido.extensoes.map(e=>'.'+e).join(',');
      entrada.onchange=async()=>{
        const arquivo=entrada.files[0];
        if(!arquivo){resolve(null);return;}
        const bytes=new Uint8Array(await arquivo.arrayBuffer());
        const numero=escolhidos.push(bytes);
        resolve({id:numero,tipo:arquivo.type||'application/octet-stream',papel:arquivo.type.startsWith('audio/')?'som':'imagem',bytes:bytes.length});
      };
      entrada.oncancel=()=>resolve(null);
      entrada.click();
    });
  },
  carregarMidia:async caminho=>{
    const r=await fetch('/arquivo?nome='+encodeURIComponent(caminho));
    if(!r.ok)throw new Error('arquivo-do-pacote-nao-servido');
    const {uri,papel,bytes}=await r.json();
    return {uri,papel,bytes};
  },
  carregarMidiaDoServidor:async(canal,pedido,campo)=>{
    const r=await fetch('/pedido',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({servidor,pessoa,canal,corpo:pedido})});
    const resposta=await r.json();
    const texto=resposta[campo];
    if(typeof texto!=='string')throw new Error('sem-bytes');
    const papel=texto.startsWith('data:audio')?'som':'imagem';
    return {uri:texto,papel,bytes:texto.length};
  },
};
const escolhidos=[];

const contribuicoes=new RegistroDeContribuicoes();
const superficies=new SuperficiesDoMod(id,dono,{
  paginas:$('palco-de-paginas'),paineis:$('palco-de-paineis'),
  camadas:$('palco-de-camadas'),avisos:$('avisos-de-mod'),
});

// O que a casca recortada procura no resto de 'base.js'.
const modsCarregados=new Map([[id,instancia]]);
function donoDaRegiao(){return dono;}
function superficiesDoMod(){return superficies;}
/**
 * **A pergunta do produto antes de fechar o que está sujo.** No produto ela é
 * a caixa de 'camada-moderar.js', que carrega a moderação inteira; aqui é uma
 * caixa mínima com a mesma assinatura e os mesmos dois desfechos. Sem ela,
 * 'confirmarDescarte' fechava calado com 'descartou', e o laboratório aprovava
 * uma superfície que, no produto, pergunta «FECHAR SEM GRAVAR?» por nada.
 */
function abrirConfirmacao(titulo,consequencia,rotulo,executar,aoFechar=null){
  const caixa=$('moderar');
  $('moderar-titulo').textContent=titulo;
  $('moderar-consequencia').textContent=consequencia;
  $('moderar-confirmar').textContent=rotulo;
  const fechar=()=>{caixa.hidden=true;$('moderar-confirmar').onclick=null;$('moderar-cancelar').onclick=null;};
  $('moderar-confirmar').onclick=()=>{fechar();executar();};
  $('moderar-cancelar').onclick=()=>{fechar();if(typeof aoFechar==='function')aoFechar();};
  caixa.hidden=false;
  $('moderar-cancelar').focus();
}
/** O 'seele.log' do laboratório: a casca diz aqui o que recusou. */
const registroDoAnfitriao=[];
function registrarNoAnfitriao(onde,frase,nivel,modId){
  registroDoAnfitriao.push({onde,frase,nivel,modId});
  console.warn('[anfitrião]',onde,frase);
}

contribuicoes.aoMudar(()=>{
  const lista=$('lista-mods-navegacao');
  const entradas=contribuicoes.para('servidor.navegacao');
  lista.hidden=entradas.length===0;
  repovoar(lista,entradas.map(e=>{
    const item=elemento('li');
    const b=elemento('button','linha entrada-de-mod');
    b.type='button';
    b.append(elemento('span','linha-rotulo',e.rotulo||e.mod),elemento('span','entrada-de-mod-origem',e.mod));
    b.onclick=()=>dono.falar({nome:'acao',acao:e.acaoPrincipal||'abrir',pessoa:'',canal:''});
    item.append(b);return item;
  }));
});

let fonte=null;
function enviar(m){fetch('/para-o-mod',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({servidor,pessoa,m})});}

function responder(n,ok,carga){enviar({tipo:'resposta',n,ok,...carga});}

/** O retrato de mentira, projetado pela função do produto. */
const snapshot=()=>({server:servidor,me:Number(pessoa),
  channels:[{id:1,name:'geral',open:$('canal').value==='1'},{id:2,name:'outro',open:$('canal').value==='2'}],
  presentes:[{id:1,nickname:'Alex'},{id:2,nickname:'Lia'},{id:3,nickname:'Rafa'}]});

/** O que o núcleo manda à janela sem o MOD perguntar: o tema e o aviso do servidor. */
function doNucleo(m){
  if(m.nucleo==='tema'){aplicarOTemaDoServidor(m.tema);return;}
  if(m.nucleo==='aviso'){entregarOAvisoDoMod(m.aviso);return;}
  console.warn('o núcleo de mentira mandou',m.nucleo);
}

async function atender(m){
  if(m.nucleo){doNucleo(m);return;}
  // **Só um nome da lista fechada chega ao MOD**, como no 'responder' do
  // produto: fora dela, 'falhou', e o que veio vai ao registro.
  const recusar=carga=>responder(m.n,false,recusaDaListaFechada(mod,m.tipo,carga));
  // **A capacidade é conferida antes do efeito**, contra a API do manifesto,
  // com a tabela do produto: o 'snapshot' e a 'regiao' de um MOD da 6 são
  // recusados aqui como lá, pelo nome.
  if(!podePedir(mod,m.tipo)){
    registrarNoAnfitriao('atender-mod',id+': «'+m.tipo+'» não existe na API '+API,'aviso',id);
    recusar({erro:'tipo-desconhecido',tipoPedido:m.tipo});
    return;
  }
  try{
    if(m.tipo==='pedido'){
      const r=await fetch('/pedido',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({servidor,pessoa,canal:m.canal,corpo:m.valor})});
      responder(m.n,true,{valor:await r.json()});
      return;
    }
    if(m.tipo==='retrato'){responder(m.n,true,{valor:projetarORetrato(snapshot(),cascaDoRetrato())});return;}
    // **Na 6, a janela só faz prévia**: o tema publicado é o que a metade de
    // servidor declara. A prévia é da casca recortada, com o selo e os pisos.
    if(m.tipo==='tema'){aplicarAPreviaDoTema(mod,instancia,m);responder(m.n,true,{valor:null});return;}
    if(m.tipo==='pedaco'){
      const bytes=escolhidos[m.arquivo-1];
      if(!bytes)throw new Error('arquivo-nao-esta-de-pe');
      const fatia=bytes.subarray(m.inicio,m.inicio+65535);
      let bruto='';for(const b of fatia)bruto+=String.fromCharCode(b);
      responder(m.n,true,{valor:btoa(bruto)});return;
    }
    if(m.tipo==='soltar-arquivo'){responder(m.n,true,{valor:null});return;}
    if(m.tipo==='superficie-criar'){responder(m.n,true,{valor:superficies.criar(m.descricao)});return;}
    // O que não coube vai pelo nome, 'nos-recusados', com a conta e a amostra
    // do renderer; o que coube fica montado.
    if(m.tipo==='superficie-montar'){
      const s=superficieDoMod(mod,instancia,m.superficie),recusados=s.montar(m.arvore);
      if(recusados>0)throw recusaDosNos(s,recusados,'nó(s) não couberam nos limites da superfície');
      responder(m.n,true,{valor:null});return;
    }
    if(m.tipo==='superficie-atualizar'){
      const s=superficieDoMod(mod,instancia,m.superficie),recusados=s.atualizar(m.chave,m.arvore);
      if(recusados>0)throw recusaDosNos(s,recusados,'nó(s) não couberam nos limites da superfície');
      responder(m.n,true,{valor:null});return;
    }
    if(m.tipo==='formulario-erros'){superficieDoMod(mod,instancia,m.superficie).marcarErros(m.erros);responder(m.n,true,{valor:null});return;}
    if(m.tipo==='superficie-classes'){
      const s=superficieDoMod(mod,instancia,m.superficie),recusados=s.declararClasses(m.classes);
      if(recusados>0)throw recusaDosNos(s,recusados,'propriedade(s) de estilo não foram reconhecidas');
      responder(m.n,true,{valor:null});return;
    }
    if(m.tipo==='superficie-mostrar'){superficieDoMod(mod,instancia,m.superficie).mostrar();superficies.arrumarPalcos();responder(m.n,true,{valor:null});return;}
    if(m.tipo==='superficie-ocultar'){superficieDoMod(mod,instancia,m.superficie).ocultar();superficies.arrumarPalcos();responder(m.n,true,{valor:null});return;}
    if(m.tipo==='superficie-suja'){superficieDoMod(mod,instancia,m.superficie).marcarSuja(m.suja);responder(m.n,true,{valor:null});return;}
    if(m.tipo==='superficie-titulo'){
      const s=superficieDoMod(mod,instancia,m.superficie);s.titulo=String(m.titulo??'').slice(0,120);
      if(s.tituloNo)s.tituloNo.textContent=s.titulo;
      responder(m.n,true,{valor:null});return;
    }
    if(m.tipo==='superficie-fechar'){superficies.fechar(m.superficie,m.motivo);responder(m.n,true,{valor:null});return;}
    if(m.tipo==='superficie-descartar'){superficies.descartar(m.superficie);responder(m.n,true,{valor:null});return;}
    if(m.tipo==='contribuir'){responder(m.n,true,{valor:contribuicoes.registrar(mod,instancia,m.pedido)});return;}
    // Com o dono, como o roteador do produto: sem ele, o laboratório aceitaria
    // uma revogação que o SEELE recusa, e ensinaria o contrário do contrato.
    if(m.tipo==='revogar-contribuicao'){responder(m.n,true,{valor:contribuicoes.revogar(m.handle,{id,instancia})});return;}
    if(m.tipo==='atualizar-contribuicao'){responder(m.n,true,{valor:contribuicoes.atualizar(m.handle,{id,instancia},m.conteudo)});return;}
    recusar({erro:'tipo-desconhecido',tipoPedido:m.tipo});
  }catch(erro){
    // **O registro leva o motivo**, como no produto: uma parte de estilo
    // errada monta o resto e recusa o 'montar' com 'falhou', e na tela nada
    // some. Sem esta linha, o laboratório aprovava o que só o registro diz.
    //
    // E a amostra do que foi recusado, quando há: o 'seele.log' do produto
    // fica com a frase, e o laboratório, que é onde o autor procura o que
    // errou, diz também qual parte foi.
    const amostra=erro?.camposDaRecusa?.amostra;
    const qual=Array.isArray(amostra)&&amostra.length
      ?' — '+amostra.map(a=>Object.entries(a).map(([k,v])=>k+': '+v).join(', ')).join(' · ')
      :'';
    registrarNoAnfitriao('atender-mod',id+': «'+m.tipo+'» falhou — '+motivoDaFalha(erro)+qual,'aviso',id);
    // A recusa pelo nome, com os campos dela, como o MOD da 6 a recebe.
    recusar(recusaParaOMod(mod,erro)??{erro:String(erro?.message??erro)});
  }
}

/** A lista de pessoas: o lugar da conversa que a página tem, e nada mais. */
repovoar($('lista-roster'),[{id:1,nickname:'Alex'},{id:2,nickname:'Lia'},{id:3,nickname:'Rafa'}]
  .map(p=>elemento('li','pessoa',p.nickname)));

$('sair').onclick=async()=>{
  // A fita fecha primeiro: nada do núcleo pinta depois de sair.
  fonte?.close();
  await fetch('/sair',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({servidor,pessoa})});
  superficies.soltarTudo();contribuicoes.limpar();
  for(const r of recursos.splice(0)){try{r.soltar();}catch(e){console.warn(r.porque,e);}}
  // **O tema sai com a sessão, agora**: a parte do tema de
  // 'encerrarOAmbienteDosMods', com as variáveis da casca recortada.
  temaDosMods.clear();
  temaDoServidorEmVigor=null;
  previasDoTema.clear();
  escreverOTemaDaSessao();
  $('tela-sessao').hidden=true;
};

// A fita do executor e do núcleo chega por eventos do servidor: um MOD fala
// sem que a janela tenha perguntado, e é isso que 'text/event-stream' modela.
fonte=new EventSource('/do-mod?servidor='+servidor+'&pessoa='+pessoa);
fonte.onmessage=e=>{void atender(JSON.parse(e.data));};
`;

const css = `body{margin:0;padding:24px;background:var(--seele-negro-absoluto);color:var(--seele-osso);
font:13px/1.6 var(--seele-mono,monospace)}
a{color:var(--seele-laranja-nerv)} header{margin-bottom:24px}
#tela-sessao{display:flex;flex-direction:column;gap:16px;border:1px solid var(--seele-linha);padding:16px;min-height:60vh;
background:var(--seele-negro-absoluto);color:var(--seele-osso)}
.roster{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;max-width:320px}
.pessoa{border-left:3px solid var(--seele-linha);padding-left:8px}
.palco-de-paginas,.palco-de-paineis{min-height:0}
.canais{list-style:none;margin:0;padding:0}
.linha{display:flex;gap:8px;width:100%;background:none;border:none;color:inherit;font:inherit;
padding:6px 8px;cursor:pointer;text-align:left;border-left:3px solid transparent}
.linha:hover{border-left-color:var(--seele-laranja-nerv)}
.selo-da-previa{position:fixed;top:8px;right:8px;padding:4px 8px;border:1px solid currentColor;font-size:11px}
.camada-moderar{position:fixed;inset:auto 16px 16px auto;z-index:1000;padding:16px;max-width:360px;
background:var(--seele-negro-painel);color:var(--seele-osso);border:1px solid var(--seele-linha-forte)}`;

// ------------------------------------------------------------ o servidor

/** Quem está ouvindo a fita de qual janela. */
const ouvintes = new Map();

/** Uma mensagem do núcleo a todas as janelas de um servidor. */
function paraAsJanelas(chaveDoMundo, mensagem) {
  const texto = JSON.stringify(mensagem);
  for (const [chave, res] of ouvintes) {
    if (chave.startsWith(chaveDoMundo + ':')) res.write(`data: ${texto}\n\n`);
  }
}

/** A janela foi embora: o executor dela também. */
function encerrar(chave) {
  sessoes.get(chave)?.parar();
  sessoes.delete(chave);
  ouvintes.delete(chave);
}

const servidorHttp = http.createServer(async (req, res) => {
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; media-src 'self' data:");
  try {
    const url = new URL(req.url, 'http://localhost');
    const corpo = async () => {
      let bruto = '';
      for await (const pedaco of req) {
        bruto += pedaco;
        if (Buffer.byteLength(bruto) > 262144) throw new Error('pedido-grande-demais');
      }
      return JSON.parse(bruto);
    };

    if (url.pathname === '/do-mod') {
      const doMundo = url.searchParams.get('servidor') || 'a';
      const chave = `${doMundo}:${url.searchParams.get('pessoa')}`;
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      // **Uma janela nova é um executor novo**: recarregar não herda o MOD da
      // janela de antes, e a fita velha não recebe mais nada.
      encerrar(chave);
      ouvintes.set(chave, res);
      // O tema do servidor vem antes do MOD, como o retrato da sessão o traz
      // antes de os MODs subirem.
      res.write(`data: ${JSON.stringify({ nucleo: 'tema', tema: temaNoFio(mundoDe(doMundo).tema) })}\n\n`);
      const sessao = novaSessao(chave, texto => res.write(`data: ${texto}\n\n`));
      sessoes.set(chave, sessao);
      req.on('close', () => { if (ouvintes.get(chave) === res) encerrar(chave); });
      return;
    }

    if (url.pathname === '/para-o-mod' && req.method === 'POST') {
      const q = await corpo();
      const chave = `${q.servidor}:${q.pessoa}`;
      sessoes.get(chave)?.entregar(JSON.stringify(q.m));
      res.end('{}');
      return;
    }

    if (url.pathname === '/sair' && req.method === 'POST') {
      const q = await corpo();
      encerrar(`${q.servidor}:${q.pessoa}`);
      res.end('{}');
      return;
    }

    if (url.pathname === '/pedido' && req.method === 'POST') {
      const q = await corpo();
      if (!['1', '2', '3'].includes(String(q.pessoa))) throw new Error('identidade');
      // O canal `0` é o escopo de servidor: o `aoPedir` o recebe como `null`.
      const canal = Number(q.canal ?? 1);
      const resposta = aoPedir(q.servidor || 'a', {
        person: String(q.pessoa),
        channel: canal === 0 ? null : canal,
        admin: String(q.pessoa) === '1',
        write: true,
      }, q.corpo);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(resposta));
      return;
    }

    if (url.pathname === '/arquivo') {
      // **Só o que o manifesto declara.** É a mesma regra do produto: um
      // arquivo na pasta que ninguém nomeou não é servido.
      const nome = url.searchParams.get('nome') ?? '';
      if (!(manifest.arquivos ?? []).includes(nome)) {
        res.statusCode = 404;
        res.end(JSON.stringify({ ok: false, error: 'arquivo-nao-declarado' }));
        return;
      }
      const bytes = fs.readFileSync(path.join(root, nome));
      const tipo = nome.endsWith('.wav') ? 'audio/wav'
        : nome.endsWith('.png') ? 'image/png'
          : nome.endsWith('.jpg') || nome.endsWith('.jpeg') ? 'image/jpeg'
            : nome.endsWith('.webp') ? 'image/webp' : 'application/octet-stream';
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        uri: `data:${tipo};base64,${bytes.toString('base64')}`,
        papel: tipo.startsWith('audio/') ? 'som' : 'imagem',
        bytes: bytes.length,
      }));
      return;
    }

    const rotas = {
      '/': ['text/html; charset=utf-8', pagina],
      '/lab.css': ['text/css', css],
      '/ponte.js': ['text/javascript', ponte],
      '/casca-do-produto.js': ['text/javascript', casca],
      '/tokens.css': ['text/css', doProduto('tokens.css')],
      '/mods-superficies.css': ['text/css', doProduto('mods-superficies.css')],
      '/mods-controles.css': ['text/css', doProduto('mods-controles.css')],
      '/mods-estilos.js': ['text/javascript', doProduto('mods-estilos.js')],
      '/mods-regiao.js': ['text/javascript', doProduto('mods-regiao.js')],
      '/mods-superficies.js': ['text/javascript', doProduto('mods-superficies.js')],
      '/mods-contribuicoes.js': ['text/javascript', doProduto('mods-contribuicoes.js')],
    };
    if (!rotas[url.pathname]) { res.statusCode = 404; res.end(); return; }
    const [tipo, texto] = rotas[url.pathname];
    res.setHeader('Content-Type', tipo);
    res.end(texto);
  } catch (erro) {
    res.statusCode = 400;
    res.end(JSON.stringify({ ok: false, error: erro.message }));
  }
});

servidorHttp.listen(Number(process.env.MOD_PORT || 4318), '127.0.0.1', () => {
  console.log('Preview: http://127.0.0.1:' + servidorHttp.address().port);
});
