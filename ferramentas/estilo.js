// O ESTILO: a aparência do servidor, **escolhida aqui** e aplicada na sessão.
//
// # O que esta versão conserta
//
// U23 da auditoria de 20/09/2026: «ESTILO usa inputs de hexadecimal em vez de
// seletor e amostra; a cor muda após gravar, sem prévia reversível explícita.»
// E o §2 do plano: «Quem não administra recebe o tema, não um formulário
// permanente de cores no rodapé.»
//
// As duas eram consequência do mesmo limite: a API 3 tinha `campo` de texto e
// mais nada, e a faixa era o único lugar onde um MOD podia existir. Escolher
// seis cores num rodapé de 240px, sem ver nenhuma delas antes de gravar para
// todo mundo, era o que dava para fazer.
//
// Agora: uma entrada «Aparência do servidor» na navegação, uma página com
// seletores de cor, amostras, presets e tipografia, e **prévia local separada
// de publicar** — a pessoa vê o tema aplicado só na sessão dela, e decide.
//
// U24 continua consertado aqui: a região mostra o **resultado** da aplicação, e
// não uma recusa afirmada sem ter sido observada.

const {
  texto, botao, escolha,
  caixa, pilha, grade, separador, espaco,
  acoes, abas, aba, cor, deslizante, interruptor, distintivo,
  request, iniciar, temSuperficies, temContribuicoes,
  dialogo, contribuir, entrada, revogar, avisar, agruparAtualizacoes,
} = interfaceMod('seele/estilo', 'ESTILO');

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

/**
 * Conjuntos prontos, para quem não quer escolher seis cores.
 *
 * §2 do plano pede «presets» pelo nome, e a razão é a que a auditoria mediu em
 * U04: uma tela que só oferece seis campos hexadecimais pede uma decisão que
 * quase ninguém quer tomar. Um preset é a decisão já tomada, e continua
 * editável depois — não é um modo, é um ponto de partida.
 */
const PRESETS = [
  {
    id: 'seele',
    nome: 'SEELE',
    tema: {
      background: '#050403', panel: '#0a0806', text: '#eae3cf',
      muted: '#908574', accent: '#f2521f', border: '#3a322a',
      density: 'compact', font: 'mono', radius: 0, glow: false,
    },
  },
  {
    id: 'papel',
    nome: 'PAPEL',
    tema: {
      background: '#12100e', panel: '#1b1815', text: '#f2ece0',
      muted: '#a2988a', accent: '#c9a227', border: '#4a423a',
      density: 'comfortable', font: 'sans', radius: 4, glow: false,
    },
  },
  {
    id: 'profundo',
    nome: 'PROFUNDO',
    tema: {
      background: '#03060b', panel: '#081019', text: '#dbe7f2',
      muted: '#7e94ab', accent: '#38bdf8', border: '#1f3347',
      density: 'compact', font: 'mono', radius: 8, glow: true,
    },
  },
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

/**
 * O que o produto fez com o último tema entregue — e não o que este lado supõe.
 *
 * `{ valores, erro }`. `erro` vazio quer dizer que a API aceitou tudo o que foi
 * mandado; com texto, é a recusa dela, pelo nome que ela deu.
 *
 * Existe porque a versão anterior **afirmava** a recusa sem perguntar: havia
 * uma frase fixa dizendo que «a API de tema recusa» raio e sombra, escrita
 * quando era verdade e mantida depois de deixar de ser. Ela reapareceu na
 * auditoria de 20/09/2026 logo depois de a pessoa gravar arredondamento 8 e o
 * produto tê-lo aplicado.
 *
 * Duas descrições concorrentes do mesmo recurso produzem exatamente isso. A
 * que fica é a que vem do resultado.
 */
let ultimaAplicacao = null;

async function aplicar(valores) {
  const assinatura = JSON.stringify(valores);
  if (assinatura === aplicado) return;
  try {
    // Só confirme o estado depois que o produto aceitar cores, posse e contraste.
    await SeeleUI.tema(valores);
    aplicado = assinatura;
    ultimaAplicacao = { valores, erro: '' };
  } catch (falha) {
    // **A recusa não vira silêncio nem chute.** `aplicado` continua sendo o que
    // está de pé de verdade, para a próxima tentativa não se achar redundante.
    ultimaAplicacao = { valores, erro: falha?.message || String(falha) };
    throw falha;
  }
}

/**
 * O que está sendo editado, ou nada quando ninguém está editando.
 *
 * **Separado do que o servidor diz**, e é essa separação que faz a consulta de
 * quatro em quatro segundos não apagar o que está sendo escolhido.
 */
let rascunho = null;
let ultimo = null;
let aviso = '';
/**
 * A prévia está ligada?
 *
 * **U23 pelo nome**: «prévia local separada de publicar para o servidor». Antes
 * não havia escolha nenhuma: a cor mudava ao gravar, e gravar é para todo
 * mundo. Agora quem edita vê o rascunho aplicado **na sessão dele** antes de
 * decidir, e desligar a prévia devolve o tema do servidor sem desfazer o
 * rascunho.
 */
let previaLigada = true;
/** A aba aberta na página. */
let abaAberta = 'cores';
/** O punho da página, e o handle da entrada de navegação. */
let tela = null;
let entradaRegistrada = false;
let entradaPodeEditar = false;

/** O tema que a tela mostra: o rascunho, se há um; senão, o do servidor. */
const emEdicao = () => rascunho ?? ultimo?.theme ?? null;

const mudou = () =>
  rascunho !== null && JSON.stringify(rascunho) !== JSON.stringify(ultimo?.theme);

const podeEditar = () => ultimo?.canEdit === true;

/**
 * O tema que **esta sessão** deve estar vendo agora.
 *
 * Três estados, e eles não se confundem:
 *
 * - editando com prévia ligada: o rascunho, só aqui;
 * - tema do servidor ligado: o que está gravado, para todo mundo;
 * - desligado: a aparência padrão do SEELE.
 */
function temaDaSessao() {
  if (podeEditar() && previaLigada && mudou()) return paraOProduto(rascunho);
  if (ultimo?.enabled) return paraOProduto(ultimo.theme);
  return {};
}

// ------------------------------------------------------------ as amostras

/**
 * Uma amostra de cor: o quadrado, o nome e o valor.
 *
 * U23 pediu «seletor de cor + hexadecimal opcional» e amostra. O seletor e o
 * hexadecimal são a forma `cor` do produto, que traz os dois; a amostra é esta
 * caixa, e ela existe porque um seletor fechado não mostra a cor escolhida ao
 * lado das outras cinco — e é a relação entre elas que decide se o tema é
 * legível.
 */
const amostraDeCor = (valor, tamanho = 28) => caixa([], {
  largura: tamanho,
  altura: tamanho,
  fundo: valor,
  borda: { largura: 1, cor: '#ffffff33' },
  raio: 0,
});

/**
 * Como a conversa vai ficar: um pedaço de tela desenhado com o tema escolhido.
 *
 * **Isto não é a conversa.** É uma amostra do que as seis cores fazem juntas —
 * fundo, painel, texto, apagado, destaque e borda, nas relações em que o
 * produto as usa. Sem ela, escolher a cor de `muted` é escolher um número.
 */
function aAmostraDaConversa(tema) {
  return caixa([
    caixa([
      caixa([], { largura: 24, altura: 24, raio: 0, fundo: tema.accent }),
      pilha([
        caixa(['Alguém'], { cor: tema.accent, peso: 'forte', corpo: 12 }),
        caixa(['Assim fica uma mensagem neste servidor.'], { cor: tema.text, corpo: 12 }),
        caixa(['há 2 minutos'], { cor: tema.muted, corpo: 10 }),
      ], { intervalo: 2, crescer: 1 }),
    ], { direcao: 'linha', intervalo: 8, alinhar: 'inicio' }),
    separador({ }),
    caixa([
      caixa(['UM BOTÃO'], {
        cor: tema.accent,
        borda: { largura: 1, cor: tema.accent },
        preenchimento: 6,
        raio: Number(tema.radius) || 0,
        corpo: 11,
      }),
      caixa(['OUTRO'], {
        cor: tema.muted,
        borda: { largura: 1, cor: tema.border },
        preenchimento: 6,
        raio: Number(tema.radius) || 0,
        corpo: 11,
      }),
    ], { direcao: 'linha', intervalo: 8 }),
  ], {
    fundo: tema.panel,
    borda: { largura: 1, cor: tema.border },
    preenchimento: 12,
    intervalo: 10,
    raio: Number(tema.radius) || 0,
    ...(tema.glow ? { sombra: { x: 0, y: 0, desfoque: 12, cor: tema.accent + '66' } } : {}),
  });
}

// -------------------------------------------------------------- a página

function aAbaDeCores(tema) {
  return [
    caixa(['Seis cores, e o que decide se a conversa se lê é a relação entre '
      + 'elas. A amostra acima responde a cada troca.'],
    { corpo: 12, opacidade: 0.7, entrelinha: 1.45, larguraMaxima: 620 }),
    // **Duas colunas.** Seis campos numa coluna só era uma lista que exigia
    // rolar para ver a sexta cor — e a sexta é a borda, que muda a leitura de
    // tudo. Em duas, as seis cabem no mesmo olhar, que é a densidade que
    // `specs/07` pede.
    grade(CORES.map(([chave, rotulo]) => cor(chave, rotulo, tema[chave])),
      { colunas: 2, intervalo: 20 }),
  ];
}


function aAbaDeForma(tema) {
  return [
    caixa(['Espaçamento, tipo e cantos. O SEELE abre em canto reto e sem '
      + 'sombra; um tema de servidor pode levantar os dois, e o efeito vale '
      + 'só nesta sessão.'], { corpo: 11, opacidade: 0.75 }),
    grade([
      escolha('density', 'DENSIDADE', tema.density, DENSIDADES),
      escolha('font', 'FONTE', tema.font, FONTES),
      escolha('radius', 'ARREDONDAMENTO', String(tema.radius ?? 0), RAIOS),
      escolha('glow', 'BRILHO', tema.glow ? 'sim' : 'nao', BRILHOS),
    ], { colunas: 2, intervalo: 20 }),
  ];
}

function aAbaDePresets(tema) {
  return [
    caixa(['Um ponto de partida, e não um modo: escolher um conjunto preenche '
      + 'as seis cores e a forma, e tudo continua editável depois.'],
    { corpo: 11, opacidade: 0.75 }),
    grade(PRESETS.map(preset => caixa([
      caixa([preset.nome], { peso: 'forte', corpo: 12 }),
      caixa(CORES.map(([chave]) => amostraDeCor(preset.tema[chave], 20)),
        { direcao: 'linha', intervalo: 4 }),
      aAmostraDaConversa(preset.tema),
      // **Desligado quando ele já é o que está de pé**, e a comparação é só
      // sobre as chaves que o conjunto define: o tema guardado carrega
      // `revision` e outros campos que nenhum conjunto tem, e compará-los
      // inteiros faria «usar o que já está usado» parecer sempre disponível.
      acoes([botao('preset-' + preset.id, 'USAR ESTE', eOMesmoConjunto(preset, tema))]),
    ], {
      intervalo: 8,
      preenchimento: 12,
      borda: { largura: 1, cor: '#3a322a' },
      raio: 0,
    })), { colunas: 3, intervalo: 12 }, { classe: 'presets' }),
  ];
}

/** Este conjunto já é o que está escolhido? Só as chaves que ele define. */
const eOMesmoConjunto = (preset, tema) =>
  Object.keys(preset.tema).every(chave => preset.tema[chave] === tema?.[chave]);

/** As classes da página: o que muda quando a superfície aperta. */
const CLASSES_DA_PAGINA = {
  'duas-colunas': {
    base: {},
    consultas: [{ ateLargura: 620, estilo: { direcao: 'coluna' } }],
  },
  presets: {
    base: {},
    consultas: [
      { ateLargura: 900, estilo: { colunas: 2 } },
      { ateLargura: 560, estilo: { colunas: 1 } },
    ],
  },
};

/**
 * Um título de grupo — o terceiro e último nível de tipo desta tela.
 *
 * Acima dele, a cartela do título da janela, que o produto monta; abaixo, o
 * rótulo de campo, em mono apagado. O defeito da versão anterior era não ter
 * este nível: cada rótulo tinha o mesmo peso, e a tela lia como uma lista de
 * coisas iguais em vez de uma decisão com partes.
 */
function grupo(nome) {
  return caixa([nome], {
    familia: 'sans',
    peso: 'forte',
    corpo: 13,
    espacamento: 1,
    transformar: 'maiuscula',
    cor: '#908574',
  });
}

function aPagina() {
  if (!ultimo) return [texto('Consultando o tema do servidor…')];
  const tema = emEdicao();

  // **Quem não administra recebe o tema, e não um formulário.** §2 do plano.
  if (!podeEditar()) {
    return [
      caixa([ultimo.enabled
        ? 'Este é o tema deste servidor. Ele vale só enquanto você está aqui.'
        : 'Este servidor não tem tema compartilhado ligado. A sua aparência '
          + 'pessoal do SEELE continua valendo.'], { opacidade: 0.85 }),
      aAmostraDaConversa(tema),
      caixa(['Quem administra este servidor pode mudá-lo. Revisão '
        + ultimo.revision + '.'], { corpo: 11, opacidade: 0.7 }),
      ...oResultadoDaAplicacao(),
    ];
  }

  return [
    // **A amostra abre a janela, em tamanho real.**
    //
    // A composição anterior punha os controles primeiro e a amostra numa
    // coluna estreita à direita. Mas a pergunta que esta tela existe para
    // responder é «como vai ficar» — e a resposta estava do tamanho de um
    // detalhe, ao lado da ferramenta. Aqui ela é a primeira coisa, com a
    // largura do diálogo, e os controles vêm abaixo servindo-a.
    pilha([
      caixa([
        grupo('Como a conversa fica'),
        ...(mudou() ? [distintivo(['NÃO PUBLICADO'],
          { borda: { largura: 1, cor: '#f2521f' }, cor: '#f2521f', corpo: 10 })] : []),
      ], { direcao: 'linha', alinhar: 'fim', distribuir: 'entre', intervalo: 12, quebra: 'sim' }),
      aAmostraDaConversa(tema),
      // **Prévia local e publicação, ditas juntas e embaixo da amostra.** As
      // duas falam sobre o que se acabou de ver: uma diz quem está vendo
      // isto agora, a outra é o botão que faz todo mundo ver.
      caixa([
        interruptor('previa', 'VER SÓ NA MINHA SESSÃO', previaLigada),
        caixa([previaLigada
          ? 'O que você escolher aparece só para você até publicar.'
          : 'Você está vendo o tema publicado, e não o que está editando.'],
        { corpo: 11, opacidade: 0.7, crescer: 1, base: 0, larguraMinima: 200 }),
      ], { direcao: 'linha', alinhar: 'centro', intervalo: 12, quebra: 'sim' }),
    ], { intervalo: 14 }),

    separador(),

    // **Só o conteúdo da aba aberta atravessa a ponte.**
    //
    // As três montadas de uma vez davam 14.164 bytes num `superficie-montar`,
    // e o teto por mensagem é 12.288: a validação nativa de 20/09/2026 viu a
    // página nascer vazia com `fila-cheia` na tela. Não era saturação — era
    // uma mensagem que não cabia, e nenhuma delas caberia sozinha se as três
    // fossem juntas.
    //
    // As tiras continuam completas: o produto monta os rótulos a partir de
    // `chave`/`rotulo`, e **só desenha o painel escolhido** de qualquer forma
    // (ver `atualizarAbas` no renderer). Mandar o conteúdo das outras duas era
    // pagar a ponte por algo que nem seria montado.
    //
    // Trocar de aba emite `aba`, que redesenha com a nova aberta — o mesmo
    // caminho de sempre, e a ida à ponte que ele custa é a que já existia.
    abas('aba', abaAberta, [
      aba('cores', 'CORES', abaAberta === 'cores' ? aAbaDeCores(tema) : []),
      aba('forma', 'FORMA', abaAberta === 'forma' ? aAbaDeForma(tema) : []),
      aba('presets', 'CONJUNTOS', abaAberta === 'presets' ? aAbaDePresets(tema) : []),
    ]),

    ...(aviso ? [caixa([aviso], { corpo: 11, cor: '#f2521f' })] : []),
    ...oResultadoDaAplicacao(),

    acoes([
      botao('restaurar', 'RESTAURAR PADRÃO', false, { variante: 'discreta' }),
      espaco(),
      botao('descartar', 'DESCARTAR', !mudou(), { variante: 'discreta' }),
      botao('gravar', mudou() ? 'PUBLICAR PARA O SERVIDOR' : 'PUBLICADO', !mudou(),
        { variante: 'primaria' }),
    ], true),
  ];
}

/**
 * O que o produto **fez** com o último tema entregue.
 *
 * Substitui a frase que afirmava uma recusa sem tê-la observado. Ou a API
 * aceitou — e então esta linha diz o que está desenhado agora, incluindo raio
 * e brilho, que ela aplica desde que `NUMEROS_DA_API` e `BANDEIRAS_DA_API`
 * existem — ou ela recusou, e então esta linha traz o motivo dela, com o que
 * ficou de pé no lugar.
 *
 * Nenhum dos dois é adivinhado: os dois saem de `ultimaAplicacao`.
 */
function oResultadoDaAplicacao() {
  if (!ultimaAplicacao) return [];
  const { valores, erro } = ultimaAplicacao;
  if (erro) {
    return [caixa(['O produto recusou parte do tema: ' + erro
      + '. O que estava desenhado antes continua de pé.'],
    { corpo: 11, cor: '#f2521f' })];
  }
  if (!valores || Object.keys(valores).length === 0) {
    return [caixa(['Nesta sessão: aparência padrão do SEELE.'],
      { corpo: 11, opacidade: 0.7 })];
  }
  const partes = [];
  if (valores.arredondamento) partes.push('arredondamento ' + valores.arredondamento + ' px');
  else partes.push('cantos retos');
  partes.push(valores.brilho ? 'com brilho' : 'sem brilho');
  partes.push(valores.densidade === 'confortavel' ? 'densidade confortável' : 'densidade compacta');
  partes.push(valores.fonte === 'sans' ? 'sem serifa' : 'monoespaçada');
  return [caixa(['Desenhado nesta sessão: ' + partes.join(' · ') + '.'],
    { corpo: 11, opacidade: 0.7 })];
}

// ------------------------------------------------------------- a região

/**
 * O que continua na faixa, e por que é tão pouco.
 *
 * U01: os MODs disputavam 240px, e este gastava os dele com seis campos de
 * hexadecimal que quem não administra nunca poderia usar. A faixa agora diz o
 * estado e abre a porta; sem superfícies, ela volta a ser o formulário que era.
 */
function aRegiao() {
  if (!ultimo) return [texto('Consultando o tema do servidor…')];
  if (!temSuperficies) return aFaixaAntiga();
  const tema = emEdicao();
  return [
    caixa([
      caixa(CORES.map(([chave]) => amostraDeCor(tema[chave], 18)),
        { direcao: 'linha', intervalo: 3 }),
      caixa([ultimo.enabled ? 'Tema deste servidor' : 'Sem tema compartilhado'],
        { corpo: 11, opacidade: 0.8, crescer: 1 }),
      ...(mudou() ? [distintivo(['NÃO PUBLICADO'],
        { borda: { largura: 1, cor: '#f2521f' }, cor: '#f2521f' })] : []),
      botao('abrir-aparencia', podeEditar() ? 'EDITAR APARÊNCIA' : 'VER APARÊNCIA',
        false, { variante: podeEditar() ? 'primaria' : 'secundaria' }),
    ], { direcao: 'linha', alinhar: 'centro', intervalo: 8, quebra: 'sim' }),
    ...(aviso ? [texto(aviso)] : []),
  ];
}

/** A faixa de antes, para um SEELE que ainda não tem superfícies. */
function aFaixaAntiga() {
  const tema = emEdicao();
  if (!podeEditar()) {
    return [
      texto(ultimo.enabled
        ? 'Tema do servidor, aplicado somente nesta sessão.'
        : 'Tema compartilhado desativado. Aparência pessoal preservada.'),
      ...CORES.map(([chave, rotulo]) => texto(rotulo + ': ' + tema[chave])),
      texto('Revisão ' + ultimo.revision + ' · só quem administra o servidor edita.'),
      ...oResultadoDaAplicacao(),
    ];
  }
  return [
    texto(ultimo.enabled
      ? 'Tema do servidor, aplicado somente nesta sessão.'
      : 'Tema compartilhado desativado. Edite e grave para ligá-lo.'),
    ...CORES.map(([chave, rotulo]) => cor(chave, rotulo, tema[chave])),
    escolha('density', 'DENSIDADE', tema.density, DENSIDADES),
    escolha('font', 'FONTE', tema.font, FONTES),
    escolha('radius', 'ARREDONDAMENTO', String(tema.radius ?? 0), RAIOS),
    escolha('glow', 'BRILHO', tema.glow ? 'sim' : 'nao', BRILHOS),
    acoes([
      botao('gravar', mudou() ? 'GRAVAR' : 'GRAVADO', !mudou(), { variante: 'primaria' }),
      botao('descartar', 'DESCARTAR', !mudou(), { variante: 'discreta' }),
      botao('restaurar', 'RESTAURAR PADRÃO', false, { variante: 'discreta' }),
    ]),
    texto(aviso || ('Revisão ' + ultimo.revision)),
    ...oResultadoDaAplicacao(),
  ];
}

// -------------------------------------------------------- abrir e gravar

async function abrirAparencia() {
  if (!temSuperficies) return;
  // **Um diálogo amplo, e não uma página.**
  //
  // A versão de `0fba9a5` era um `<dialog>` de `min(920px, 100vw-32px)`, e a
  // troca por página custou o que o reteste de `c4fe3ea` mediu: o editor
  // passou a dividir a coluna da conversa, e as amostras ficaram num corredor
  // estreito. Escolher tema é uma tarefa curta e focada — a pessoa abre,
  // escolhe, publica e volta —, e é exatamente para isso que um modal serve.
  //
  // A página continua existindo na API para o que é atividade longa: a mesa do
  // MESA é uma, e ela fica.
  tela ??= await dialogo('estilo-aparencia', 'Aparência do servidor', {
    tamanho: { largura: 980 },
    fecharComAlteracoes: 'confirmar',
  });
  await tela.classes(CLASSES_DA_PAGINA);
  await tela.montar(aPagina());
  await tela.suja(mudou());
  await tela.mostrar();
}

const repintarTudo = agruparAtualizacoes(async (repintar) => {
  repintar(aRegiao());
  if (tela) {
    await tela.montar(aPagina());
    await tela.suja(mudou());
  }
});

async function gravar(canal) {
  const tema = emEdicao();
  if (!tema) return;
  aviso = 'publicando…';
  // O servidor confere cor, contraste e revisão. O que este MOD não edita vai
  // de volta como veio: zerá-lo seria apagar a escolha de outra pessoa por não
  // saber mostrá-la.
  const resposta = await request(canal, { op: 'save', revision: ultimo.revision, theme: tema });
  ultimo = resposta;
  rascunho = null;
  aviso = 'publicado para todo mundo neste servidor';
  await aplicar(paraOProduto(resposta.theme));
}

async function restaurar(canal) {
  aviso = 'restaurando…';
  const resposta = await request(canal, { op: 'reset', revision: ultimo.revision });
  ultimo = resposta;
  rascunho = null;
  aviso = 'restaurado ao padrão do SEELE';
  await aplicar({});
}

iniciar(
  async (snapshot, canal) => {
    const estado = await request(canal, { op: 'view' });
    ultimo = estado;
    await aplicar(temaDaSessao());
    if (entradaRegistrada && entradaPodeEditar !== (estado.canEdit === true)) {
      await revogar(entradaRegistrada.handle);
      entradaRegistrada = false;
    }
    if (temContribuicoes && !entradaRegistrada) {
      try {
        entradaRegistrada = await entrada('Aparência do servidor', 'abrir-aparencia', { listarNaBarra: estado.canEdit === true });
        entradaPodeEditar = estado.canEdit === true;
      } catch (erro) {
        console.warn('ESTILO: a entrada foi recusada: ' + (erro.message || erro));
      }
    }
    if (tela) {
      await tela.montar(aPagina());
      await tela.suja(mudou());
    }
    return aRegiao();
  },
  () => {
    tela = null;
    entradaRegistrada = false;
    return aplicar({});
  },
  (evento, canal, repintar) => {
    if (evento.nome === 'acao') {
      if (evento.acao === 'abrir-aparencia') return abrirAparencia();
      return null;
    }
    if (evento.nome === 'fechar' || evento.nome === 'fechar-pedido') return null;

    if (evento.nome === 'aba') {
      abaAberta = evento.valor;
      return repintarTudo(repintar);
    }

    // **A prévia liga e desliga sem tocar no rascunho.** É o que a separa de
    // descartar: uma é sobre o que você vê, a outra é sobre o que existe.
    if (evento.nome === 'marca' && evento.chave === 'previa') {
      previaLigada = evento.valor === true;
      return aplicar(temaDaSessao())
        .catch(erro => { aviso = erro.message || String(erro); })
        .then(() => repintarTudo(repintar));
    }

    if (evento.nome === 'campo' || evento.nome === 'escolha' || evento.nome === 'cor') {
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
      // A prévia é local: aplicar aqui não escreve nada no servidor.
      return aplicar(temaDaSessao())
        .catch(erro => { aviso = erro.message || String(erro); })
        .then(() => repintarTudo(repintar));
    }

    if (evento.nome !== 'botao') return null;

    if (evento.chave === 'abrir-aparencia') return abrirAparencia();

    if (evento.chave.startsWith('preset-')) {
      const preset = PRESETS.find(p => p.id === evento.chave.slice('preset-'.length));
      if (!preset) return null;
      rascunho = { ...(ultimo?.theme ?? {}), ...preset.tema };
      aviso = '';
      return aplicar(temaDaSessao())
        .catch(erro => { aviso = erro.message || String(erro); })
        .then(() => repintarTudo(repintar));
    }

    if (evento.chave === 'descartar') {
      rascunho = null;
      aviso = '';
      return aplicar(temaDaSessao())
        .catch(erro => { aviso = erro.message || String(erro); })
        .then(() => repintarTudo(repintar));
    }

    if (canal === null) return null;
    const feito = evento.chave === 'gravar' ? gravar(canal)
      : evento.chave === 'restaurar' ? restaurar(canal)
        : null;
    // A recusa do servidor — contraste, permissão, revisão trocada — vira a
    // linha de aviso desta página, e não um erro que ninguém lê.
    return feito?.then(
      async () => {
        await repintarTudo(repintar);

      },
      async erro => {
        aviso = erro.message || String(erro);
        await repintarTudo(repintar);
      },
    ) ?? null;
  },
);
