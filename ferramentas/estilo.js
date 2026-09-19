// O ESTILO: o tema do servidor, **escolhido aqui** e aplicado na sessão.
//
// A versão anterior mostrava as quatro cores que conseguia aplicar e uma linha
// dizendo que o resto «aguarda suporte do SEELE». A API 3 completa oferece seis
// cores e a densidade, e quem administra edita e grava daqui.
//
// O que continua fora está escrito na emenda de 19/09 do ADR 0049, com a razão:
// a família de tipo mexe na escala medida do produto, e arredondamento e brilho
// não têm token. Eles são **preservados** no servidor — este MOD os devolve como
// vieram, e não os zera por não saber editá-los.

const { texto, campo, escolha, botao, linha, request, iniciar } =
  interfaceMod('seele/estilo', 'ESTILO');

/** As seis cores, na ordem em que fazem sentido de cima para baixo. */
const CORES = [
  ['background', 'FUNDO', 'fundo'],
  ['panel', 'PAINEL', 'painel'],
  ['text', 'TEXTO', 'texto'],
  ['muted', 'TEXTO APAGADO', 'apagado'],
  ['accent', 'DESTAQUE', 'acento'],
  ['border', 'BORDA', 'borda'],
];

const DENSIDADES = [
  { valor: 'compact', dentro: 'COMPACTA' },
  { valor: 'comfortable', dentro: 'CONFORTÁVEL' },
];

/** O que o produto sabe aplicar, a partir do que o servidor guarda. */
const paraOProduto = tema => ({
  fundo: tema.background,
  painel: tema.panel,
  texto: tema.text,
  apagado: tema.muted,
  acento: tema.accent,
  borda: tema.border,
  densidade: tema.density === 'comfortable' ? 'confortavel' : 'compacta',
});

let aplicado = null;
async function aplicar(valores) {
  const assinatura = JSON.stringify(valores);
  if (assinatura === aplicado) return;
  // Só confirme o estado depois que o produto aceitar cores, posse e contraste.
  await SeeleUI.tema(valores);
  aplicado = assinatura;
}

/**
 * O que está sendo editado, ou nada quando ninguém está editando.
 *
 * **Separado do que o servidor diz**, e é essa separação que faz a consulta de
 * quatro em quatro segundos não apagar o que está sendo digitado. Sem ela, o
 * produto preservar o foco não bastaria: o foco ficaria numa caixa cujo valor
 * este MOD acabou de trocar.
 */
let rascunho = null;
let ultimo = null;
let aviso = '';

/** O tema que a tela mostra: o rascunho, se há um; senão, o do servidor. */
const emEdicao = () => rascunho ?? ultimo?.theme ?? null;

function desenhoDoEstado() {
  if (!ultimo) return [texto('Consultando o tema do servidor…')];
  const tema = emEdicao();
  const podeEditar = ultimo.canEdit === true;
  const mudou = rascunho !== null && JSON.stringify(rascunho) !== JSON.stringify(ultimo.theme);

  if (!podeEditar) {
    // **Não é um aviso de indisponibilidade**: é a permissão do servidor dita
    // como ela é. Quem não administra vê o tema, e vê que não o edita.
    return [
      texto(ultimo.enabled
        ? 'Tema do servidor, aplicado somente nesta sessão.'
        : 'Tema compartilhado desativado. Aparência pessoal preservada.'),
      ...CORES.map(([chave, rotulo]) => texto(rotulo + ': ' + tema[chave])),
      texto('Densidade: ' + (tema.density === 'comfortable' ? 'confortável' : 'compacta')),
      texto('Revisão ' + ultimo.revision + ' · só quem administra o servidor edita.'),
    ];
  }

  return [
    texto(ultimo.enabled
      ? 'Tema do servidor, aplicado somente nesta sessão.'
      : 'Tema compartilhado desativado. Edite e grave para ligá-lo.'),
    ...CORES.map(([chave, rotulo]) => campo(chave, rotulo, tema[chave])),
    escolha('density', 'DENSIDADE', tema.density, DENSIDADES),
    linha([
      botao('gravar', mudou ? 'GRAVAR' : 'GRAVADO', !mudou),
      botao('descartar', 'DESCARTAR', !mudou),
      botao('restaurar', 'RESTAURAR PADRÃO'),
    ]),
    texto(aviso || ('Revisão ' + ultimo.revision)),
  ];
}

async function gravar(canal) {
  const tema = emEdicao();
  if (!tema) return;
  aviso = 'gravando…';
  // O servidor confere cor, contraste e revisão. O que este MOD não edita vai
  // de volta como veio: zerá-lo seria apagar a escolha de outra pessoa por não
  // saber mostrá-la.
  const resposta = await request(canal, { op: 'save', revision: ultimo.revision, theme: tema });
  ultimo = resposta;
  rascunho = null;
  aviso = 'gravado';
  await aplicar(paraOProduto(resposta.theme));
}

async function restaurar(canal) {
  aviso = 'restaurando…';
  const resposta = await request(canal, { op: 'reset', revision: ultimo.revision });
  ultimo = resposta;
  rascunho = null;
  aviso = 'restaurado';
  await aplicar({});
}

iniciar(
  async (snapshot, canal) => {
    const estado = await request(canal, { op: 'view' });
    ultimo = estado;
    await aplicar(estado.enabled ? paraOProduto(estado.theme) : {});
    return desenhoDoEstado();
  },
  () => aplicar({}),
  (evento, canal, repintar) => {
    if (evento.nome === 'campo' || evento.nome === 'escolha') {
      // O rascunho nasce do que o servidor tem, e daí em diante é dele.
      rascunho = { ...(rascunho ?? ultimo?.theme ?? {}) };
      rascunho[evento.chave] = evento.valor;
      aviso = '';
      repintar(desenhoDoEstado());
      return null;
    }
    if (evento.nome !== 'botao' || canal === null) return null;
    if (evento.chave === 'descartar') {
      rascunho = null;
      aviso = '';
      repintar(desenhoDoEstado());
      return null;
    }
    const feito = evento.chave === 'gravar' ? gravar(canal)
      : evento.chave === 'restaurar' ? restaurar(canal)
        : null;
    // A recusa do servidor — contraste, permissão, revisão trocada — vira a
    // linha de aviso desta região, e não um erro que ninguém lê.
    return feito?.then(
      () => repintar(desenhoDoEstado()),
      erro => { aviso = erro.message || String(erro); repintar(desenhoDoEstado()); },
    ) ?? null;
  },
);
