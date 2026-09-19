/* Gerado por ferramentas/build.mjs. API 3. */
(() => {
"use strict";
// Executado exclusivamente no executor do MOD. Cada pacote inclui sua cópia.
//
// A casca dos MODs oficiais: o que os três fazem igual, num lugar só.
//
// # O que mudou com a API 3 completa
//
// A versão anterior sabia **redesenhar por relógio** e nada mais: perguntava ao
// servidor a cada quatro segundos e mostrava a resposta. Um MOD assim é uma tela
// de leitura, e foi nisso que os três oficiais viraram depois da migração.
//
// Agora ela sabe três coisas a mais:
//
// - **receber evento.** `SeeleUI.aoEvento` traz o que a pessoa fez — digitou,
//   escolheu, apertou, arrastou — sem que o MOD tenha perguntado;
// - **redesenhar na hora.** Um evento muda o estado local e a tela acompanha
//   imediatamente, em vez de esperar o próximo relógio;
// - **guardar rascunho.** O que está sendo editado **não** é sobrescrito pela
//   resposta do servidor. Sem isso, digitar durante um ciclo de quatro segundos
//   perderia o que foi digitado — e o produto preservar o foco não bastaria: o
//   foco ficaria numa caixa cujo valor o próprio MOD acabou de trocar.
function interfaceMod(id, titulo, intervalo = 4000) {
  const api = globalThis.SeeleMods, ui = globalThis.SeeleUI;
  if (!api || !ui) throw new Error('Este MOD exige a API 3 do SEELE.');

  const texto = dentro => ({ forma: 'texto', dentro: String(dentro ?? '') });
  const cabecalho = dentro => ({ forma: 'titulo', dentro: String(dentro ?? '') });
  const lista = itens => ({ forma: 'lista', dentro: itens.map(dentro => ({ forma: 'item', dentro: String(dentro) })) });
  const campo = (chave, rotulo, valor) => ({ forma: 'campo', chave, rotulo, valor: String(valor ?? '') });
  const escolha = (chave, rotulo, valor, opcoes) => ({ forma: 'escolha', chave, rotulo, valor: String(valor ?? ''), opcoes });
  const botao = (chave, dentro, desligado = false) => ({ forma: 'botao', chave, dentro: String(dentro), desligado });
  const linha = dentro => ({ forma: 'linha', dentro });

  const canalDe = snapshot => {
    const id = snapshot.open_channel ?? snapshot.channels?.[0]?.id;
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  };

  async function request(canal, valor) {
    const resposta = await api.request(id, canal, valor);
    if (!resposta?.ok) throw new Error(resposta?.error || 'O servidor recusou a consulta.');
    return resposta;
  }

  // O último canal visto, para um evento saber a quem falar sem perguntar de
  // novo: `snapshot` é uma ida à ponte, e um arraste não pode pagar uma por
  // quadro.
  let canalAtual = null;
  let pintando = false;
  let pendente = null;

  /**
   * Uma pintura de cada vez, e **nenhuma perdida**.
   *
   * Dois `regiao` em voo chegariam fora de ordem, e o desenho de trás apagaria
   * o da frente — por isso a segunda espera. Mas a primeira versão **descartava**
   * a segunda, e dois eventos seguidos (escolher a densidade e a fonte, no mesmo
   * quadro) perdiam o desenho do segundo: a tela ficava mostrando a escolha
   * anterior, e só o relógio a corrigia, quatro segundos depois.
   *
   * Guardar a última e pintá-la ao fim da que está em voo é o que resolve. É a
   * mesma forma do aviso que chega durante uma colheita: o que não cabe agora
   * não se joga fora, fica marcado.
   */
  const desenhar = async partes => {
    if (pintando) { pendente = partes; return; }
    pintando = true;
    try {
      let atual = partes;
      for (;;) {
        pendente = null;
        await ui.regiao([cabecalho(titulo), ...atual]);
        if (!pendente) return;
        atual = pendente;
      }
    } finally {
      pintando = false;
    }
  };

  function iniciar(consultar, semCanal = async () => {}, aoEvento = null) {
    /**
     * Redesenha com o que o estado local diz **agora**.
     *
     * É o que um evento chama. Ele não vai ao servidor: quem digita espera a
     * letra aparecer, e não esperar a rede.
     */
    const repintar = partes => { void desenhar(partes); };

    if (aoEvento) {
      ui.aoEvento(evento => {
        // O erro do MOD fica com o MOD, e é dito na região em vez de sumir.
        try {
          const talvez = aoEvento(evento, canalAtual, repintar);
          if (talvez && typeof talvez.catch === 'function') {
            talvez.catch(erro => void desenhar([texto('Falhou: ' + (erro.message || String(erro)))]));
          }
        } catch (erro) {
          void desenhar([texto('Falhou: ' + (erro.message || String(erro)))]);
        }
      });
    }

    async function atualizar() {
      try {
        const snapshot = await api.snapshot(), canal = canalDe(snapshot);
        canalAtual = canal;
        if (canal === null) {
          await semCanal();
          await desenhar([texto('Entre em um servidor com um canal de texto.')]);
        } else {
          const resultado = await consultar(snapshot, canal);
          // Não apresente uma resposta do canal anterior após a navegação.
          if (canalDe(await api.snapshot()) === canal) await desenhar(resultado);
          else await desenhar([texto('Canal alterado. Atualizando…')]);
        }
      } catch (erro) {
        try { await desenhar([texto('Não foi possível atualizar: ' + (erro.message || String(erro)))]); }
        catch (falha) { console.error(titulo + ': ' + (falha.message || String(falha))); }
      } finally {
        // Agenda depois de concluir: nunca sobrepõe consultas nem repete
        // escritas. O SEELE encerra o executor e seus temporizadores ao sair.
        setTimeout(atualizar, intervalo);
      }
    }
    void atualizar();
  }

  return { texto, cabecalho, lista, campo, escolha, botao, linha, request, iniciar, desenhar };
}

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
// Arredondamento e brilho continuam sem token no produto. Eles são
// **preservados** no servidor: este MOD os devolve como vieram, e não os zera
// por não saber editá-los.

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

})();
