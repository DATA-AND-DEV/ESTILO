// O laboratório, exercitado num navegador de verdade.
//
// # O que este arquivo passou a afirmar, e por que o que ele afirmava saiu
//
// Ele exigia que a região **não** tivesse `button` nem `input`:
//
//     assert.equal(await region.locator('img,button,input,script').count(), 0);
//
// Isso era verdade na API 2, quando um MOD só escrevia texto. Desde a API 3 a
// região tem botões e campos de propósito — é assim que alguém grava um perfil
// —, e desde a API 4 ela tem seletor de cor, abas e superfícies inteiras. A
// asserção continuava verde porque o laboratório ao lado estava quebrado e
// nunca chegava a montar nada; a auditoria de 20/09/2026 encontrou os dois.
//
// O que ele afirma agora é o contrato de hoje:
//
// - **o que o MOD desenha aparece**, e é montado pelo renderer do produto;
// - **os controles existem** — um MOD sem botão não seria utilizável;
// - **não há `script`** dentro do que o MOD declarou: a fronteira é essa, e ela
//   não mudou em nenhuma versão da API;
// - **não há endereço externo**: nenhuma forma da API carrega `src` de rede, e
//   é isso que impede a janela de quem conversa de buscar bytes de estranhos;
// - **sair solta tudo**, inclusive as superfícies e as contribuições.
//
// E, na API 6, o que é do ESTILO:
//
// - **o tema é do servidor**: pintado ao conectar, antes de qualquer gesto, e
//   levado a quem está olhando quando alguém publica;
// - **a prévia é da casca**: cada conjunto pronto passa pelos pisos da casca
//   de verdade, com o selo dela, e DESCARTAR e publicar a tiram;
// - **o aviso substitui o laço**: a revisão nova chega a quem só olha sem
//   consulta nenhuma em volta.
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'mod.json')));

/**
 * Uma volta inteira, numa largura: um laboratório novo, semeado do zero.
 *
 * **No desktop e a 390 px.** O ESTILO roda nas duas cascas, e o diálogo muda de
 * forma entre elas — as grades viram uma coluna, a amostra e os conjuntos
 * empilham. Uma volta só a 390 deixava o desktop sem nenhuma conferência.
 */
async function conferir({ largura, altura }) {
  const temp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'seele-lab-'));
  const pacote = path.join(temp, 'pacote');
  execFileSync(process.execPath, [path.join(__dirname, 'package.mjs'), pacote]);

  const filho = spawn(process.execPath, [path.join(__dirname, 'preview.cjs')], {
    env: { ...process.env, MOD_PORT: '0', MOD_PACKAGE: pacote },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let navegador;
  try {
    const url = await new Promise((resolve, reject) => {
      const prazo = setTimeout(() => reject(Error('Laboratório não iniciou')), 10000);
      filho.stdout.on('data', pedaco => {
        const m = String(pedaco).match(/http:\/\/127\.0\.0\.1:\d+/);
        if (m) { clearTimeout(prazo); resolve(m[0]); }
      });
      filho.stderr.on('data', pedaco => { clearTimeout(prazo); reject(Error(String(pedaco))); });
      filho.once('exit', codigo => { clearTimeout(prazo); reject(Error('Laboratório saiu: ' + codigo)); });
    });

    /** Uma escrita direta no servidor deste MOD, para semear o caso. */
    const chamar = async (corpo, pessoa = '1') => {
      const r = await (await fetch(url + '/pedido', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ servidor: 'a', pessoa, canal: 1, corpo }),
      })).json();
      assert.equal(r.ok, true, JSON.stringify(r));
      return r;
    };

    let esperado;
    if (manifest.id === 'seele/mesa') {
      let r = await chamar({ op: 'setup', name: 'Campanha do laboratório', system: 'free', gm: '1', revision: 0, nonce: 'a' });
      r = await chamar({ op: 'sheet-create', name: 'Iria <img src=x>', owner: '2', revision: r.campaign.revision, nonce: 'b' });
      await chamar({ op: 'sheet-create', name: 'Segredo do terceiro', owner: '3', revision: r.campaign.revision, nonce: 'c' });
      esperado = 'Campanha do laboratório';
    } else if (manifest.id === 'seele/perfis') {
      await chamar({
        op: 'save', revision: 0,
        profile: { displayName: 'Lia <img src=x>', pronouns: 'ela/dela', bio: 'Biografia preservada', status: 'Presente', accent: '#a78bfa', effect: 'aurora' },
      }, '2');
      esperado = 'Lia <img src=x>';
    } else {
      const r = await chamar({ op: 'view' });
      await chamar({ op: 'save', revision: 0, theme: { ...r.theme, accent: '#6bffb6' } });
      esperado = 'Tema deste servidor';
    }

    navegador = await chromium.launch({ headless: true });
    const aba = await navegador.newPage({ viewport: { width: largura, height: altura } });
    const erros = [];
    aba.on('pageerror', e => erros.push(e.message));
    await aba.goto(url + '/?pessoa=2');

    /** O acento que o tema em vigor escreveu em `#tela-sessao`, numa página. */
    const acentoEm = pagina => pagina.locator('#tela-sessao').evaluate(
      n => n.style.getPropertyValue('--seele-laranja-nerv'),
    );
    const tokensDoTema = (pagina = aba) => pagina.locator('#tela-sessao').evaluate(
      n => [...n.style].filter(p => p.startsWith('--seele-')).map(p => p + ': ' + n.style.getPropertyValue(p)),
    );
    /** Espera o acento `cor` pintado pela casca; falha dizendo o que estava lá. */
    const pintado = (pagina, cor, porque) => pagina.waitForFunction(
      valor => document.getElementById('tela-sessao').style.getPropertyValue('--seele-laranja-nerv') === valor,
      cor, { timeout: 15000 },
    ).catch(async () => {
      throw new Error(porque + ': esperava o acento ' + cor + ', e #tela-sessao tem '
        + JSON.stringify(await tokensDoTema(pagina)));
    });
    /**
     * O que a casca recusou e escreveu no registro de quem hospeda. Uma parte
     * de estilo errada, por exemplo, monta o resto e recusa o `montar` com
     * `falhou`: na tela, nada some, e só o registro diz.
     */
    const registroDe = pagina => pagina.evaluate(() => registroDoAnfitriao.map(r => r.onde + ': ' + r.frase));
    /** O registro tem de estar limpo; o que estiver lá vai na frase da falha. */
    const semRecusa = async (pagina, porque) => {
      const linhas = await registroDe(pagina);
      assert.equal(linhas.length, 0, porque + ': ' + linhas.join(' · '));
    };
    /** O selo da prévia, como a casca o pinta: à vista ou não. */
    const seloAVista = pagina => pagina.evaluate(() => {
      const selo = document.getElementById('selo-da-previa');
      return Boolean(selo) && !selo.hidden;
    });

    // **Nada abre sozinho.** N2 da validação nativa de 20/09/2026: com os três
    // instalados, cada um pintava a sua faixa a cada volta do relógio, e um
    // terço da janela ia embora sem ninguém ter aberto nada. Na API 6 a faixa
    // nem existe; o que se confere é que a atividade começa por um gesto.
    const entradas = aba.locator('#lista-mods-navegacao button');
    await entradas.first().waitFor({ timeout: 15000 });
    assert.equal(await aba.locator('.superficie-de-mod').count(), 0,
      'uma superfície do MOD abriu sem ninguém pedir');

    // **O tema é do servidor, e chega sem gesto nenhum** (API 6, `mundo.tema`).
    // A metade de servidor declarou o tema publicado na preparação, com o
    // destaque #6bffb6, e a casca o pinta em `#tela-sessao` ao conectar —
    // antes de a pessoa abrir o ESTILO, e sem a janela do MOD mandar cor.
    if (manifest.id === 'seele/estilo') {
      await pintado(aba, '#6bffb6', 'o tema publicado não foi pintado ao conectar');
    }

    await entradas.first().click();
    await aba.locator('.superficie-de-mod').first().waitFor({ timeout: 15000 });

    // **Onde quer que ele tenha desenhado.** Era `.first()`, que numa página com
    // a faixa antes da lista significava «na faixa». Num pacote de API 4 a
    // faixa fica vazia e o que o MOD desenha está no cartão de alguém ou na
    // superfície que acabou de abrir — e o que se quer provar é que ele
    // desenhou, não onde.
    const doMod = aba.locator('[data-mod="' + manifest.id + '"]');
    await doMod.getByText(esperado, { exact: false }).first().waitFor({ timeout: 15000 });

    // ---- quem administra: a prévia é da casca, e publicar chega aos outros ----
    if (manifest.id === 'seele/estilo') {
      const adm = await navegador.newPage({ viewport: { width: largura, height: altura } });
      adm.on('pageerror', e => erros.push('adm: ' + e.message));
      await adm.goto(url + '/?pessoa=1');
      await pintado(adm, '#6bffb6', 'o tema publicado não foi pintado para quem administra');
      await adm.locator('#lista-mods-navegacao button').first().click();
      // O diálogo, e não um aviso: os dois são `.superficie-de-mod`.
      const dialogo = adm.locator('.dialogo-de-mod').first();
      await dialogo.waitFor({ timeout: 15000 });
      const botao = chave => dialogo.locator('[data-chave-do-mod="' + chave + '"]');

      // **Os conjuntos passam na casca de verdade.** Só ela mede as cores de
      // estado que deriva de um tema (`tonsDoTema`): o servidor do ESTILO não
      // as conhece, e um conjunto que as derrubasse seria recusado na prévia
      // de quem o escolhesse. Cada um, com o selo da casca à vista.
      await dialogo.locator('[role="tab"][data-aba="presets"]').click();
      for (const [conjunto, acento] of [['papel', '#c9a227'], ['seele', '#f2521f'], ['profundo', '#38bdf8']]) {
        await botao('preset-' + conjunto).click();
        await pintado(adm, acento, 'a prévia do conjunto ' + conjunto + ' não foi pintada');
        assert.equal(await seloAVista(adm), true,
          'a prévia do conjunto ' + conjunto + ' está pintada sem o selo da casca');
        const diz = await dialogo.textContent();
        assert.ok(!diz.includes('recusou'), 'a casca recusou o conjunto ' + conjunto + ': ' + diz);
      }
      await semRecusa(adm, 'a casca recusou algo do diálogo do ESTILO');
      // A prévia é desta máquina: quem só olha continua no tema publicado.
      assert.equal(await acentoEm(aba), '#6bffb6', 'a prévia de quem administra vazou para outra janela');

      // **Publicar chega a quem está olhando**, pelo servidor: o tema pelo
      // `TemaMudou`, que a casca pinta, e a revisão nova pelo aviso
      // (`mundo.avisar`), que o ESTILO lê sem laço nenhum.
      await botao('gravar').click();
      await pintado(aba, '#38bdf8', 'o tema publicado não chegou à janela de quem só olha');
      await aba.locator('[data-mod="' + manifest.id + '"]').getByText('Revisão 2', { exact: false })
        .first().waitFor({ timeout: 15000 })
        .catch(() => { throw new Error('o aviso da gravação não levou a revisão nova a quem só olha'); });
      await pintado(adm, '#38bdf8', 'quem publicou não ficou com o tema publicado');
      await adm.waitForFunction(() => document.getElementById('selo-da-previa')?.hidden !== false,
        null, { timeout: 15000 }).catch(() => { throw new Error('o selo da prévia ficou depois de publicar'); });

      // **DESCARTAR tira a prévia**, e o publicado volta.
      await botao('preset-papel').click();
      await pintado(adm, '#c9a227', 'a prévia depois de publicar não foi pintada');
      await botao('descartar').click();
      await pintado(adm, '#38bdf8', 'DESCARTAR deixou a prévia pintada');
      assert.equal(await seloAVista(adm), false, 'DESCARTAR deixou o selo da prévia');

      // **Ver só na minha sessão não é alteração.** O produto deriva o sujo de
      // cada campo, o interruptor também, contra o `inicial`; e uma superfície
      // suja sempre pergunta antes de fechar. Desligar a prévia sem nada a
      // publicar não pode virar «fechar sem gravar?».
      await botao('previa').click();
      await dialogo.locator('.superficie-de-mod-sair').click();
      await adm.locator('.dialogo-de-mod').first().waitFor({ state: 'detached', timeout: 5000 })
        .catch(async () => {
          throw new Error('desligar a prévia sujou o diálogo: fechar perguntou por nada a publicar — '
            + JSON.stringify(await adm.locator('#moderar').textContent()));
        });
      await semRecusa(adm, 'a casca recusou algo do ESTILO para quem administra');
      await adm.close();
    }

    // **A fronteira, e ela não mudou em nenhuma versão da API.**
    const sessao = aba.locator('#tela-sessao');
    assert.equal(await sessao.locator('script').count(), 0,
      'apareceu um <script> dentro do que o MOD declarou');
    const comEndereco = await sessao.locator('[src^="http"],[href^="http"]').count();
    assert.equal(comEndereco, 0,
      'o MOD montou um endereço externo, e a janela de quem conversa não busca bytes de estranhos');

    // **E os controles existem.** Um MOD sem botão não é utilizável, e foi
    // justamente a asserção contrária que ficou obsoleta sem ninguém notar.
    assert.ok(await sessao.locator('button').count() > 0,
      'o MOD não montou controle nenhum');

    // O que é de outra pessoa não vaza para quem não pode ver.
    if (manifest.id === 'seele/mesa') {
      const texto = await sessao.textContent();
      assert.ok(!texto.includes('Segredo do terceiro'),
        'a ficha de outra pessoa apareceu para quem não é dona dela nem GM');
    }

    // ---- a superfície aberta acima é do produto ----
    {
      const entradas = aba.locator('#lista-mods-navegacao button');
      assert.ok(await entradas.count() > 0,
        'o MOD não registrou entrada de navegação, e a atividade dele não tem por onde abrir');

      const superficie = aba.locator('.superficie-de-mod').first();
      await superficie.waitFor({ timeout: 15000 });
      // **A saída é do produto, e ela está sempre lá.** Um MOD que não desenhe
      // botão nenhum continua sendo uma superfície de onde se sai.
      assert.equal(await superficie.locator('.superficie-de-mod-sair').count(), 1,
        'a superfície ficou sem a saída que o produto monta');
      // E ela diz de quem é: uma tela de MOD indistinguível das do SEELE é o
      // que tornaria uma tela de confiança falsificável.
      const origem = await superficie.locator('[class$="-origem"]').first().textContent();
      assert.equal(origem.trim(), manifest.id,
        'a superfície não diz de qual MOD ela é');
    }

    // ---- sair solta tudo ----
    //
    // **A superfície sai primeiro.** Desde que o ESTILO voltou a abrir num
    // modal, a camada cobre a aplicação — é o que um modal faz — e o clique em
    // «sair da sessão» não a atravessa. Fechar pela saída do produto é o
    // caminho de quem usa, e é o que o teste passou a fazer.
    const saidaDaSuperficie = aba.locator('.superficie-de-mod-sair').first();
    if (await saidaDaSuperficie.count()) {
      await saidaDaSuperficie.click();
      await aba.waitForTimeout(400);
    }
    await aba.click('#sair');
    await aba.waitForTimeout(500);
    // **Nomeados, e não contados.** «2 !== 0» mandou procurar às cegas o que
    // tinha sobrevivido; a lista diz qual nó e de quem ele é filho, e foi ela
    // que encontrou em dois minutos o `esquecer` que a instância de mentira
    // não devolvia.
    const sobreviventes = await aba.locator('[data-mod="' + manifest.id + '"]').evaluateAll(
      ns => ns.map(n => n.tagName + '.' + n.className + '#' + (n.id || '-')
        + ' pai=' + (n.parentElement?.id || n.parentElement?.className || '?')),
    );
    assert.deepEqual(sobreviventes, [],
      'o que o MOD desenhou sobreviveu à saída da sessão'
      + (erros.length ? ' — e a janela registrou: ' + erros.join(' · ') : ''));
    assert.equal(await aba.locator('.superficie-de-mod').count(), 0,
      'uma superfície do MOD sobreviveu à saída da sessão');
    assert.equal(await aba.locator('#lista-mods-navegacao button').count(), 0,
      'a entrada de navegação sobreviveu à saída da sessão');
    // **E o tema sai com a sessão.** É o defeito que a v0.15.0 tinha com este
    // pacote: a limpeza do tema morava só na da região, e o servidor seguinte
    // abria com as cores do anterior. Na API 6 o tema é do servidor, e sai do
    // mesmo jeito.
    assert.deepEqual(await tokensDoTema(), [],
      'o tema do MOD sobreviveu à saída da sessão');
    assert.equal(await seloAVista(aba), false, 'o selo da prévia sobreviveu à saída da sessão');

    // E recarregar monta de novo, do estado do servidor. Desde a API 4 a atividade
    // não volta aberta — e não deve: quem recarrega cai na conversa, e não na
    // janela que estava aberta antes. O gesto de abrir é o mesmo da primeira
    // vez, e é isso que se repete aqui.
    await aba.reload();
    if (manifest.id === 'seele/estilo') {
      await pintado(aba, '#38bdf8', 'recarregar não trouxe o tema publicado de volta');
    }
    await aba.locator('#lista-mods-navegacao button').first().waitFor({ timeout: 15000 });
    await aba.locator('#lista-mods-navegacao button').first().click();
    await aba.locator('[data-mod="' + manifest.id + '"]')
      .getByText(esperado, { exact: false }).first().waitFor({ timeout: 15000 });

    assert.deepEqual(erros, [], 'a janela registrou erros: ' + erros.join(' · '));
    await semRecusa(aba, 'a casca recusou algo do ESTILO para quem só olha');
    console.log(manifest.id + ' a ' + largura + ' px: renderer e tema do produto, prelúdio real, '
      + 'superfícies, tema do servidor, prévia, aviso, saída e reconexão conferidos.');
  } finally {
    await navegador?.close();
    filho.kill();
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

(async () => {
  for (const tela of [{ largura: 1280, altura: 800 }, { largura: 390, altura: 844 }]) await conferir(tela);
})().catch(e => { console.error(e); process.exitCode = 1; });
