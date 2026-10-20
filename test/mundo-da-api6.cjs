// O mundo de mentira da API 6: o que o produto faz, do jeito que o contrato diz.
//
// Não é um teste: é o que os testes usam para fazer o papel do produto. Cada
// regra aqui vem de um lugar do contrato (`test/contrato/v6.json`) ou de um
// vetor do produto (`test/contrato/chaves-do-tema.json`), e o
// `contrato.test.cjs` confere este arquivo contra o vetor.
'use strict';

/** O teto de uma carga de MOD no fio: o pedido, o aviso e os valores do tema. */
const MAX_CARGA_DE_MOD = 12 * 1024;

/** As cores de uma região do tema (`tema.regioes` no contrato). */
const CORES_DE_REGIAO = ['fundo', 'texto', 'apagado', 'acento', 'borda'];

/** `seele_proto::mods::REGIOES_DO_TEMA`. */
const REGIOES_DO_TEMA = [
  'canal.cabecalho', 'compositor', 'conversa.mensagem', 'operador.barra',
  'pessoas.lista', 'redes', 'servidor.navegacao', 'status.barra',
];

const cor = valor => typeof valor === 'string' && /^#[0-9a-f]{6}$/i.test(valor);
const escolha = (...validas) => valor => typeof valor === 'string' && validas.includes(valor);

/** `seele_proto::mods::CHAVES_DO_TEMA`, com a forma de cada valor. */
const CHAVES_DO_TEMA = {
  fundo: cor,
  texto: cor,
  acento: cor,
  borda: cor,
  painel: cor,
  apagado: cor,
  arredondamento: valor => Number.isInteger(valor) && valor >= 0 && valor <= 24,
  brilho: valor => typeof valor === 'boolean',
  densidade: escolha('compacta', 'confortavel'),
  fonte: escolha('mono', 'sans'),
  // O modo, que também tem de concordar com o fundo do próprio tema.
  modo: escolha('claro', 'escuro'),
  regioes: null,
};

/** A luminância a partir da qual um fundo é claro (`LUMINANCIA_DO_FUNDO_CLARO`). */
const LUMINANCIA_DO_FUNDO_CLARO = 0.18;

/** `seele_proto::mods::modo_do_fundo`: sem fundo, escuro. */
function modoDoFundo(fundo) {
  if (fundo === undefined) return 'escuro';
  const canal = i => {
    const c = parseInt(fundo.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luz = 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
  return luz >= LUMINANCIA_DO_FUNDO_CLARO ? 'claro' : 'escuro';
}

/** Ordem de ponto de código, e não de unidade UTF-16. */
const porPontoDeCodigo = (a, b) => {
  const x = Array.from(a, c => c.codePointAt(0));
  const y = Array.from(b, c => c.codePointAt(0));
  for (let i = 0; i < Math.min(x.length, y.length); i += 1) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
};

/**
 * A primeira chave errada do tema, como o produto a nomeia, ou `null`.
 *
 * `{ erro, chave, regiao? }`, com `erro` em `chave-desconhecida`,
 * `valor-invalido` ou `regiao-desconhecida`. Com mais de uma errada, vale a
 * primeira em ordem de ponto de código.
 */
function recusaDasChavesDoTema(tema) {
  for (const chave of Object.keys(tema).sort(porPontoDeCodigo)) {
    if (!Object.hasOwn(CHAVES_DO_TEMA, chave)) return { erro: 'chave-desconhecida', chave };
    const valor = tema[chave];
    if (chave === 'regioes') {
      const recusa = recusaDasRegioes(valor);
      if (recusa) return recusa;
      continue;
    }
    if (!CHAVES_DO_TEMA[chave](valor)) return { erro: 'valor-invalido', chave };
    if (chave === 'modo' && valor !== modoDoFundo(tema.fundo)) return { erro: 'valor-invalido', chave };
  }
  return null;
}

function recusaDasRegioes(regioes) {
  if (!regioes || typeof regioes !== 'object' || Array.isArray(regioes)) {
    return { erro: 'valor-invalido', chave: 'regioes' };
  }
  for (const regiao of Object.keys(regioes).sort(porPontoDeCodigo)) {
    if (!REGIOES_DO_TEMA.includes(regiao)) return { erro: 'regiao-desconhecida', chave: 'regioes', regiao };
    const cores = regioes[regiao];
    if (!cores || typeof cores !== 'object' || Array.isArray(cores)) {
      return { erro: 'valor-invalido', chave: 'regioes', regiao };
    }
    for (const chave of Object.keys(cores).sort(porPontoDeCodigo)) {
      if (!CORES_DE_REGIAO.includes(chave)) return { erro: 'chave-desconhecida', chave, regiao };
      if (!cor(cores[chave])) return { erro: 'valor-invalido', chave, regiao };
    }
  }
  return null;
}

/** O teto de um aviso da metade de servidor (`limites.aviso-do-servidor`). */
const TETO_DO_AVISO = 1024;

/**
 * A metade de servidor de um MOD, com o `mundo` da API 6.
 *
 * Um contexto novo a cada pedido, como o servidor faz. `mundo.tema` e
 * `mundo.avisar` seguem o contrato (`sentido.mundo.tema`,
 * `sentido.mundo.avisar`):
 *
 * - a recusa é valor, `{ ok: false, erro, ... }`, nunca exceção;
 * - a porta do tema é o manifesto (`"tema": true`), e não a pessoa;
 * - `tema-de-outro-mod` quando outro MOD é o escolhido (`outroModEscolhido`);
 * - **a declaração e o aviso só valem se o `aoPedir` terminar**: os dois ficam
 *   pendentes durante a chamada e entram no mundo junto com o quintal.
 *
 * `temas` é a lista das declarações que valeram, na ordem; `avisos`, a dos
 * avisos.
 */
function metadeDeServidor({ codigo, manifesto, outroModEscolhido = false, agora = 100, vm = require('node:vm') }) {
  const data = {};
  const files = new Map();
  const temas = [];
  const avisos = [];
  const call = (pedido, contexto = { person: '1', channel: 1, admin: true, write: true }) => {
    const quintal = structuredClone(data);
    const declarados = [];
    const avisados = [];
    const mundo = {
      agora: () => agora,
      tema: valores => {
        if (manifesto.tema !== true) return { ok: false, erro: 'sem-porta-de-tema' };
        if (outroModEscolhido) return { ok: false, erro: 'tema-de-outro-mod' };
        if (valores !== null && (typeof valores !== 'object' || Array.isArray(valores))) {
          return { ok: false, erro: 'tema-invalido' };
        }
        if (Buffer.byteLength(JSON.stringify(valores)) > MAX_CARGA_DE_MOD) {
          return { ok: false, erro: 'tema-grande-demais' };
        }
        const recusa = valores === null ? null : recusaDasChavesDoTema(valores);
        if (recusa) return { ok: false, ...recusa };
        declarados.push(valores === null ? null : structuredClone(valores));
        return { ok: true };
      },
      avisar: aviso => {
        const carga = aviso && typeof aviso === 'object' ? aviso.carga : undefined;
        if (carga === undefined) return { ok: false, erro: 'aviso-invalido' };
        if (Buffer.byteLength(JSON.stringify(carga)) > TETO_DO_AVISO) return { ok: false, erro: 'aviso-grande-demais' };
        avisados.push(structuredClone({ ...(aviso.canal ? { canal: aviso.canal } : {}), carga }));
        return { ok: true };
      },
    };
    const ctx = vm.createContext({
      dados: quintal,
      mundo,
      arquivos: {
        ler: p => files.get(p) ?? null,
        escrever: (p, v) => (files.set(p, v), true),
        apagar: p => files.delete(p),
        listar: () => [...files.keys()],
      },
    });
    vm.runInContext(codigo, ctx, { timeout: 250 });
    const resposta = JSON.parse(ctx.aoPedir(JSON.stringify(contexto), JSON.stringify(pedido)));
    // Terminou: o quintal, o tema e o aviso valem juntos.
    for (const chave of Object.keys(data)) delete data[chave];
    Object.assign(data, quintal);
    temas.push(...declarados);
    avisos.push(...avisados);
    return resposta;
  };
  return { data, files, temas, avisos, call };
}

module.exports = {
  MAX_CARGA_DE_MOD,
  TETO_DO_AVISO,
  recusaDasChavesDoTema,
  modoDoFundo,
  metadeDeServidor,
};
