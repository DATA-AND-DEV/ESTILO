# SEELE MOD ESTILO — 4.0.0

Requer **API de MOD 6**, e roda no **Servidor 1.0** (app 0.16). A linha do Servidor 0.15 tem a 3.1.1, na API 4. O cliente roda no executor de MODs do SEELE, sem acesso ao documento: ele declara o que quer ver e o produto monta.

## O que ele faz

Quem administra o servidor escolhe a aparência dele, e quem entra a recebe na própria sessão.

- **O tema é do servidor.** O manifesto declara `"tema": true`, a porta que o SEELE mostra no aceite. Ao publicar, a metade de servidor declara o tema com `mundo.tema`; o servidor o guarda e o manda a quem conecta, e o SEELE o aplica antes de desenhar a sessão. Quem entra recebe o tema sem abrir o ESTILO.
- **Uma entrada «Aparência do servidor»** na navegação abre um diálogo com a amostra de uma conversa, as seis cores em seletores, a forma (densidade, fonte, arredondamento e brilho) e três conjuntos prontos. Para quem não administra, a entrada fica fora da barra (`listarNaBarra: false`) e o diálogo só mostra o tema em vigor, sem controles.
- **Prévia antes de publicar.** O que quem administra escolhe aparece só na sessão dela, com o selo «PRÉVIA NÃO PUBLICADA» do SEELE, até PUBLICAR PARA O SERVIDOR. Desligar «VER SÓ NA MINHA SESSÃO» volta ao tema publicado sem perder o rascunho; DESCARTAR, ou fechar descartando, volta ao que o servidor tem.
- **RESTAURAR PADRÃO** pede confirmação, grava a aparência padrão e desliga o tema compartilhado.
- **Sem consulta em laço.** Quem grava faz a metade de servidor avisar as janelas (`mundo.avisar`), e cada uma consulta de novo só então: quem está com o diálogo aberto vê a revisão nova.

O tema vai ao SEELE com estes nomes:

| Campo salvo | Nome no tema do SEELE |
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
| — | modo (`claro` ou `escuro`), derivado do fundo |

O modo não é escolha: ele segue o fundo pela conta do SEELE, e o SEELE recusa um modo que discorda dele.

## O que é conferido, e onde

- **A metade de servidor** guarda o tema, a revisão e a autorização: só quem administra grava, e o texto, o texto apagado e o destaque precisam de 4,5:1 sobre o fundo e sobre o painel. O SEELE pede 3:1 para o apagado; o ESTILO mantém os 4,5:1 que exige desde a 1.0.0. Em servidor novo, o tema começa desligado.
- **O servidor do SEELE** confere a forma (`mundo.tema`): os nomes, as cores `#rrggbb`, os intervalos e o modo. A recusa volta ao campo dela.
- **Cada janela** confere o contraste, inclusive o dos tons que o SEELE deriva do tema, como o destaque fraco e as cores de estado. Por isso o ESTILO só publica o que passou pela prévia: um tema que as janelas recusassem deixaria o servidor inteiro com a aparência padrão. A recusa da prévia diz o par e a razão, e marca os campos, na aba deles.

O que o SEELE fez com o tema chega ao diálogo: aplicado, recusado com os pares, ou o desenho do SEELE, quando quem usa a máquina escolheu que o SEELE desenha a aparência (CONFIGURAÇÕES › MODS).

**Um tema por servidor.** Se outro MOD de tema é o escolhido, publicar é recusado com «A aparência deste servidor é de outro MOD». Quem administra escolhe qual na gestão de MODs.

## Saída do servidor

O tema é do servidor e sai com a sessão: o servidor seguinte abre com o tema dele, ou com a aparência do SEELE. A prévia sai quando o diálogo fecha, e com a sessão.

## Subida da 3.1.1 para a 4.0.0

**Maior pela API, e não pelos dados.** Mantenha o ID `seele/estilo` e os dados do servidor: o tema continua em `dados.theme`, no mesmo formato desde a 1.0.0. Não apague bancos, perfis, campanhas ou arquivos para trocar o pacote.

- O tema guardado pelo servidor é novo na API 6, e começa vazio quando o Servidor 0.15 sobe para o 1.0. O primeiro a entrar com a 4.0.0 faz a metade de servidor declarar o tema que a 3.x tinha publicado, e ele chega a todos. Até lá, o servidor abre com a aparência do SEELE.
- Um tema da 3.x pode não passar na conferência da 6. Nesse caso ele fica sem efeito para todo mundo, e o diálogo de quem administra diz o motivo: ajuste e publique de novo.
- A 4.0.0 grava em `dados.declarado` a revisão que o servidor já tem. A 3.1.1 ignora esse campo.

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

O laboratório (`npm run preview`, e o `test:ui` que o usa) recorta o prelúdio de `crates/seele-motor/src/preludio.rs` e usa o renderer e a casca do tema de `apps/seele-app/ui`, de um checkout do SEELE na linha da API 6. Por padrão ele procura o SEELE em `../../SEELE` a partir de `ferramentas/`; defina `SEELE_RAIZ` para outro checkout, ou `SEELE_UI` para outra pasta de interface. A metade de servidor roda no mundo de mentira dos testes (`test/mundo-da-api6.cjs`), e o tema que ela declara e os avisos dela vão a todas as janelas daquele servidor. Ele oferece identidades simuladas e dados temporários, servido apenas em loopback. Use `MOD_PORT` para mudar a porta. `ferramentas/retratos.cjs` fotografa o laboratório, para comparar a aparência entre versões.

Os testes cobrem o cliente final sem DOM, o escopo de servidor, o aviso, o evento `tema`, a prévia, a recusa nos campos, a concorrência entre quem administra, a redeclaração depois da subida, as regras e a privacidade do servidor, e o contrato (`test/contrato/v6.json`, preso ao hash da cópia do SEELE). O teste em Chromium usa o pacote de distribuição, o renderer e a casca do tema do SEELE, no desktop e a 390 px: o tema pintado ao conectar, os três conjuntos na prévia, a publicação chegando a outra janela, a saída e a reconexão. O QuickJS exercita as duas metades com o prelúdio da 6. Isso não substitui homologação em duas janelas Tauri conectadas ao servidor nativo.

## Preparar o pacote

```sh
npm run build
npm run package -- /caminho/absoluto/novo/pacote
```

O destino precisa ser novo. O pacote contém somente `mod.json`, `cliente/main.js` e `servidor/main.js`. Instale os mesmos bytes no host e nos clientes pelo fluxo de MODs do SEELE, habilite no servidor de teste e reconecte para conferir o novo conjunto. Não use a raiz Git com ferramentas e dependências como pacote.

Antes da distribuição, valide instalação, hash, aceite, consulta, saída, reconexão e preservação de dados no SEELE nativo. Publicar uma nova versão requer avaliação do novo commit, atualização do catálogo e assinatura pelo indexador; mudar o código local não atualiza instalações existentes.

Referência: o contrato da API 6 está em `api/v6.json` no repositório do SEELE.
