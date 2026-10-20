// O cliente do ESTILO na API 6, contra um mundo de mentira escrito pelo contrato.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { metadeDeServidor, recusaDasChavesDoTema } = require('./mundo-da-api6.cjs');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'mod.json')));
const source = fs.readFileSync(path.join(root, manifest.client), 'utf8');
const serverSource = fs.readFileSync(path.join(root, manifest.server), 'utf8');
const contrato = JSON.parse(fs.readFileSync(path.join(__dirname, 'contrato/v6.json'), 'utf8'));

// ---------------------------------------------------------------- o produto

/** As capacidades da API 6 (`compatibilidade.capacidades-por-versao`). */
const CAPACIDADES = contrato.compatibilidade['capacidades-por-versao']['6'];

/**
 * Os pares que a casca confere, com o piso de cada um (`tema.pares`).
 *
 * O `acento/acentoFraco` fica de fora: o contrato diz que ele é «garantido pela
 * derivação e não recusado», porque o `acentoFraco` é do produto.
 */
const PARES = Object.entries(contrato.tema.pares)
  .filter(([, piso]) => !/garantido/.test(piso))
  .map(([par, piso]) => {
    const [frente, fundo] = par.split('/');
    return { frente, fundo, piso: parseFloat(piso.replace(',', '.')) };
  });

/** WCAG 2.1, com a conta do produto (`contrasteEntre`). */
function contraste(a, b) {
  const luz = cor => {
    const k = [1, 3, 5].map(i => {
      const c = parseInt(cor.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * k[0] + 0.7152 * k[1] + 0.0722 * k[2];
  };
  const [claro, escuro] = [luz(a), luz(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (escuro + 0.05);
}

/** Os pares abaixo do piso, na forma do evento `tema` e da recusa. */
function paresAbaixo(valores) {
  return PARES
    .filter(({ frente, fundo }) => valores[frente] && valores[fundo])
    .map(({ frente, fundo, piso }) => ({ frente, fundo, razao: Number(contraste(valores[frente], valores[fundo]).toFixed(2)), piso }))
    .filter(({ razao, piso }) => razao < piso);
}

/** Uma recusa como o prelúdio a entrega: `message` e `erro` são o nome. */
function recusa(nome, extras = {}) {
  return Object.assign(new Error(nome), { erro: nome }, extras);
}

const TETO_DA_MENSAGEM = 12 * 1024;
/** A conta do prelúdio: `JSON.stringify({ tipo, n, ...carga })` em UTF-8. */
function cabeNaPonte(tipo, carga) {
  const bytes = Buffer.byteLength(JSON.stringify({ tipo, n: 999999, ...carga }), 'utf8');
  assert.ok(bytes <= TETO_DA_MENSAGEM,
    `«${tipo}» tem ${bytes} bytes e o teto por mensagem do produto é ${TETO_DA_MENSAGEM}`);
  return bytes;
}

const CHAVES_DE_TODA_FORMA = ['estilo', 'classe', 'nomeAcessivel', 'chave'];
/** As regras declaradas de um campo de formulário (`superficies.dialogo.formularios` no contrato). */
const REGRAS = ['erro', 'inicial', 'obrigatorio', 'minimo', 'maximo', 'tamanhoMaximo', 'inteiro'];
const CHAVES_DA_FORMA = {
  titulo: ['dentro'], texto: ['dentro'], linha: ['dentro'], lista: ['dentro'], item: ['dentro'],
  campo: ['chave', 'rotulo', 'valor', ...REGRAS],
  escolha: ['chave', 'rotulo', 'valor', 'opcoes', ...REGRAS],
  botao: ['chave', 'dentro', 'desligado', 'variante', 'emProgresso', 'porqueIndisponivel', 'confirmar'],
  caixa: ['dentro'], pilha: ['dentro'], grade: ['dentro'], rolagem: ['dentro'],
  separador: [], espaco: [],
  formulario: ['chave', 'dentro', 'erro'],
  acoes: ['dentro', 'fixas'],
  abas: ['chave', 'valor', 'dentro'],
  aba: ['chave', 'rotulo', 'dentro'],
  textoLongo: ['chave', 'rotulo', 'valor', 'linhas', 'sugestao', ...REGRAS],
  numero: ['chave', 'rotulo', 'valor', 'passo', ...REGRAS],
  // A marca e o interruptor são campos como os outros: o erro declarado e o
  // inicial, contra o qual o produto deriva o sujo.
  marca: ['chave', 'rotulo', 'valor', 'desligado', 'erro', 'inicial'],
  interruptor: ['chave', 'rotulo', 'valor', 'desligado', 'erro', 'inicial'],
  cor: ['chave', 'rotulo', 'valor', ...REGRAS],
  distintivo: ['dentro'],
};
/**
 * As formas que são campo: as que o `formulario.erros` alcança e as que sujam
 * a superfície («em toda forma de entrada», `formularios.erro` no contrato).
 */
const FORMAS_DE_CAMPO = new Set(['campo', 'escolha', 'textoLongo', 'numero', 'cor', 'deslizante', 'marca', 'interruptor']);

/**
 * O que o produto lê da descrição de uma superfície (`SuperficieDeMod`, na
 * 0.16). Uma opção fora daqui não faz nada, e calada: o `fecharComAlteracoes`
 * saiu quando a superfície suja passou a perguntar sempre antes de fechar.
 */
const DESCRICAO_DA_SUPERFICIE = new Set(['id', 'tipo', 'imersiva', 'modal', 'titulo', 'descricao', 'contexto',
  'lado', 'focoInicial', 'visivel', 'tamanho']);

/** O valor de um campo como o produto o compara: ligado ou não numa marca. */
const comoTexto = (no, valor) => (no.forma === 'marca' || no.forma === 'interruptor'
  ? String(valor === true)
  : valor === null || valor === undefined ? '' : String(valor));
/** As propriedades de estilo que o `mods-estilos.js` da 6 reconhece. */
const PROPRIEDADES_DE_ESTILO = new Set([
  'cor', 'fundo', 'gradiente', 'opacidade', 'raio', 'borda', 'sombra',
  'familia', 'peso', 'corpo', 'entrelinha', 'espacamento', 'alinhamento', 'transformar',
  'direcao', 'alinhar', 'distribuir', 'quebra', 'crescer', 'encolher', 'base',
  'intervalo', 'preenchimento', 'margem',
  'largura', 'altura', 'larguraMinima', 'larguraMaxima', 'alturaMinima', 'alturaMaxima',
  'colunas', 'posicao', 'recortar', 'proporcao', 'linhasMaximas',
  'girar', 'escalar', 'mover', 'transicao', 'animacao',
]);

function checkEstilo(estilo, onde) {
  if (estilo === null || estilo === undefined) return;
  assert.equal(typeof estilo, 'object', `o estilo de «${onde}» não é um objeto`);
  for (const chave of Object.keys(estilo)) {
    assert.ok(PROPRIEDADES_DE_ESTILO.has(chave), `«${chave}» não é uma propriedade de estilo do SEELE (em «${onde}»)`);
  }
}

function checkTree(tree, depth = 0) {
  assert.ok(depth <= 16, 'o renderer do produto cortaria este conteúdo');
  if (tree === null || tree === undefined || typeof tree === 'string') return;
  if (Array.isArray(tree)) { tree.forEach(n => checkTree(n, depth)); return; }
  const aceitas = CHAVES_DA_FORMA[tree.forma];
  assert.ok(aceitas, 'forma que a API do SEELE não conhece: ' + tree.forma);
  for (const chave of Object.keys(tree)) {
    if (chave === 'forma') continue;
    if (chave === 'estilo') { checkEstilo(tree.estilo, tree.forma); continue; }
    if (CHAVES_DE_TODA_FORMA.includes(chave)) continue;
    assert.ok(aceitas.includes(chave), `«${chave}» não existe em «${tree.forma}»`);
  }
  if ('dentro' in tree) checkTree(tree.dentro, depth + 1);
}

/** Os nós com chave de uma árvore, pela chave. */
function porChave(arvore) {
  const achados = new Map();
  const andar = no => {
    if (!no || typeof no !== 'object') return;
    if (Array.isArray(no)) { no.forEach(andar); return; }
    if (no.chave) achados.set(no.chave, no);
    andar(no.dentro);
  };
  andar(arvore);
  return achados;
}

// ------------------------------------------------------------ o servidor

/**
 * O servidor deste MOD, com o `mundo` da API 6, e as janelas abertas nele.
 *
 * O que a metade de servidor declara com `mundo.tema` chega às janelas como o
 * `TemaMudou`; o que ela avisa com `mundo.avisar`, como o evento `servidor`. As
 * duas coisas, como no produto, depois de o pedido terminar.
 */
function world(opcoes = {}) {
  const metade = metadeDeServidor({ codigo: serverSource, manifesto: manifest, ...opcoes });
  const janelas = [];
  let temasEntregues = 0;
  let avisosEntregues = 0;
  const entregar = () => {
    const temas = metade.temas.slice(temasEntregues);
    const avisos = metade.avisos.slice(avisosEntregues);
    temasEntregues = metade.temas.length;
    avisosEntregues = metade.avisos.length;
    queueMicrotask(() => {
      for (const tema of temas) for (const janela of janelas) janela.receberTema(tema);
      for (const aviso of avisos) for (const janela of janelas) janela.receberAviso(aviso);
    });
  };
  const call = (body, person = '1', channel = 1) => {
    const resposta = metade.call(body, { person, channel, admin: person === '1', write: true });
    entregar();
    return resposta;
  };
  /** O tema que o servidor guarda e manda a quem entra, ou `null`. */
  const temaGuardado = () => (metade.temas.length ? metade.temas.at(-1) : null);
  return { data: metade.data, call, temas: metade.temas, avisos: metade.avisos, janelas, temaGuardado };
}

// --------------------------------------------------------------- a janela

/**
 * A janela de uma pessoa com o ESTILO, na API 6.
 *
 * - `pessoa`: quem usa; `'1'` administra, como no `world()`.
 * - `request(id, canal, corpo)`: troca o caminho até o servidor (para segurar
 *   uma resposta, por exemplo).
 * - `nativo`: quem usa escolheu «o SEELE desenha» para a aparência.
 * - `recusarPrevia`: os pares que a casca recusa em toda prévia, além dos do
 *   contrato (a conferência das cores de estado, que o mundo não faz).
 * - `recusarTema`: idem, para o tema do servidor.
 * - `registrar(pedido)`: chamada antes de registrar uma contribuição.
 */
function client(w, options = {}) {
  const pessoa = options.pessoa ?? '1';
  const requests = [], timers = [], errors = [], avisos = [], chamadasDeTema = [], contribuicoes = [];
  const superficies = new Map();
  const errosMarcados = [];
  let listener = null;
  let previa = null;
  let temaDoServidor = w.temaGuardado();
  let desfechoDoServidor = null;

  const emitir = evento => { if (listener) listener(structuredClone(evento)); };

  /** O que a casca faz com o tema do servidor, e o que ela diz ao MOD. */
  const desfechoDe = valores => {
    if (options.nativo) return { estado: 'nativo', previa: false };
    const pares = [...paresAbaixo(valores), ...(options.recusarTema ?? [])];
    return pares.length ? { estado: 'recusado', pares, previa: false } : { estado: 'aplicado', previa: false };
  };

  const pontos = contrato.contribuicoes.pontos;
  const sandbox = vm.createContext({
    console: { log: () => {}, warn: e => errors.push(e), error: e => errors.push(e) },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: () => {},
    SeeleMods: {
      request: async (id, canal, body) => {
        requests.push({ id, canal, body: structuredClone(body) });
        if (options.request) return options.request(id, canal, body);
        return w.call(body, pessoa, canal);
      },
    },
    SeeleUI: {
      tema: async (valores, opcoes) => {
        chamadasDeTema.push(structuredClone({ valores, opcoes: opcoes ?? null }));
        if (!opcoes || opcoes.previa !== true) throw recusa('sem-previa');
        if (valores === null) { previa = null; return null; }
        const errada = recusaDasChavesDoTema(valores);
        if (errada) throw recusa(errada.erro, errada);
        if (!superficies.has(String(opcoes.superficie))) {
          throw recusa('superficie-desconhecida', { superficie: opcoes.superficie });
        }
        const pares = [...paresAbaixo(valores), ...(options.recusarPrevia ?? [])];
        if (pares.length) {
          queueMicrotask(() => emitir({ nome: 'tema', estado: 'recusado', pares, previa: true }));
          throw recusa('contraste', { pares });
        }
        previa = { valores: structuredClone(valores), superficie: String(opcoes.superficie) };
        queueMicrotask(() => emitir({ nome: 'tema', estado: 'aplicado', previa: true }));
        return null;
      },
      retrato: async () => ({
        eu: Number(pessoa), servidor: { nome: 'Servidor' },
        pessoas: [{ id: 1, apelido: 'Alex', falando: false, mudo: false }],
        salas: [], canais: options.semCanais ? [] : [{ id: 1, nome: 'geral', aberto: true }],
        onde: 'computador', regioes: [],
      }),
      capacidades: () => [...CAPACIDADES],
      aoEvento: fn => { listener = fn; },
      superficies: {
        criar: async descricao => {
          const chave = String(descricao?.id ?? '');
          assert.ok(contrato.superficies.tipos.includes(descricao?.tipo ?? 'dialogo'), 'tipo de superfície fora da API 6');
          if (!superficies.has(chave)) {
            superficies.set(chave, {
              descricao: structuredClone(descricao), arvores: [], bytes: [], classes: null, visivel: true, suja: false,
              // O inicial de cada campo, como o renderer guarda: o declarado,
              // ou o valor da primeira montagem; um campo que sai o leva junto.
              iniciais: new Map(),
            });
          }
          const tela = superficies.get(chave);
          tela.visivel = true;
          return {
            id: chave,
            montar: async arvore => {
              checkTree(arvore);
              tela.bytes.push(cabeNaPonte('superficie-montar', { superficie: chave, arvore }));
              tela.arvores.push(structuredClone(arvore));
              const campos = [...porChave(arvore).values()].filter(n => FORMAS_DE_CAMPO.has(n.forma));
              const presentes = new Set(campos.map(n => n.chave));
              for (const k of [...tela.iniciais.keys()]) if (!presentes.has(k)) tela.iniciais.delete(k);
              for (const n of campos) {
                if (Object.hasOwn(n, 'inicial')) tela.iniciais.set(n.chave, comoTexto(n, n.inicial));
                else if (!tela.iniciais.has(n.chave)) tela.iniciais.set(n.chave, comoTexto(n, n.valor));
              }
            },
            atualizar: async (no, arvore) => {
              checkTree(arvore);
              cabeNaPonte('superficie-atualizar', { superficie: chave, chave: no, arvore });
              if (!porChave(tela.arvores.at(-1)).has(no)) throw recusa('chave-desconhecida', { chave: no });
            },
            formulario: {
              erros: async mapa => {
                const campos = [...porChave(tela.arvores.at(-1)).values()].filter(n => FORMAS_DE_CAMPO.has(n.forma)).map(n => n.chave);
                const falta = Object.keys(mapa ?? {}).find(k => !campos.includes(k));
                if (falta !== undefined) throw recusa('chave-desconhecida', { chave: falta });
                errosMarcados.push({ superficie: chave, erros: structuredClone(mapa ?? {}) });
              },
            },
            classes: async mapa => {
              for (const declarado of Object.values(mapa ?? {})) {
                for (const [estado, estilo] of Object.entries(declarado ?? {})) {
                  if (estado === 'consultas') (estilo ?? []).forEach(c => checkEstilo(c?.estilo, 'consulta'));
                  else checkEstilo(estilo, 'classe');
                }
              }
              tela.classes = structuredClone(mapa ?? {});
            },
            mostrar: async () => { tela.visivel = true; },
            ocultar: async () => { tela.visivel = false; },
            suja: async valor => { tela.suja = valor !== false; },
            titulo: async () => {},
            fechar: async () => { tela.visivel = false; if (previa?.superficie === chave) previa = null; },
            descartar: async () => { superficies.delete(chave); if (previa?.superficie === chave) previa = null; },
          };
        },
        avisar: async (mensagem, tom) => { avisos.push({ mensagem: String(mensagem ?? ''), tom: tom ?? 'normal' }); },
      },
      contribuicoes: {
        registrar: async pedido => {
          if (options.registrar) await options.registrar(pedido);
          const ponto = String(pedido?.ponto ?? '');
          if (!Object.hasOwn(pontos, ponto)) throw recusa('ponto-desconhecido', { ponto });
          if (!pontos[ponto].includes(String(pedido?.modo ?? 'adicionar'))) throw recusa('modo-recusado', { ponto });
          const handle = 'c' + (contribuicoes.length + 1);
          contribuicoes.push({ handle, ...structuredClone(pedido) });
          return { handle };
        },
        revogar: async handle => {
          const onde = contribuicoes.findIndex(c => c.handle === handle);
          if (onde < 0) return false;
          contribuicoes.splice(onde, 1);
          return true;
        },
        atualizar: async () => true,
      },
    },
  });
  vm.runInContext(source, sandbox, { timeout: 1000 });

  const janela = {
    requests, timers, errors, avisos, chamadasDeTema, contribuicoes, superficies, errosMarcados,
    receberTema: valores => {
      temaDoServidor = valores;
      if (valores === null) { desfechoDoServidor = null; return; }
      desfechoDoServidor = desfechoDe(valores);
      emitir({ nome: 'tema', ...desfechoDoServidor });
    },
    receberAviso: aviso => emitir({ nome: 'servidor', ...aviso }),
    /** O tema que a sessão desta janela mostra agora. */
    temaEmVigor: () => previa?.valores ?? (desfechoDoServidor?.estado === 'aplicado' ? temaDoServidor : null),
    previa: () => previa,
    /**
     * A superfície está suja para o produto? O que o MOD disse, ou um campo
     * que difere do inicial. Suja, ela **sempre** pergunta antes de fechar.
     */
    sujaNoProduto: chave => {
      const tela = superficies.get(String(chave));
      if (!tela) return false;
      if (tela.suja) return true;
      const campos = [...porChave(tela.arvores.at(-1)).values()].filter(n => FORMAS_DE_CAMPO.has(n.forma));
      return campos.some(n => comoTexto(n, n.valor) !== tela.iniciais.get(n.chave));
    },
    superficie: chave => superficies.get(String(chave))?.arvores.at(-1) ?? null,
    controlesDe: chave => porChave(superficies.get(String(chave))?.arvores.at(-1)),
    entradas: () => contribuicoes.filter(c => c.ponto === 'servidor.navegacao'),
    fire: evento => { assert.ok(listener, 'o MOD não registrou ouvinte de evento'); listener(evento); },
    agir: acao => { assert.ok(listener, 'o MOD não registrou ouvinte de evento'); listener({ nome: 'acao', acao, pessoa: '', canal: '' }); },
  };
  w.janelas.push(janela);
  // O produto conta ao MOD o desfecho do tema em vigor quando ele carrega.
  if (temaDoServidor) queueMicrotask(() => janela.receberTema(temaDoServidor));
  return janela;
}

const settle = () => new Promise(resolve => setImmediate(resolve));
/** Várias voltas: abrir uma superfície são várias idas à ponte. */
const assentar = async (voltas = 12) => { for (let i = 0; i < voltas; i += 1) await settle(); };

// ---------------------------------------------------------------- os casos

const ID = 'estilo-aparencia';
const abrir = async c => { c.agir('abrir-aparencia'); await assentar(); };
const naPagina = c => c.controlesDe(ID);
const oQueAPaginaDiz = c => JSON.stringify(c.superficie(ID));
const naAba = async (c, aba) => { c.fire({ nome: 'aba', chave: 'aba', valor: aba }); await assentar(); };
const publicar = (w, theme, revision = 0) => assert.equal(w.call({ op: 'save', revision, theme }).ok, true);
const padrao = () => world().call({ op: 'view' }).theme;
const claro = { background: '#f4f1ea', panel: '#ffffff', text: '#1c1916', muted: '#5e564c', accent: '#1d4ed8', border: '#d8d0c4', radius: 4, density: 'comfortable', font: 'sans', glow: false };

test('o cliente roda sem DOM, pede o estado no escopo de servidor e não agenda temporizador', async () => {
  const c = client(world()); await assentar();
  assert.equal(manifest.api, 6);
  assert.equal(c.errors.length, 0, JSON.stringify(c.errors));
  assert.ok(c.requests.length, 'o MOD não pediu o estado');
  for (const r of c.requests) {
    assert.equal(r.id, manifest.id);
    assert.equal(r.canal, 0, 'o tema é do servidor: o pedido vai no escopo de servidor (canal 0)');
    assert.equal(r.body.op, 'view');
  }
  assert.deepEqual(c.timers, [], 'a consulta em laço voltou: o aviso do servidor a substitui');
});

test('ESTILO: a entrada «Aparência do servidor» é registrada uma vez, e fora da barra de quem não edita', async () => {
  const w = world();
  const admin = client(w); await assentar();
  assert.equal(admin.entradas().length, 1);
  assert.equal(admin.entradas()[0].rotulo, 'Aparência do servidor');
  assert.equal(admin.entradas()[0].listarNaBarra, true);
  assert.ok(!admin.contribuicoes.some(c => c.ponto === 'servidor.aparencia'),
    'na 6, servidor.aparencia é a escolha de quem vê, e não um ponto que o MOD registra');
  const membro = client(w, { pessoa: '2' }); await assentar();
  assert.equal(membro.entradas()[0].listarNaBarra, false);
});

test('ESTILO: num servidor sem canal de texto, o ESTILO funciona', async () => {
  const c = client(world(), { semCanais: true }); await assentar();
  assert.equal(c.entradas().length, 1);
  await abrir(c);
  assert.ok(naPagina(c).has('accent'), 'o editor não abriu num servidor sem canal');
});

test('ESTILO: o tema publicado é aplicado pelo produto, e não pelo cliente', async () => {
  const w = world(); publicar(w, padrao());
  const c = client(w, { pessoa: '2' }); await assentar();
  assert.equal(c.entradas().length, 1, 'o MOD não subiu');
  assert.deepEqual(c.chamadasDeTema, [], 'o cliente pediu tema sem que ninguém editasse');
  assert.equal(c.temaEmVigor()?.acento, '#f2521f', 'o produto não aplicou o tema guardado');
});

test('ESTILO: editar mostra a prévia pelo produto, presa à superfície, e não escreve no servidor', async () => {
  const w = world(); const c = client(w); await assentar(); await abrir(c);
  c.fire({ nome: 'cor', chave: 'accent', valor: '#6bffb6' }); await assentar();
  const { valores, opcoes } = c.chamadasDeTema.at(-1);
  assert.deepEqual(opcoes, { previa: true, superficie: ID });
  assert.equal(valores.acento, '#6bffb6');
  assert.equal(c.temaEmVigor()?.acento, '#6bffb6');
  assert.deepEqual(w.temas, [], 'a prévia escreveu no servidor');
});

// A prévia local é separada de publicar, e desligá-la é reversível.
test('ESTILO: desligar a prévia a tira e guarda o rascunho; religar a devolve', async () => {
  const w = world(); const c = client(w); await assentar(); await abrir(c);
  c.fire({ nome: 'cor', chave: 'accent', valor: '#6bffb6' }); await assentar();
  c.fire({ nome: 'marca', chave: 'previa', valor: false }); await assentar();
  assert.equal(c.previa(), null, 'desligar a prévia não a tirou');
  assert.equal(naPagina(c).get('accent').valor, '#6bffb6', 'desligar a prévia jogou fora o rascunho');
  c.fire({ nome: 'marca', chave: 'previa', valor: true }); await assentar();
  assert.equal(c.temaEmVigor()?.acento, '#6bffb6', 'religar a prévia não a devolveu');
});

// Ver só na minha sessão não é alteração: o produto deriva o sujo de todo
// campo contra o inicial, o interruptor também, e uma superfície suja sempre
// pergunta antes de fechar.
test('ESTILO: desligar a prévia não suja o diálogo, e um rascunho suja', async () => {
  const w = world(); const c = client(w); await assentar(); await abrir(c);
  assert.equal(c.sujaNoProduto(ID), false, 'o diálogo abriu sujo');
  c.fire({ nome: 'marca', chave: 'previa', valor: false }); await assentar();
  assert.equal(c.sujaNoProduto(ID), false,
    'desligar a prévia sujou o diálogo, e fechar perguntaria «fechar sem gravar?» por nada a publicar');
  c.fire({ nome: 'cor', chave: 'accent', valor: '#6bffb6' }); await assentar();
  assert.equal(c.sujaNoProduto(ID), true, 'um destaque não publicado não sujou o diálogo');
});

test('ESTILO: o diálogo só declara opções que o produto lê', async () => {
  const w = world(); const c = client(w); await assentar(); await abrir(c);
  const descricao = c.superficies.get(ID)?.descricao;
  assert.ok(descricao, 'o diálogo não abriu');
  assert.deepEqual(Object.keys(descricao).filter(k => !DESCRICAO_DA_SUPERFICIE.has(k)), [],
    'o diálogo declara opções que o produto não lê');
});

// O produto diz «será perdido», e o MOD perde.
test('ESTILO: DESCARTAR E FECHAR descarta o rascunho e a prévia', async () => {
  const w = world(); publicar(w, padrao());
  const c = client(w); await assentar(); await abrir(c);
  c.fire({ nome: 'cor', chave: 'accent', valor: '#6bffb6' }); await assentar();
  c.fire({ nome: 'fechar', superficie: ID, porque: 'sair', descartou: true }); await assentar();
  assert.equal(c.temaEmVigor()?.acento, '#f2521f', 'a prévia do que foi descartado continuou na sessão');
  await abrir(c);
  assert.equal(naPagina(c).get('accent').valor, '#f2521f', 'reabrir trouxe de volta o que foi descartado');
});

test('ESTILO: publicar grava, declara o tema ao servidor e tira a prévia', async () => {
  const w = world(); publicar(w, padrao());
  const c = client(w); await assentar(); await abrir(c);
  c.fire({ nome: 'cor', chave: 'accent', valor: '#6bffb6' }); await assentar();
  c.fire({ nome: 'botao', chave: 'gravar' }); await assentar(20);
  assert.equal(w.temas.at(-1)?.acento, '#6bffb6', 'o tema não foi declarado ao servidor');
  assert.equal(c.previa(), null, 'a prévia ficou por cima do tema publicado');
  assert.equal(c.temaEmVigor()?.acento, '#6bffb6');
  assert.equal(naPagina(c).get('gravar').dentro, 'PUBLICADO');
  // O aviso da própria gravação chega antes da resposta dela, e não é outra
  // pessoa publicando.
  assert.doesNotMatch(oQueAPaginaDiz(c), /[Oo]utra pessoa publicou/);
});

// **A casca confere o que o servidor do ESTILO não confere** — as cores de
// estado que o produto deriva, por exemplo. Publicar um tema que cada janela
// recusa deixaria o servidor inteiro com a aparência padrão, e calado.
test('ESTILO: a prévia que o produto recusa marca os campos e não publica', async () => {
  const w = world();
  const c = client(w, { recusarPrevia: [{ frente: 'texto', fundo: 'painel', razao: 4.2, piso: 4.5 }] });
  await assentar(); await abrir(c);
  c.fire({ nome: 'cor', chave: 'accent', valor: '#6bffb6' }); await assentar();
  assert.deepEqual(c.errosMarcados.at(-1)?.erros && Object.keys(c.errosMarcados.at(-1).erros).sort(), ['panel', 'text'],
    'a recusa da prévia não foi aos campos do par');
  c.fire({ nome: 'botao', chave: 'gravar' }); await assentar(20);
  assert.deepEqual(w.temas, [], 'publicou um tema que a casca recusa');
  assert.match(oQueAPaginaDiz(c), /texto sobre o painel/);
});

/**
 * Os pares das cores que a casca deriva das superfícies, como o contrato os
 * escreve (`tema.cores-de-estado`): as de estado do produto e o segundo
 * apagado, sempre sobre o painel. Lidos do texto do contrato, e não
 * reescritos aqui.
 */
const PARES_DERIVADOS = [...contrato.tema['cores-de-estado']
  .matchAll(/\{ frente: ([^,]+), fundo: '(\w+)', razao, piso: ([\d,]+) \}/g)]
  .flatMap(([, frentes, fundo, piso]) => frentes.split('|').map(frente => ({
    frente: frente.trim().replace(/'/g, ''), fundo, razao: 1.5, piso: Number(piso.replace(',', '.')),
  })));

// Nenhuma das cores derivadas é campo do ESTILO: o que a pessoa muda são as
// duas superfícies, porque a casca recusa quando nenhuma luminosidade serve ao
// fundo e ao painel juntos.
test('ESTILO: a recusa de uma cor que a casca deriva vai às duas superfícies, dita em português', async () => {
  assert.deepEqual(PARES_DERIVADOS.map(p => p.frente).sort(), ['apagadoSecundario', 'azul', 'fosforo', 'vermelho'],
    'o contrato não escreve mais os pares das cores derivadas como este teste os lê');
  const w = world();
  const c = client(w, { recusarPrevia: PARES_DERIVADOS });
  await assentar(); await abrir(c);
  // A borda não entra em par nenhum: a prévia sai só com o que a casca deriva.
  c.fire({ nome: 'cor', chave: 'border', valor: '#333333' }); await assentar();
  const marcados = c.errosMarcados.at(-1)?.erros ?? {};
  assert.deepEqual(Object.keys(marcados).sort(), ['background', 'panel'],
    'a recusa de uma cor derivada não foi às duas superfícies');
  assert.doesNotMatch(Object.values(marcados).join(' ') + ' ' + oQueAPaginaDiz(c), /fosforo|apagadoSecundario/,
    'a frase da recusa diz o nome interno da casca');
});

// O mapa dos pares (`CAMPO_DO_TOKEN`) é o vocabulário do contrato: todo nome
// de par que ele escreve tem campo, e nenhum outro nome sobra no mapa.
test('ESTILO: o mapa dos pares conhece os nomes que o contrato escreve, e só eles', () => {
  const fonte = fs.readFileSync(path.join(__dirname, '../ferramentas/estilo.js'), 'utf8');
  const mapa = vm.runInNewContext('(' + fonte.match(/const CAMPO_DO_TOKEN = (\{[\s\S]*?\});/)[1] + ')');
  const escritos = new Set([...contrato.tema.nomes, ...contrato.tema['derivados-pelo-produto'].nomes,
    ...PARES_DERIVADOS.map(p => p.frente)]);
  assert.deepEqual(Object.keys(mapa).filter(nome => !escritos.has(nome)), [],
    'o mapa conhece nomes que o contrato não escreve');
  const dosPares = new Set([...Object.keys(contrato.tema.pares).flatMap(par => par.split('/')),
    ...PARES_DERIVADOS.flatMap(p => [p.frente, p.fundo])]);
  assert.deepEqual([...dosPares].filter(nome => !Object.hasOwn(mapa, nome)), [],
    'um nome de par do contrato não tem campo no ESTILO');
});

// O servidor do ESTILO pede 4,5:1 para o texto apagado, e a casca, 3:1: um
// apagado de 3,68:1 passa na prévia e o servidor recusa. A recusa vem com os
// campos (`erros`), e eles estão na aba de cores.
test('ESTILO: a recusa do servidor volta aos campos, na aba deles', async () => {
  const w = world();
  const c = client(w); await assentar(); await abrir(c);
  c.fire({ nome: 'cor', chave: 'muted', valor: '#686868' }); await assentar();
  assert.notEqual(c.previa(), null, 'a casca recusou uma prévia que o contrato aceita');
  await naAba(c, 'forma');
  c.fire({ nome: 'botao', chave: 'gravar' }); await assentar(20);
  assert.deepEqual(w.temas, []);
  assert.ok(naPagina(c).has('muted'), 'a página não voltou à aba dos campos recusados');
  assert.deepEqual(Object.keys(c.errosMarcados.at(-1)?.erros ?? {}).sort(), ['background', 'muted', 'panel']);
  assert.match(oQueAPaginaDiz(c), /Contraste insuficiente/);
});

// O aviso do servidor no lugar da consulta de 4 s.
test('ESTILO: o aviso do servidor traz a revisão nova, e o rascunho acompanha o que a pessoa não tocou', async () => {
  const w = world(); const t = padrao();
  const c = client(w); await assentar(); await abrir(c);
  c.fire({ nome: 'cor', chave: 'accent', valor: '#6bffb6' }); await assentar();
  publicar(w, { ...t, border: '#123456' });
  await assentar();
  assert.equal(naPagina(c).get('border').valor, '#123456', 'a página não mostrou o que a outra pessoa publicou');
  assert.equal(naPagina(c).get('accent').valor, '#6bffb6');
  assert.match(oQueAPaginaDiz(c), /[Oo]utra pessoa publicou/);
  c.fire({ nome: 'botao', chave: 'gravar' }); await assentar(20);
  const agora = w.call({ op: 'view' }).theme;
  assert.equal(agora.accent, '#6bffb6');
  assert.equal(agora.border, '#123456', 'publicar desfez a borda que outra pessoa publicou');
});

test('ESTILO: um aviso sem novidade não pede nada e não remonta a página', async () => {
  const w = world(); const c = client(w); await assentar(); await abrir(c);
  const pedidos = c.requests.length;
  const montagens = c.superficies.get(ID).arvores.length;
  c.receberAviso({ carga: { revision: 0 } }); await assentar();
  assert.equal(c.requests.length, pedidos, 'um aviso da revisão que a janela já tem foi ao servidor');
  assert.equal(c.superficies.get(ID).arvores.length, montagens);
});

// A6
test('ESTILO: dois cliques em PUBLICAR publicam uma vez', async () => {
  const w = world(); const presos = [];
  const c = client(w, {
    request: (_id, canal, corpo) => corpo.op === 'save'
      ? new Promise(r => presos.push(() => r(w.call(corpo, '1', canal))))
      : w.call(corpo, '1', canal),
  });
  await assentar(); await abrir(c);
  c.fire({ nome: 'cor', chave: 'accent', valor: '#6bffb6' }); await assentar();
  c.fire({ nome: 'botao', chave: 'gravar' }); await assentar();
  assert.equal(naPagina(c).get('gravar').emProgresso, true);
  c.fire({ nome: 'botao', chave: 'gravar' }); await assentar();
  assert.equal(presos.length, 1, 'o segundo clique mandou outra gravação');
  presos.forEach(soltar => soltar()); await assentar(20);
  assert.doesNotMatch(oQueAPaginaDiz(c), /mudou em outro computador/);
});

// O servidor grava, avisa as janelas, e a resposta da gravação ainda está no
// caminho: no produto, o `ModAviso` e a resposta não têm ordem garantida. O
// aviso da própria gravação não é outra pessoa publicando.
test('ESTILO: o aviso da própria gravação, antes da resposta dela, não vira «outra pessoa publicou»', async () => {
  const w = world(); const presas = [];
  const c = client(w, {
    request: (_id, canal, corpo) => {
      const resposta = w.call(corpo, '1', canal);
      return corpo.op === 'save' ? new Promise(r => presas.push(() => r(resposta))) : resposta;
    },
  });
  await assentar(); await abrir(c);
  c.fire({ nome: 'cor', chave: 'accent', valor: '#6bffb6' }); await assentar();
  const pedidos = c.requests.length;
  c.fire({ nome: 'botao', chave: 'gravar' }); await assentar();
  assert.equal(presas.length, 1, 'a gravação não chegou ao servidor');
  assert.doesNotMatch(oQueAPaginaDiz(c), /[Oo]utra pessoa publicou/,
    'o aviso da própria gravação virou «outra pessoa publicou»');
  assert.equal(c.requests.length, pedidos + 1, 'o aviso da própria gravação pediu o estado no meio da escrita');
  presas.forEach(soltar => soltar()); await assentar(20);
  assert.equal(naPagina(c).get('gravar').dentro, 'PUBLICADO');
});

// A7
test('ESTILO: com o tema desligado, a página diz isso e PUBLICAR o liga', async () => {
  const w = world(); const c = client(w); await assentar(); await abrir(c);
  assert.equal(naPagina(c).get('gravar').desligado, false);
  assert.match(oQueAPaginaDiz(c), /tema compartilhado está desligado/);
  c.fire({ nome: 'botao', chave: 'gravar' }); await assentar(20);
  assert.equal(w.call({ op: 'view' }).enabled, true);
  assert.ok(w.temas.at(-1), 'publicar com o tema desligado não o declarou');
});

// A8
test('ESTILO: a entrada recusada é dita a quem está aqui', async () => {
  const c = client(world(), { registrar: async () => { throw recusa('teto-de-contribuicoes'); } });
  await assentar();
  assert.match(JSON.stringify(c.avisos), /teto-de-contribuicoes/);
});

// A5
test('ESTILO: mudar só o destaque muda só o destaque', async () => {
  const c = client(world()); await assentar(); await abrir(c);
  c.fire({ nome: 'cor', chave: 'accent', valor: '#6bffb6' }); await assentar();
  assert.deepEqual(c.chamadasDeTema.at(-1).valores, {
    fundo: '#050403', painel: '#0a0806', texto: '#eae3cf', apagado: '#908574', acento: '#6bffb6',
    borda: '#241f19', densidade: 'confortavel', fonte: 'mono', arredondamento: 0, brilho: false, modo: 'escuro',
  });
});

test('ESTILO: arredondamento e brilho se escolhem, aparecem na prévia e são publicados', async () => {
  const w = world(); const c = client(w); await assentar(); await abrir(c);
  await naAba(c, 'forma');
  c.fire({ nome: 'escolha', chave: 'radius', valor: '8' });
  c.fire({ nome: 'escolha', chave: 'glow', valor: 'sim' }); await assentar();
  assert.equal(c.temaEmVigor().arredondamento, 8);
  assert.equal(c.temaEmVigor().brilho, true);
  c.fire({ nome: 'botao', chave: 'gravar' }); await assentar(20);
  assert.equal(w.temas.at(-1).arredondamento, 8);
  assert.equal(naPagina(c).get('gravar').desligado, true, 'ficou dizendo que há mudança por publicar');
});

// O que se diz é o que o produto disse.
test('ESTILO: a página diz o que o produto fez com o tema, pelo evento tema', async () => {
  const w = world(); publicar(w, padrao());
  const aplicado = client(w); await assentar(); await abrir(aplicado);
  assert.match(oQueAPaginaDiz(aplicado), /Desenhado nesta sessão/);
  const recusado = client(w, { recusarTema: [{ frente: 'texto', fundo: 'fundo', razao: 2, piso: 4.5 }] });
  await assentar(); await abrir(recusado);
  assert.match(oQueAPaginaDiz(recusado), /recusou/);
  assert.match(oQueAPaginaDiz(recusado), /texto sobre o fundo/);
  const nativo = client(w, { nativo: true }); await assentar(); await abrir(nativo);
  assert.match(oQueAPaginaDiz(nativo), /desenho do SEELE/);
});

// A13
test('ESTILO: RESTAURAR PADRÃO declara a confirmação, e restaurar tira o tema', async () => {
  const w = world(); publicar(w, padrao());
  const c = client(w); await assentar(); await abrir(c);
  assert.match(String(naPagina(c).get('restaurar').confirmar ?? ''), /todo mundo/);
  // O produto só manda o `botao` depois do sim.
  c.fire({ nome: 'botao', chave: 'restaurar' }); await assentar(20);
  assert.equal(w.temas.at(-1), null);
});

test('ESTILO: os campos declaram o publicado como inicial, para o produto saber o que mudou', async () => {
  const w = world(); publicar(w, padrao());
  const c = client(w); await assentar(); await abrir(c);
  c.fire({ nome: 'cor', chave: 'accent', valor: '#6bffb6' }); await assentar();
  assert.equal(naPagina(c).get('accent').valor, '#6bffb6');
  assert.equal(naPagina(c).get('accent').inicial, '#f2521f');
  await naAba(c, 'forma');
  assert.equal(naPagina(c).get('radius').inicial, '0');
});

// A interface do ESTILO segue o tema em vigor.
test('ESTILO: a interface do ESTILO cita os tokens do tema; só as amostras usam cores literais', async () => {
  const c = client(world()); await assentar(); await abrir(c);
  for (const aba of ['cores', 'forma', 'presets']) {
    await naAba(c, aba);
    const literais = [];
    const andar = (no, dentroDeAmostra) => {
      if (!no || typeof no !== 'object') return;
      if (Array.isArray(no)) { no.forEach(n => andar(n, dentroDeAmostra)); return; }
      const amostra = dentroDeAmostra || /^Amostra/.test(no.nomeAcessivel ?? '');
      const e = no.estilo ?? {};
      for (const valor of [e.cor, e.fundo, e.borda?.cor]) {
        if (typeof valor === 'string' && !amostra) literais.push(no.forma + ': ' + valor);
      }
      andar(no.dentro, amostra);
    };
    assert.ok(naPagina(c).has('aba'), 'a página não abriu');
    andar(c.superficie(ID), false);
    assert.deepEqual(literais, [], 'cores literais fora das amostras, na aba ' + aba);
  }
});

test('ESTILO: as grades de cores e de forma viram uma coluna num contêiner estreito', async () => {
  const c = client(world()); await assentar(); await abrir(c);
  const classes = c.superficies.get(ID).classes;
  const consulta = classes?.['duas-colunas']?.consultas?.find(q => q.estilo?.colunas === 1);
  assert.ok(consulta, 'a classe das grades não tem uma consulta que a ponha numa coluna');
  const temClasse = (arvore, classe) => JSON.stringify(arvore).includes('"classe":"' + classe + '"');
  assert.ok(temClasse(c.superficie(ID), 'duas-colunas'), 'a grade das cores não usa a classe');
  await naAba(c, 'forma');
  assert.ok(temClasse(c.superficie(ID), 'duas-colunas'), 'a grade da forma não usa a classe');
});

test('ESTILO: a redeclaração recusada depois da subida é dita a quem administra', async () => {
  const w = world({ outroModEscolhido: true });
  w.data.theme = JSON.stringify({ revision: 3, theme: claro, enabled: true });
  const c = client(w); await assentar(); await abrir(c);
  assert.match(oQueAPaginaDiz(c), /outro MOD/);
});

test('ESTILO: nenhuma página passa do teto por mensagem, inclusive a de conjuntos', async () => {
  const c = client(world()); await assentar(); await abrir(c);
  for (const aba of ['cores', 'forma', 'presets']) await naAba(c, aba);
  assert.ok(naPagina(c).has('preset-seele'), 'a aba de conjuntos não montou');
  assert.ok(Math.max(...c.superficies.get(ID).bytes) <= TETO_DA_MENSAGEM);
});

test('ESTILO: quem não administra vê a aparência sem controles; com o tema desligado, sem amostra', async () => {
  const w = world(); const c = client(w, { pessoa: '2' }); await assentar(); await abrir(c);
  const campos = [...naPagina(c).values()].filter(n => FORMAS_DE_CAMPO.has(n.forma) || n.forma === 'botao');
  assert.deepEqual(campos, [], 'apareceu controle de edição para quem não administra');
  assert.doesNotMatch(oQueAPaginaDiz(c), /Amostra da conversa/, 'a amostra de um tema desligado apareceu');
  publicar(w, padrao()); await assentar();
  await abrir(c);
  assert.match(oQueAPaginaDiz(c), /Amostra da conversa/);
});
