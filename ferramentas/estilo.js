// O ESTILO: a aparência do servidor, escolhida aqui e aplicada pelo SEELE.
//
// # O que a API 6 mudou
//
// Na API 4 este cliente aplicava o tema publicado em cada sessão, consultando o
// servidor a cada quatro segundos para saber se ele tinha mudado. Na 6 o tema
// é **dado do servidor**: a metade de servidor o declara (`mundo.tema`), o
// servidor o guarda e o manda a quem entra, e o produto o aplica antes de
// desenhar a sessão. Este cliente não aplica tema publicado nenhum.
//
// O que sobra para ele é o editor: uma entrada «Aparência do servidor», um
// diálogo com seletores, amostras e conjuntos, e a **prévia** de quem edita,
// que é do produto (`SeeleUI.tema(valores, { previa: true })`): vale só nesta
// máquina, com o selo «prévia não publicada», e sai quando o diálogo fecha.
//
// O que o produto fez com o tema chega pelo evento `tema` — aplicado, recusado
// com os pares, ou o desenho do SEELE por escolha de quem vê —, e é dele que
// sai a frase da página, e não de uma suposição sobre o que ele teria feito.

const {
  texto, botao, escolha,
  caixa, pilha, grade, separador, espaco,
  acoes, abas, aba, cor, interruptor, distintivo,
  request, iniciar, dizer, dialogo, entrada, revogar, agruparAtualizacoes,
} = interfaceMod('seele/estilo', 'ESTILO');

/** A superfície do editor. */
const ID = 'estilo-aparencia';

/** As seis cores, na ordem em que fazem sentido de cima para baixo. */
const CORES = [
  ['background', 'FUNDO'],
  ['panel', 'PAINEL'],
  ['text', 'TEXTO'],
  ['muted', 'TEXTO APAGADO'],
  ['accent', 'DESTAQUE'],
  ['border', 'BORDA'],
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

/** Os campos de cada aba, para uma recusa ir à aba dos campos dela. */
const CAMPOS_DA_ABA = {
  cores: CORES.map(([chave]) => chave),
  forma: ['density', 'font', 'radius', 'glow'],
};

/**
 * Conjuntos prontos, para quem não quer escolher seis cores.
 *
 * Um conjunto é a decisão já tomada, e continua editável depois — não é um
 * modo, é um ponto de partida.
 */
const PRESETS = [
  {
    id: 'seele',
    nome: 'SEELE',
    // O mesmo padrão do servidor, que é o com que o SEELE abre.
    tema: {
      background: '#050403', panel: '#0a0806', text: '#eae3cf',
      muted: '#908574', accent: '#f2521f', border: '#241f19',
      density: 'comfortable', font: 'mono', radius: 0, glow: false,
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

/**
 * O modo do fundo, pela conta do produto (`modo_do_fundo`): claro de 0,18 de
 * luminância relativa para cima. O produto recusa um modo que discorda do
 * fundo, e por isso ele não é escolha: ele vem do fundo.
 */
function modoDoFundo(fundo) {
  const canal = i => {
    const c = parseInt(String(fundo).slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5) >= 0.18 ? 'claro' : 'escuro';
}

/** O tema na forma da API 6, a partir dos nomes que o servidor guarda. */
const paraOProduto = tema => ({
  fundo: tema.background,
  painel: tema.panel,
  texto: tema.text,
  apagado: tema.muted,
  acento: tema.accent,
  borda: tema.border,
  densidade: tema.density === 'comfortable' ? 'confortavel' : 'compacta',
  fonte: tema.font === 'sans' ? 'sans' : 'mono',
  // Número e booleano, e não texto: a API confere o intervalo e o tipo.
  arredondamento: Number(tema.radius) || 0,
  brilho: tema.glow === true,
  modo: modoDoFundo(tema.background),
});

/**
 * O campo do ESTILO de cada cor que o produto nomeia num par.
 *
 * As cores que a casca deriva não têm campo, e vão ao campo que as move:
 *
 * - o fundo do destaque (`acentoFraco`) sai do destaque;
 * - as cores de estado do produto (`fosforo`, `azul`, `vermelho`) e o segundo
 *   apagado (`apagadoSecundario`) saem das superfícies. A casca as recusa
 *   quando nenhuma luminosidade serve ao fundo e ao painel juntos, e o par só
 *   diz o painel: o fundo vai pelo lado da frente.
 *
 * Os nomes são os de `tema.cores-de-estado` no contrato, e só eles.
 */
const CAMPO_DO_TOKEN = {
  fundo: 'background', painel: 'panel', texto: 'text', apagado: 'muted', acento: 'accent', borda: 'border',
  acentoFraco: 'accent',
  fosforo: 'background', azul: 'background', vermelho: 'background', apagadoSecundario: 'background',
};

const NOME_DO_TOKEN = {
  fundo: 'o fundo', painel: 'o painel', texto: 'texto', apagado: 'texto apagado', acento: 'destaque', borda: 'borda',
  acentoFraco: 'o fundo do destaque',
  fosforo: 'o fósforo do SEELE', azul: 'o azul do SEELE', vermelho: 'o vermelho do SEELE',
  apagadoSecundario: 'o texto apagado secundário do SEELE',
};

const numeroDito = n => String(Number(n)).replace('.', ',');

/** Um par recusado em palavras: «texto sobre o fundo dá 2,1:1, e precisa de 4,5:1». */
const fraseDoPar = ({ frente, fundo, razao, piso }) =>
  `${NOME_DO_TOKEN[frente] ?? frente} sobre ${NOME_DO_TOKEN[fundo] ?? fundo} dá ${numeroDito(razao)}:1, `
  + `e precisa de ${numeroDito(piso)}:1`;

/** Os pares recusados como `erros` por campo: cada lado no seu. */
function errosDosPares(pares) {
  const erros = {};
  for (const par of pares) {
    for (const lado of [par.frente, par.fundo]) {
      const campo = CAMPO_DO_TOKEN[lado];
      if (campo && !(campo in erros)) erros[campo] = fraseDoPar(par);
    }
  }
  return erros;
}

// ------------------------------------------------------------- o estado

/** O que o servidor disse por último (`view`), com `canEdit`. */
let ultimo = null;
/** O que está sendo editado, ou nada. Separado do que o servidor diz. */
let rascunho = null;
/** A prévia está ligada? Desligá-la mostra o tema publicado e guarda o rascunho. */
let previaLigada = true;
/** O produto tem uma prévia deste MOD de pé? */
let previaAplicada = false;
/** A aba aberta na página. */
let abaAberta = 'cores';
/** O punho do diálogo. */
let tela = null;
/** A entrada de navegação: `{ handle, podeEditar }`. */
let aEntrada = null;
/** A última recusa da entrada que foi dita, para não repeti-la. */
let entradaRecusada = '';
/** O recado da página: «publicando…», uma recusa, outra pessoa publicou. */
let aviso = '';
/** O pedido de escrita na rede — `'gravar'` ou `'restaurar'` —, ou nada. */
let escrevendo = '';
/** A maior revisão avisada enquanto uma escrita estava na rede. */
let avisoPendente = -1;
/** O último evento `tema`: o que o produto fez, e não o que se supõe. */
let desfecho = null;
/** As chaves com erro na página, para limpá-las na próxima mudança. */
let comErro = false;
/** O que atravessou a ponte por último, para não mandar a mesma página. */
let montado = null;
let sujaMontada = null;

/** O tema que a tela mostra: o rascunho, se há um; senão, o do servidor. */
const emEdicao = () => rascunho ?? ultimo?.theme ?? null;
const mudou = () => rascunho !== null && JSON.stringify(rascunho) !== JSON.stringify(ultimo?.theme);
const podeEditar = () => ultimo?.canEdit === true;

/**
 * O rascunho levado para cima de uma revisão que outra pessoa publicou: o que
 * esta pessoa não tocou passa a ser o da revisão nova, e o que ela tocou
 * continua dela.
 */
function sobreARevisaoNova(meu, base, novo) {
  const resultado = { ...novo };
  for (const chave of Object.keys(meu)) {
    if (meu[chave] !== base?.[chave]) resultado[chave] = meu[chave];
  }
  return resultado;
}

/** Guarda o que o servidor disse, levando o rascunho junto se a revisão andou. */
function guardarEstado(estado) {
  // Só para a frente: uma resposta atrasada não é outra pessoa publicando.
  if (rascunho && ultimo && estado.revision > ultimo.revision) {
    rascunho = sobreARevisaoNova(rascunho, ultimo.theme, estado.theme);
    aviso = 'Outra pessoa publicou a revisão ' + estado.revision + ' enquanto você editava. '
      + 'O que você não tinha mudado passou a ser o dela; o que você mudou continua seu.';
  }
  ultimo = estado;
}

// ------------------------------------------------------------ as amostras

/** Uma amostra de cor: o quadrado na cor, e a borda do tema em vigor. */
const amostraDeCor = (valor, tamanho = 28) => caixa([], {
  largura: tamanho,
  altura: tamanho,
  fundo: valor,
  borda: { largura: 1, cor: { tema: 'borda' } },
  raio: 0,
}, { nomeAcessivel: 'Amostra de cor ' + valor });

/**
 * Como a conversa vai ficar: um pedaço de tela desenhado com o tema escolhido.
 *
 * **As cores daqui são literais, e de propósito**: elas são o rascunho, e não
 * o tema em vigor. Todo o resto da página cita o tema (`{ tema: … }`).
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
        cor: tema.accent, borda: { largura: 1, cor: tema.accent }, preenchimento: 6, raio: Number(tema.radius) || 0, corpo: 11,
      }),
      caixa(['OUTRO'], {
        cor: tema.muted, borda: { largura: 1, cor: tema.border }, preenchimento: 6, raio: Number(tema.radius) || 0, corpo: 11,
      }),
    ], { direcao: 'linha', intervalo: 8 }),
  ], {
    fundo: tema.panel,
    borda: { largura: 1, cor: tema.border },
    preenchimento: 12,
    intervalo: 10,
    raio: Number(tema.radius) || 0,
    ...(tema.glow ? { sombra: { x: 0, y: 0, desfoque: 12, cor: tema.accent + '66' } } : {}),
  }, { nomeAcessivel: 'Amostra da conversa' });
}

// -------------------------------------------------------------- a página

/** O valor gravado de um campo, como o controle o mostra. */
const inicialDe = chave => {
  const t = ultimo?.theme ?? {};
  if (chave === 'radius') return String(t.radius ?? 0);
  if (chave === 'glow') return t.glow ? 'sim' : 'nao';
  return String(t[chave] ?? '');
};

function aAbaDeCores(tema) {
  return [
    caixa(['Seis cores, e o que decide se a conversa se lê é a relação entre '
      + 'elas. A amostra acima responde a cada troca.'],
    { corpo: 12, opacidade: 0.7, entrelinha: 1.45, larguraMaxima: 620 }),
    // Duas colunas num diálogo largo; uma, num contêiner estreito (o celular).
    grade(CORES.map(([chave, rotulo]) => cor(chave, rotulo, tema[chave], { inicial: inicialDe(chave) })),
      { colunas: 2, intervalo: 20 }, { classe: 'duas-colunas' }),
  ];
}

function aAbaDeForma(tema) {
  return [
    caixa(['Espaçamento, tipo e cantos. O SEELE abre em canto reto e sem '
      + 'sombra; um tema de servidor pode levantar os dois. A densidade vale '
      + 'para o que os MODs desenham.'], { corpo: 11, opacidade: 0.75 }),
    grade([
      escolha('density', 'DENSIDADE', tema.density, DENSIDADES, { inicial: inicialDe('density') }),
      escolha('font', 'FONTE', tema.font, FONTES, { inicial: inicialDe('font') }),
      escolha('radius', 'ARREDONDAMENTO', String(tema.radius ?? 0), RAIOS, { inicial: inicialDe('radius') }),
      escolha('glow', 'BRILHO', tema.glow ? 'sim' : 'nao', BRILHOS, { inicial: inicialDe('glow') }),
    ], { colunas: 2, intervalo: 20 }, { classe: 'duas-colunas' }),
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
      acoes([botao('preset-' + preset.id, 'USAR ESTE', eOMesmoConjunto(preset, tema))]),
    ], {
      intervalo: 8,
      preenchimento: 12,
      borda: { largura: 1, cor: { tema: 'borda' } },
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
    consultas: [{ ateLargura: 560, estilo: { colunas: 1 } }],
  },
  presets: {
    base: {},
    consultas: [
      { ateLargura: 900, estilo: { colunas: 2 } },
      { ateLargura: 560, estilo: { colunas: 1 } },
    ],
  },
};

/** Um título de grupo, no apagado do tema em vigor. */
function grupo(nome) {
  return caixa([nome], {
    familia: 'sans', peso: 'forte', corpo: 13, espacamento: 1, transformar: 'maiuscula', cor: { tema: 'apagado' },
  });
}

/** O que o servidor disse sobre a redeclaração do tema depois da subida. */
function aDeclaracao() {
  const erro = ultimo?.declaracao?.erro;
  if (!erro) return [];
  const porque = erro === 'tema-de-outro-mod'
    ? 'a aparência deste servidor é de outro MOD; quem administra escolhe qual na gestão de MODs'
    : 'o SEELE recusou (' + erro + ')';
  return [caixa(['O tema publicado não chegou ao servidor: ' + porque + '.'], { corpo: 11, cor: { tema: 'acento' } })];
}

function aPagina() {
  if (!ultimo) return [texto('Consultando o tema do servidor…')];
  const tema = emEdicao();

  // **Quem não administra recebe o tema, e não um formulário.**
  if (!podeEditar()) {
    return [
      caixa([ultimo.enabled
        ? 'Este é o tema deste servidor. Ele vale enquanto você está aqui.'
        : 'Este servidor não tem tema compartilhado ligado. A sua aparência '
          + 'pessoal do SEELE continua valendo.'], { opacidade: 0.85 }),
      // A amostra de um tema desligado mostraria cores que ninguém vê.
      ...(ultimo.enabled ? [aAmostraDaConversa(ultimo.theme)] : []),
      caixa(['Quem administra este servidor pode mudá-lo. Revisão ' + ultimo.revision + '.'],
        { corpo: 11, opacidade: 0.7 }),
      ...oResultadoDaAplicacao(),
    ];
  }

  // **Publicar também é ligar**: com o tema desligado, o que está guardado não
  // está em vigor, e dizer PUBLICADO sobre ele seria dizer o contrário.
  const publicavel = mudou() || !ultimo.enabled;

  return [
    pilha([
      caixa([
        grupo('Como a conversa fica'),
        ...(mudou() ? [distintivo(['NÃO PUBLICADO'],
          { borda: { largura: 1, cor: { tema: 'acento' } }, cor: { tema: 'acento' }, corpo: 10 })] : []),
      ], { direcao: 'linha', alinhar: 'fim', distribuir: 'entre', intervalo: 12, quebra: 'sim' }),
      aAmostraDaConversa(tema),
      caixa([
        // **Ver ou não a prévia não é alteração**: o inicial é o próprio valor.
        // Sem ele, o produto compara com o da primeira montagem, e desligar a
        // prévia faria fechar perguntar «fechar sem gravar?» por nada.
        interruptor('previa', 'VER SÓ NA MINHA SESSÃO', previaLigada, { inicial: previaLigada }),
        caixa([previaLigada
          ? 'O que você escolher aparece só para você até publicar.'
          : 'Você está vendo o tema publicado, e não o que está editando.'],
        { corpo: 11, opacidade: 0.7, crescer: 1, base: 0, larguraMinima: 200 }),
      ], { direcao: 'linha', alinhar: 'centro', intervalo: 12, quebra: 'sim' }),
      ...(ultimo.enabled ? [] : [caixa(['O tema compartilhado está desligado: quem entra vê a '
        + 'aparência padrão do SEELE. Publicar liga este tema para todo mundo.'],
      { corpo: 11, opacidade: 0.85 })]),
    ], { intervalo: 14 }),

    separador(),

    // **Só o conteúdo da aba aberta atravessa a ponte**: as três juntas não
    // cabiam numa mensagem de 12 KiB.
    abas('aba', abaAberta, [
      aba('cores', 'CORES', abaAberta === 'cores' ? aAbaDeCores(tema) : []),
      aba('forma', 'FORMA', abaAberta === 'forma' ? aAbaDeForma(tema) : []),
      aba('presets', 'CONJUNTOS', abaAberta === 'presets' ? aAbaDePresets(tema) : []),
    ]),

    ...aDeclaracao(),
    ...(aviso ? [caixa([aviso], { corpo: 11, cor: { tema: 'acento' } })] : []),
    ...oResultadoDaAplicacao(),

    acoes([
      // O produto pergunta com as palavras dele, e o `botao` só chega depois
      // do sim.
      botao('restaurar', 'RESTAURAR PADRÃO', Boolean(escrevendo), {
        variante: 'discreta',
        confirmar: 'Isto muda a aparência para todo mundo neste servidor: o tema volta ao padrão do SEELE e fica desligado.',
        ...(escrevendo === 'restaurar' ? { emProgresso: true } : {}),
      }),
      espaco(),
      botao('descartar', 'DESCARTAR', !mudou() || Boolean(escrevendo), { variante: 'discreta' }),
      botao('gravar', publicavel ? 'PUBLICAR PARA O SERVIDOR' : 'PUBLICADO', !publicavel || Boolean(escrevendo),
        { variante: 'primaria', ...(escrevendo === 'gravar' ? { emProgresso: true } : {}) }),
    ], true),
  ];
}

/**
 * O que o produto **fez**, pelo último evento `tema`: aplicado, recusado com
 * os pares, ou o desenho do SEELE por escolha de quem vê. Nada aqui é suposto.
 */
function oResultadoDaAplicacao() {
  if (!desfecho) return [];
  if (desfecho.estado === 'nativo') {
    return [caixa(['Nesta máquina, a aparência deste servidor está no desenho do SEELE, por escolha '
      + 'de quem usa (CONFIGURAÇÕES › MODS).'], { corpo: 11, opacidade: 0.7 })];
  }
  if (desfecho.estado === 'recusado') {
    return [caixa(['O SEELE recusou ' + (desfecho.previa ? 'a prévia' : 'o tema publicado') + ' nesta sessão: '
      + (desfecho.pares ?? []).map(fraseDoPar).join('; ') + '.'], { corpo: 11, cor: { tema: 'acento' } })];
  }
  const tema = desfecho.previa ? rascunho : (ultimo?.enabled ? ultimo.theme : null);
  if (!tema) return [];
  const valores = paraOProduto(tema);
  const partes = [
    valores.arredondamento ? 'arredondamento ' + valores.arredondamento + ' px' : 'cantos retos',
    valores.brilho ? 'com brilho' : 'sem brilho',
    valores.densidade === 'confortavel' ? 'densidade confortável' : 'densidade compacta',
    valores.fonte === 'sans' ? 'sem serifa' : 'monoespaçada',
    valores.modo === 'claro' ? 'modo claro' : 'modo escuro',
  ];
  return [caixa([(desfecho.previa ? 'Prévia nesta sessão: ' : 'Desenhado nesta sessão: ') + partes.join(' · ') + '.'],
    { corpo: 11, opacidade: 0.7 })];
}

// --------------------------------------------------------- montar a página

/** Manda a página só quando ela mudou; a sujeira, só quando muda. */
async function montarAPagina() {
  const alvo = tela;
  if (!alvo) return;
  const arvore = aPagina();
  const assinatura = JSON.stringify(arvore);
  if (assinatura !== montado) {
    await alvo.montar(arvore);
    montado = assinatura;
  }
  // **Suja é o que o MOD sabe**, além do que os campos mostram: o produto só vê
  // os campos da aba aberta, e um rascunho pode estar em outra.
  const suja = mudou();
  if (suja !== sujaMontada) {
    await alvo.suja(suja);
    sujaMontada = suja;
  }
}

const repintar = agruparAtualizacoes(() => montarAPagina());

/**
 * Põe os erros nos campos, na aba deles. O produto só marca o que está montado,
 * e recusa uma chave que não é de um campo à vista.
 */
async function marcarErros(erros) {
  if (!tela) return;
  const chaves = Object.keys(erros ?? {});
  const daAba = Object.keys(CAMPOS_DA_ABA).find(a => chaves.some(k => CAMPOS_DA_ABA[a].includes(k)));
  if (daAba && daAba !== abaAberta) {
    abaAberta = daAba;
    await repintar();
  }
  const aqui = Object.fromEntries(Object.entries(erros ?? {}).filter(([k]) => CAMPOS_DA_ABA[abaAberta]?.includes(k)));
  if (!Object.keys(aqui).length) return;
  comErro = true;
  await tela.formulario.erros(aqui);
}

async function limparErros() {
  if (!comErro || !tela) return;
  comErro = false;
  await tela.formulario.erros({});
}

// ---------------------------------------------------------------- a prévia

/** Tira a prévia deste MOD, se há uma. */
async function tirarPrevia() {
  if (!previaAplicada) return;
  previaAplicada = false;
  await SeeleUI.tema(null, { previa: true });
}

/**
 * Pede a prévia do rascunho ao produto, e devolve a recusa dele, se houver.
 *
 * A casca confere o que o servidor do ESTILO não confere — as cores de estado
 * que o produto deriva, por exemplo —, e uma recusa dela vai aos campos.
 */
async function pedirPrevia(tema) {
  try {
    await SeeleUI.tema(paraOProduto(tema), { previa: true, superficie: ID });
    previaAplicada = true;
    return null;
  } catch (falha) {
    if (falha?.erro === 'contraste' && Array.isArray(falha.pares)) {
      await marcarErros(errosDosPares(falha.pares));
      return falha.pares;
    }
    throw falha;
  }
}

/** A prévia que esta sessão deve ver agora: o rascunho, ou nenhuma. */
async function acertarAPrevia() {
  if (!tela || !podeEditar()) return;
  if (previaLigada && mudou()) await pedirPrevia(rascunho);
  else await tirarPrevia();
}

// ------------------------------------------------------- abrir e gravar

async function consultar() {
  guardarEstado(await request(0, { op: 'view' }));
  await registrarAEntrada();
}

/** A entrada da navegação, fora da barra de quem não edita. */
async function registrarAEntrada() {
  const pode = podeEditar();
  if (aEntrada && aEntrada.podeEditar === pode) return;
  if (aEntrada) {
    await revogar(aEntrada.handle);
    aEntrada = null;
  }
  try {
    const { handle } = await entrada('Aparência do servidor', 'abrir-aparencia', { listarNaBarra: pode });
    aEntrada = { handle, podeEditar: pode };
    entradaRecusada = '';
  } catch (erro) {
    // **A porta recusada é dita a quem está aqui**, uma vez por motivo.
    const motivo = erro?.message || String(erro);
    if (motivo !== entradaRecusada) {
      entradaRecusada = motivo;
      void dizer('O SEELE recusou a entrada «Aparência do servidor»: ' + motivo, 'erro');
    }
  }
}

async function abrirAparencia() {
  // **Um diálogo amplo, e não uma página**: escolher tema é uma tarefa curta e
  // focada. No celular o produto o põe na tela cheia. Fechar com um rascunho
  // não publicado pergunta antes: é o produto, para toda superfície suja.
  tela ??= await dialogo(ID, 'Aparência do servidor', { tamanho: { largura: 980 } });
  await tela.classes(CLASSES_DA_PAGINA);
  await consultar();
  // Abrir monta sempre: é a única volta em que o produto pode não ter a árvore.
  montado = null;
  sujaMontada = null;
  await montarAPagina();
  await tela.mostrar();
  await acertarAPrevia();
}

async function gravar() {
  const tema = emEdicao();
  if (!tema) return;
  // **Publicar só o que a casca aceita.** O servidor guarda e manda o tema a
  // todos, e cada janela confere os pares de novo: um tema que elas recusam
  // deixaria o servidor inteiro com a aparência padrão.
  const pares = await pedirPrevia(tema);
  if (pares) throw new Error('O SEELE recusa este tema: ' + pares.map(fraseDoPar).join('; ') + '.');
  aviso = 'publicando…';
  try {
    const resposta = await request(0, { op: 'save', revision: ultimo.revision, theme: tema });
    ultimo = resposta;
    rascunho = null;
    aviso = 'publicado para todo mundo neste servidor';
  } catch (falha) {
    if (falha.erros) await marcarErros(falha.erros);
    throw falha;
  } finally {
    // O tema publicado vem do servidor; a prévia não fica por cima dele.
    if (!previaLigada || !mudou()) await tirarPrevia();
  }
}

async function restaurar() {
  aviso = 'restaurando…';
  const resposta = await request(0, { op: 'reset', revision: ultimo.revision });
  ultimo = resposta;
  rascunho = null;
  aviso = 'restaurado ao padrão do SEELE';
  await tirarPrevia();
}

/** Uma escrita de cada vez; o aviso que chega no meio espera o fim dela. */
async function escrever(qual) {
  if (escrevendo) return;
  escrevendo = qual;
  void repintar();
  try {
    await (qual === 'gravar' ? gravar() : restaurar());
  } catch (erro) {
    aviso = erro.message || String(erro);
  } finally {
    escrevendo = '';
  }
  if (ultimo && avisoPendente > ultimo.revision) await consultar();
  avisoPendente = -1;
  await repintar();
}

// --------------------------------------------------------------- os eventos

iniciar({
  aoComecar: consultar,

  // **O aviso da metade de servidor**, no lugar da consulta de 4 s: ele traz a
  // revisão, e a janela só pede o estado se ela andou.
  aoServidor: async carga => {
    const revisao = Number(carga?.revision);
    if (!Number.isInteger(revisao) || !ultimo || revisao <= ultimo.revision) return;
    if (escrevendo) {
      avisoPendente = Math.max(avisoPendente, revisao);
      return;
    }
    await consultar();
    await acertarAPrevia();
    await repintar();
  },

  aoEvento: async evento => {
    if (evento.nome === 'acao') {
      if (evento.acao === 'abrir-aparencia') await abrirAparencia();
      return;
    }

    // O que o produto fez com o tema: o publicado ou a prévia.
    if (evento.nome === 'tema') {
      desfecho = { estado: evento.estado, previa: evento.previa === true, pares: evento.pares ?? [] };
      await repintar();
      return;
    }

    // **DESCARTAR E FECHAR**: o produto disse que o que não foi publicado
    // «será perdido».
    if (evento.nome === 'fechar' && evento.descartou === true && evento.superficie === ID) {
      rascunho = null;
      aviso = '';
      await tirarPrevia();
      await repintar();
      return;
    }
    if (evento.nome === 'fechar' || evento.nome === 'fechar-pedido') return;

    if (evento.nome === 'aba') {
      abaAberta = evento.valor;
      await repintar();
      return;
    }

    // A prévia liga e desliga sem tocar no rascunho.
    if (evento.nome === 'marca' && evento.chave === 'previa') {
      previaLigada = evento.valor === true;
      await acertarAPrevia();
      await repintar();
      return;
    }

    if (evento.nome === 'escolha' || evento.nome === 'cor') {
      rascunho = { ...(rascunho ?? ultimo?.theme ?? {}) };
      // A escolha devolve texto, e o servidor guarda número e booleano.
      rascunho[evento.chave] =
        evento.chave === 'radius' ? Number(evento.valor) || 0
          : evento.chave === 'glow' ? evento.valor === 'sim'
            : evento.valor;
      aviso = '';
      await limparErros();
      await acertarAPrevia();
      await repintar();
      return;
    }

    if (evento.nome !== 'botao') return;

    if (evento.chave.startsWith('preset-')) {
      const preset = PRESETS.find(p => p.id === evento.chave.slice('preset-'.length));
      if (!preset) return;
      rascunho = { ...(ultimo?.theme ?? {}), ...preset.tema };
      aviso = '';
      await limparErros();
      await acertarAPrevia();
      await repintar();
      return;
    }

    if (evento.chave === 'descartar') {
      rascunho = null;
      aviso = '';
      await limparErros();
      await tirarPrevia();
      await repintar();
      return;
    }

    if (evento.chave === 'gravar' || evento.chave === 'restaurar') await escrever(evento.chave);
  },
});
