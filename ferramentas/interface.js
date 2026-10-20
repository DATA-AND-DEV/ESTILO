// Executado exclusivamente no executor do MOD. Cada pacote inclui sua cópia.
//
// A casca dos MODs oficiais: o que os três fazem igual, num lugar só.
//
// # O que mudou com a API 6
//
// A casca da API 4 ainda sabia três coisas que a 6 tirou do MOD:
//
// - **a região**, a faixa de 240 px. A API 6 não a tem (`regiao` saiu das
//   capacidades), e nenhum dos oficiais a pintava;
// - **o retrato inteiro**, por `SeeleMods.snapshot`, que levava ao MOD o
//   veredito de conexão segura e os aparelhos da máquina. Na 6 o MOD lê um
//   retrato projetado (`SeeleUI.retrato`) e assina eventos;
// - **o laço**: uma consulta ao servidor a cada poucos segundos, porque não
//   havia outro jeito de saber que um dado mudou. Na 6 a metade de servidor
//   avisa as janelas (`mundo.avisar`), e a janela recebe o evento `servidor`.
//
// O que ficou é o que a 4 já tinha: as formas, as superfícies, as
// contribuições, o pedido ao servidor e o aviso curto.
function interfaceMod(id, titulo) {
  const api = globalThis.SeeleMods, ui = globalThis.SeeleUI;
  if (!api || !ui || !ui.superficies || !ui.contribuicoes) throw new Error('Este MOD exige a API 6 do SEELE.');

  // ---- as formas ----
  const texto = dentro => ({ forma: 'texto', dentro: String(dentro ?? '') });
  const cabecalho = dentro => ({ forma: 'titulo', dentro: String(dentro ?? '') });
  const lista = itens => ({ forma: 'lista', dentro: itens.map(dentro => ({ forma: 'item', dentro: String(dentro) })) });
  const campo = (chave, rotulo, valor, extra) => ({ forma: 'campo', chave, rotulo, valor: String(valor ?? ''), ...extra });
  const escolha = (chave, rotulo, valor, opcoes, extra) => ({ forma: 'escolha', chave, rotulo, valor: String(valor ?? ''), opcoes, ...extra });
  const botao = (chave, dentro, desligado = false, extra) => ({ forma: 'botao', chave, dentro: String(dentro), desligado, ...extra });
  const linha = (dentro, estilo) => ({ forma: 'linha', dentro, ...(estilo ? { estilo } : {}) });

  // ---- a composição ----
  //
  // **`estilo` e `extra` são argumentos separados, e isso não é arrumação.**
  // `classe`, `chave` e `nomeAcessivel` são do **nó**; `fundo` e `intervalo`
  // são do estilo dele. Misturá-los num objeto só faria `classe: 'editor'`
  // virar uma propriedade de estilo que o validador do produto recusa.
  const caixa = (dentro, estilo, extra) => ({ forma: 'caixa', dentro, ...(estilo ? { estilo } : {}), ...extra });
  const pilha = (dentro, estilo, extra) => ({ forma: 'pilha', dentro, ...(estilo ? { estilo } : {}), ...extra });
  const grade = (dentro, estilo, extra) => ({ forma: 'grade', dentro, ...(estilo ? { estilo } : {}), ...extra });
  const rolagem = (dentro, estilo, extra) => ({ forma: 'rolagem', dentro, ...(estilo ? { estilo } : {}), ...extra });
  const separador = (estilo, extra) => ({ forma: 'separador', ...(estilo ? { estilo } : {}), ...extra });
  const espaco = (estilo, extra) => ({ forma: 'espaco', ...(estilo ? { estilo } : {}), ...extra });

  // ---- os controles ----
  //
  // Os campos aceitam, em `extra`, o que o formulário da 6 declara: `inicial`
  // (o valor gravado, para o produto saber o que mudou), `erro` e as regras
  // (`obrigatorio`, `minimo`, `maximo`, `tamanhoMaximo`, `inteiro`). A marca e
  // o interruptor também: eles sujam a superfície como os outros, e um que o
  // MOD remonta com outro valor declara o `inicial`, ou o produto compara com
  // o da primeira montagem.
  const formulario = (chave, dentro, extra) => ({ forma: 'formulario', chave, dentro, ...extra });
  const acoes = (dentro, fixas = false) => ({ forma: 'acoes', dentro, ...(fixas ? { fixas: true } : {}) });
  const abas = (chave, valor, dentro) => ({ forma: 'abas', chave, valor, dentro });
  const aba = (chave, rotulo, dentro) => ({ forma: 'aba', chave, rotulo, dentro });
  const textoLongo = (chave, rotulo, valor, extra) => ({ forma: 'textoLongo', chave, rotulo, valor: String(valor ?? ''), ...extra });
  const numero = (chave, rotulo, valor, extra) => ({ forma: 'numero', chave, rotulo, valor, ...extra });
  const deslizante = (chave, rotulo, valor, extra) => ({ forma: 'deslizante', chave, rotulo, valor, ...extra });
  const marca = (chave, rotulo, valor, extra) => ({ forma: 'marca', chave, rotulo, valor: valor === true, ...extra });
  const interruptor = (chave, rotulo, valor, extra) => ({ forma: 'interruptor', chave, rotulo, valor: valor === true, ...extra });
  const cor = (chave, rotulo, valor, extra) => ({ forma: 'cor', chave, rotulo, valor: String(valor ?? '#000000'), ...extra });
  const retrato = (chave, extra) => ({ forma: 'retrato', chave, ...extra });
  const distintivo = (dentro, estilo) => ({ forma: 'distintivo', dentro, ...(estilo ? { estilo } : {}) });
  const link = (chave, dentro, endereco) => ({ forma: 'link', chave, dentro: String(dentro), endereco });
  const arquivo = (chave, dentro, extra) => ({ forma: 'arquivo', chave, dentro: String(dentro), ...extra });
  const midia = (chave, extra) => ({ forma: 'midia', chave, ...extra });

  /**
   * Escreve no registro de quem hospeda, **quando há registro**.
   *
   * O `console` do executor nativo existe desde a v0.15.1 do SEELE, e um
   * `console.error` num caminho de erro onde ele não existia virava
   * `ReferenceError` e derrubava justamente o que ele só queria contar.
   */
  const anotar = (nivel, mensagem) => {
    try { globalThis.console?.[nivel]?.(mensagem); } catch { /* sem registro, não há a quem dizer */ }
  };

  /**
   * Um pedido à metade de servidor deste MOD.
   *
   * O canal `0` é o escopo de servidor (`contexto.canal` chega `null` ao
   * `aoPedir`): um dado que é do servidor inteiro, como o tema ou o perfil, vai
   * por ele; um dado que é de um canal, com o canal.
   *
   * A recusa vira um `Error` com a frase de `error`. Quando ela é de campos, os
   * `erros` dela (a `chave` do controle e o motivo, a forma combinada entre os
   * MODs oficiais) vão presos no erro, para o formulário pô-los nos campos.
   */
  async function request(canal, valor) {
    const resposta = await api.request(id, canal, valor);
    if (!resposta?.ok) {
      const falha = new Error(resposta?.error || 'O servidor recusou a consulta.');
      if (resposta?.erros && typeof resposta.erros === 'object') falha.erros = resposta.erros;
      throw falha;
    }
    return resposta;
  }

  /** Uma atualização em voo e apenas o estado mais recente aguardando. */
  function agruparAtualizacoes(atualizar) {
    let emVoo = null;
    let proxima = null;
    return (...args) => {
      proxima = args;
      if (!emVoo) {
        emVoo = Promise.resolve().then(async () => {
          while (proxima) {
            const atuais = proxima;
            proxima = null;
            await atualizar(...atuais);
          }
        }).finally(() => { emVoo = null; });
      }
      return emVoo;
    };
  }

  // ---- as superfícies ----
  //
  // Reabrir **não recria**: chamar com o mesmo `id` mostra a que já existe, e o
  // que estava escrito nos campos dela continua lá.
  const superficie = descricao => ui.superficies.criar(descricao);
  const pagina = (chaveDaTela, titulo, extra) => superficie({ id: chaveDaTela, tipo: 'pagina', titulo, ...extra });
  const folha = (chaveDaTela, titulo, extra) => superficie({ id: chaveDaTela, tipo: 'folha', titulo, ...extra });
  const dialogo = (chaveDaTela, titulo, extra) => superficie({ id: chaveDaTela, tipo: 'dialogo', modal: true, titulo, ...extra });

  /** Um aviso curto. A fila dele tem fim. */
  const avisar = (mensagem, tom) => ui.superficies.avisar(mensagem, tom);

  /** Registra uma contribuição e devolve o handle que a revoga. */
  const contribuir = pedido => ui.contribuicoes.registrar(pedido);
  const revogar = handle => ui.contribuicoes.revogar(handle);

  /**
   * Uma entrada na navegação do servidor: o gesto que abre a atividade. Sem
   * ela, desenhar ao conectar seria a única forma de existir.
   */
  const entrada = (rotulo, acao = 'abrir', extra) => contribuir({
    ponto: 'servidor.navegacao',
    modo: 'adicionar',
    rotulo,
    acaoPrincipal: acao,
    ...extra,
  });

  /**
   * Diz alguma coisa a quem está olhando, **sem ocupar a sessão**: um aviso,
   * que sai sozinho. A falha é dita, e não mandada para lugar nenhum.
   */
  const dizer = (mensagem, tom = 'normal') => avisar(mensagem, tom).then(() => {}, () => {});

  /**
   * Liga o MOD à janela, **sem laço**.
   *
   * - `aoComecar()` roda uma vez, quando o MOD sobe;
   * - `aoServidor(carga, evento)` roda a cada aviso da metade de servidor
   *   (`mundo.avisar`), que é o que a consulta em laço fazia por adivinhação;
   * - `aoEvento(evento)` recebe o resto: os controles, as superfícies, o
   *   `tema`, os eventos da tela.
   *
   * O erro de qualquer um deles fica com o MOD, e é dito em vez de sumir.
   */
  function iniciar({ aoComecar, aoServidor, aoEvento } = {}) {
    const falhou = erro => void dizer('Falhou: ' + (erro?.message || String(erro)), 'erro');
    const tratar = talvez => {
      if (talvez && typeof talvez.catch === 'function') talvez.catch(falhou);
    };
    ui.aoEvento(evento => {
      try {
        if (evento?.nome === 'servidor') {
          if (aoServidor) tratar(aoServidor(evento.carga, evento));
          return;
        }
        if (aoEvento) tratar(aoEvento(evento));
      } catch (erro) {
        falhou(erro);
      }
    });
    try {
      if (aoComecar) tratar(aoComecar());
    } catch (erro) {
      falhou(erro);
    }
  }

  return {
    texto, cabecalho, lista, campo, escolha, botao, linha, arquivo, midia,
    caixa, pilha, grade, rolagem, separador, espaco,
    formulario, acoes, abas, aba, textoLongo, numero, deslizante,
    marca, interruptor, cor, retrato, distintivo, link,
    request, iniciar, dizer, anotar, agruparAtualizacoes,
    superficie, pagina, folha, dialogo, avisar,
    contribuir, revogar, entrada,
  };
}
