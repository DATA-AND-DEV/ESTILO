// O ESTILO: o tema do servidor, **escolhido aqui** e aplicado na sessão.
//
// A versão anterior mostrava as quatro cores que conseguia aplicar e uma linha
// dizendo que o resto «aguarda suporte do SEELE». A API 3 completa oferece seis
// cores e a densidade, e quem administra edita e grava daqui.
//
// A família de tipo entrou junto: ela é escolha entre as duas pilhas que o
// produto declara, e não família livre — a escala de tipo daqui é medida, e uma
// família qualquer moveria tamanho, entrelinha e contraste de uma vez.
//
// Arredondamento e brilho entraram junto. O produto abre em canto reto e sem
// sombra — é a estética dele —, e `specs/07-estetica.md` nomeia a exceção: um
// tema de servidor pode levantar os dois, e o efeito vale só naquela sessão.
//
// O arredondamento é inteiro de 0 a 24 dos dois lados: este servidor já
// conferia o intervalo antes de o produto saber aplicá-lo, e agora os dois
// concordam. O brilho é sim ou não, e a sombra que ele liga é montada pelo
// produto — este MOD manda `true`, e nunca um `box-shadow`.

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

const FONTES = [
  { valor: 'mono', dentro: 'MONOESPAÇADA' },
  { valor: 'sans', dentro: 'SEM SERIFA' },
];

/** O arredondamento: o mesmo intervalo que o servidor e o produto conferem. */
const RAIOS = [0, 2, 4, 8, 12, 16, 24].map(n => ({ valor: String(n), dentro: n === 0 ? 'RETO' : `${n} PX` }));

const BRILHOS = [
  { valor: 'nao', dentro: 'SEM BRILHO' },
  { valor: 'sim', dentro: 'COM BRILHO' },
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
  fonte: tema.font === 'sans' ? 'sans' : 'mono',
  // Número e booleano, e não texto: a API confere o intervalo e o tipo, e é
  // ela quem escreve `px` e monta a sombra. Mandar `'8px'` seria mandar uma
  // string para uma porta que aceita número, e a recusa seria nossa.
  arredondamento: Number(tema.radius) || 0,
  brilho: tema.glow === true,
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
      texto('Fonte: ' + (tema.font === 'sans' ? 'sem serifa' : 'monoespaçada')),
      texto('Arredondamento: ' + (tema.radius ? tema.radius + ' px' : 'reto')),
      texto('Brilho: ' + (tema.glow ? 'ligado' : 'desligado')),
      texto('Revisão ' + ultimo.revision + ' · só quem administra o servidor edita.'),
    ];
  }

  return [
    texto(ultimo.enabled
      ? 'Tema do servidor, aplicado somente nesta sessão.'
      : 'Tema compartilhado desativado. Edite e grave para ligá-lo.'),
    ...CORES.map(([chave, rotulo]) => campo(chave, rotulo, tema[chave])),
    escolha('density', 'DENSIDADE', tema.density, DENSIDADES),
    escolha('font', 'FONTE', tema.font, FONTES),
    escolha('radius', 'ARREDONDAMENTO', String(tema.radius ?? 0), RAIOS),
    escolha('glow', 'BRILHO', tema.glow ? 'sim' : 'nao', BRILHOS),
    linha([
      botao('gravar', mudou ? 'GRAVAR' : 'GRAVADO', !mudou),
      botao('descartar', 'DESCARTAR', !mudou),
      botao('restaurar', 'RESTAURAR PADRÃO'),
    ]),
    texto(aviso || ('Revisão ' + ultimo.revision)),
    ...oQueEstaGuardadoENaoSeAplica(),
  ];
}

/**
 * O que está salvo neste servidor e **este produto não aplica**.
 *
 * Só aparece quando há algo salvo: é uma frase sobre os dados de quem está
 * aqui, e não um aviso de indisponibilidade. A marca deste produto proíbe raio
 * e sombra — «nunca», na letra dela —, e a API de tema recusa os dois pelo
 * nome. Quem salvou um raio noutro tempo merece saber que ele está guardado e
 * não desenhado, em vez de achar que o tema dele não pegou.
 *
 * Perguntar ao produto por tentativa seria pior: pedir para descobrir a recusa
 * aplica um tema de mentira no caminho.
 */
function oQueEstaGuardadoENaoSeAplica() {
  const tema = ultimo?.theme;
  if (!tema) return [];
  const guardados = [];
  if (tema.radius) guardados.push('arredondamento ' + tema.radius);
  if (tema.glow) guardados.push('brilho');
  if (!guardados.length) return [];
  return [texto(
    'Guardado neste servidor e não desenhado aqui: ' + guardados.join(', ')
    + '. A marca do SEELE não tem raio nem sombra, e a API de tema recusa os dois.'
  )];
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
      // **A escolha devolve texto, e o servidor guarda número e booleano.**
      // Converter aqui, e não na gravação, é o que faz a tela mostrar o que
      // vai ser gravado: um `'8'` no rascunho reapareceria na comparação com
      // o que o servidor tem e diria «mudou» para sempre.
      rascunho[evento.chave] =
        evento.chave === 'radius' ? Number(evento.valor) || 0
          : evento.chave === 'glow' ? evento.valor === 'sim'
            : evento.valor;
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
