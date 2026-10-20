// O contrato da API 6, como o SEELE o congelou.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

/**
 * O SHA-256 do `api/v6.json`, como `api/congeladas.sha256` do SEELE o registra.
 *
 * **Uma cópia, e amarrada.** Os testes deste pacote leem do contrato os pontos,
 * as formas, os eventos e as recusas, em vez de reescrevê-los à mão: a tabela à
 * mão divergiu do produto na 3.x (o mundo de mentira aceitava `decorar`). A
 * cópia mora aqui para o `npm test` não depender de um checkout do SEELE, e
 * este número é o que impede que ela mude sem o contrato mudar. Uma versão
 * publicada da API não se edita; se este teste falha, a cópia foi mexida.
 *
 * É o da v6 **emendada**: antes de ela sair, o SEELE a corrigiu para o
 * contrato dizer só o que o produto entrega, fechar a lista das recusas,
 * escrever os nomes dos pares que a casca recusa, dizer o que uma montagem
 * recusou (`nos-recusados`) e acertar os últimos textos. Foram quatro emendas,
 * e a última fecha a v6: o que mudar depois vai para a API 7. Nenhum build
 * publicado leu as de antes, e o registro diz cada uma.
 */
const CONGELADA = '8dcf4aaf13f73b957e52b99f462bfdff656a232dd337bccebdad97edaae6f514';

test('contrato: a cópia é o v6.json congelado', () => {
  const caminho = path.join(__dirname, 'contrato/v6.json');
  assert.ok(fs.existsSync(caminho), 'falta a cópia do contrato em test/contrato/v6.json');
  const hash = crypto.createHash('sha256').update(fs.readFileSync(caminho)).digest('hex');
  assert.equal(hash, CONGELADA, 'test/contrato/v6.json não é o v6.json congelado');
  assert.equal(JSON.parse(fs.readFileSync(caminho, 'utf8')).version, 6);
});

/**
 * **O validador do mundo de mentira dá a resposta do produto.** Os casos são os
 * de `crates/seele-proto/tests/vetores/chaves-do-tema.json` no SEELE (copiados
 * junto com o contrato congelado), que o servidor e a casca leem para dar a
 * mesma resposta: a mesma chave, a mesma recusa. Um mundo de mentira que
 * aceitasse o que o produto recusa ensinaria a coisa errada a este pacote.
 */
test('contrato: o validador do tema do mundo de mentira responde como o vetor do produto', () => {
  const { recusaDasChavesDoTema } = require('./mundo-da-api6.cjs');
  const { casos } = JSON.parse(fs.readFileSync(path.join(__dirname, 'contrato/chaves-do-tema.json'), 'utf8'));
  const errados = casos
    .map(caso => ({ caso, deu: recusaDasChavesDoTema(caso.tema) }))
    .filter(({ caso, deu }) => JSON.stringify(deu) !== JSON.stringify(caso.recusa))
    .map(({ caso, deu }) => `${caso.nome}: esperava ${JSON.stringify(caso.recusa)}, deu ${JSON.stringify(deu)}`);
  assert.deepEqual(errados, [], errados.length + ' de ' + casos.length + ' casos divergem');
});
