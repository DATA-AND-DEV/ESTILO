# SEELE MOD ESTILO — 3.1.1

Requer **API de MOD 4**, e roda no **Servidor 0.15**: o app 0.15 aceita as APIs 5, 4 e 3. O app 0.16 só roda a API 6 e recusa este pacote; quem precisa dele abre o Servidor 0.15 pelo launcher. O cliente roda no executor de MODs do SEELE, sem acesso ao documento: ele declara o que quer ver e o produto monta.

## O que a 3.1.1 conserta

- **DESCARTAR E FECHAR descarta.** Fechar o editor com alterações e confirmar o descarte volta a sua sessão ao tema publicado; antes, a prévia do que você jogou fora continuava na sua tela.
- **Duas pessoas editando não se apagam.** Se outra pessoa publica enquanto você edita, o que você não mexeu passa a ser o dela, a página avisa, e publicar não desfaz o que ela fez.
- **O conjunto «SEELE» é o SEELE.** Ele, e o padrão de um servidor novo, têm a borda e o espaçamento com que o SEELE abre; mudar só o destaque não muda mais as linhas e a densidade da sessão.
- **Com o tema desligado, a página diz isso**, e PUBLICAR liga o tema guardado. Antes ela dizia PUBLICADO.
- **Dois cliques em PUBLICAR publicam uma vez**, sem a mensagem «O tema mudou em outro computador».
- **Se o SEELE recusar a entrada «Aparência do servidor»**, um aviso diz por quê, em vez de a entrada simplesmente não aparecer.
- **A entrada não aparece duas vezes** quando o canal some e volta.
- **O editor não é redesenhado a cada 4 segundos** quando nada mudou.
- **Num app sem `console` no executor** (0.13.0 a 0.15.0), uma falha ao avisar outra falha não derruba mais o MOD.

## O que ele faz

Quem administra o servidor escolhe a aparência dele, e quem entra a recebe na própria sessão.

- **Uma entrada «Aparência do servidor»** na navegação abre um diálogo com a amostra de uma conversa, as seis cores em seletores, a forma (densidade, fonte, arredondamento e brilho) e três conjuntos prontos. Para quem não edita, a entrada fica fora da barra (`listarNaBarra: false`) e o diálogo só mostra o tema em vigor, sem controles.
- **Prévia antes de publicar.** O que quem administra escolhe vale só na sessão dela até PUBLICAR PARA O SERVIDOR. Desligar «VER SÓ NA MINHA SESSÃO» devolve o tema publicado sem perder o rascunho; DESCARTAR, ou fechar o diálogo descartando, volta ao que o servidor tem.
- **RESTAURAR PADRÃO** grava a aparência padrão e desliga o tema compartilhado. Com o tema desligado, PUBLICAR PARA O SERVIDOR o liga de novo.

O tema é aplicado por `SeeleUI.tema`, no contêiner da sessão:

| Campo salvo | Nome na API de tema |
| --- | --- |
| background | fundo |
| panel | painel |
| text | texto |
| muted | apagado |
| accent | acento |
| border | borda |
| density | densidade (`compacta`, `confortavel`) |
| font | fonte (`mono`, `sans`) |
| radius | arredondamento (inteiro de 0 a 24) |
| glow | brilho (sim ou não) |

O cliente consulta o tema salvo **a cada 4 segundos depois da resposta anterior**: a API 4 não avisa o cliente quando o servidor do MOD muda. A metade de servidor guarda o tema, a revisão e a autorização: só quem administra grava, e cada cor de texto, texto apagado e destaque precisa de 4,5:1 sobre o fundo e sobre o painel. Em servidor novo, o tema começa desligado.

O produto também confere o que recebe — cor `#rrggbb`, intervalo do arredondamento, texto sobre fundo a 4,5:1, e o token que outro MOD já pediu — e a recusa dele aparece no diálogo com o motivo que ele deu.

## Saída do servidor

O tema pertence à sessão e sai com ela. **Até a v0.15.0 do app ele podia ficar na sessão do servidor seguinte**: a limpeza do tema só existia junto da região, e este pacote não desenha região. A v0.15.1 deu dono ao tema, e o Servidor 0.15 do launcher já vem com isso; quem ainda roda a v0.15.0 deve atualizar o app.

## Migração e dados existentes

Mantenha o ID `seele/estilo` e o armazenamento de dados do servidor. O formato do tema salvo é o mesmo desde a 1.0.0. A 3.1.1 muda só o padrão de um servidor que nunca gravou tema (borda `#241f19` e densidade confortável); um tema já gravado continua como está. Não apague bancos, perfis, campanhas ou arquivos para trocar o pacote.

## Desenvolvimento e validação

```sh
npm ci
npm run build
npm run check
npm test
npx playwright install chromium
SEELE_RAIZ=/caminho/do/SEELE npm run test:ui
npm run preview
cargo run --manifest-path ferramentas/quickjs-check/Cargo.toml
```

Edite `ferramentas/interface.js` e `ferramentas/estilo.js`; o build reproduz `cliente/main.js`, autocontido e sem dependências de execução. O handler do servidor está em `servidor/main.js`.

O laboratório (`npm run preview`, e o `test:ui` que o usa) recorta o prelúdio de `apps/seele-app/src/executor.rs` e usa o renderer de `apps/seele-app/ui` de um checkout do SEELE. Por padrão ele procura o SEELE em `../../SEELE` a partir de `ferramentas/`; defina `SEELE_RAIZ` para outro checkout, ou `SEELE_UI` para outra pasta de interface. Ele oferece identidades simuladas e dados temporários, servido apenas em loopback, e **não aplica o tema**: o pedido `tema` responde sem pintar. Use `MOD_PORT` para mudar a porta.

Os testes cobrem o cliente final sem DOM, consultas sem sobreposição, falhas, troca de canal, o diálogo de aparência, a prévia, a concorrência entre quem administra, as regras e a privacidade do servidor. O teste em Chromium usa o pacote de distribuição e o renderer do SEELE; verifica a entrada, a superfície, a saída e a reconexão. O QuickJS exercita o motor de servidor. Isso não substitui homologação em duas janelas Tauri conectadas ao servidor nativo.

## Preparar o pacote

```sh
npm run build
npm run package -- /caminho/absoluto/novo/pacote
```

O destino precisa ser novo. O pacote contém somente `mod.json`, `cliente/main.js` e `servidor/main.js`. Instale os mesmos bytes no host e nos clientes pelo fluxo de MODs do SEELE, habilite no servidor de teste e reconecte para conferir o novo conjunto. Não use a raiz Git com ferramentas e dependências como pacote.

Antes da distribuição, valide instalação, hash, aceite, consulta, saída, reconexão e preservação de dados no SEELE nativo. Publicar uma nova versão requer avaliação do novo commit, atualização do catálogo e assinatura pelo indexador; mudar o código local não atualiza instalações existentes.

Referência: o contrato da API 4 está em `api/v4.json` no repositório do SEELE.
