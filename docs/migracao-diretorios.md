# Migração para projeto independente

- `SEELE/mods/seele/estilo` → `/Users/dev-alexandre/SEELE-MOD-ESTILO`
- `SEELE/mods/desenvolvimento` → `/Users/dev-alexandre/SEELE-MOD-ESTILO/ferramentas` (somente os fontes deste MOD)
- `SEELE/mods/testes` → `/Users/dev-alexandre/SEELE-MOD-ESTILO/test` e `/Users/dev-alexandre/SEELE-MOD-ESTILO/ferramentas/quickjs-check`
- `SEELE/mods/dist` → `/Users/dev-alexandre/SEELE-MOD-ESTILO/artifacts`

Fontes, testes, build e preview agora são independentes. Não há links simbólicos ou dependência de caminhos do repositório SEELE. A API e o ID seele/estilo foram preservados. O campo repo do manifesto aponta para https://github.com/DATA-AND-DEV/ESTILO; origin usa git@github.com:DATA-AND-DEV/ESTILO.git. As cópias instaladas no app não foram alteradas por esta migração.

Validação após migração: build, testes Node (3 casos), sintaxe e runtime QuickJS 8 MiB passaram. Prévia independente abriu no navegador. O cache de compilação Rust foi reaproveitado do MESA apenas durante a validação; não existe dependência desse caminho no projeto. Backup integral da antiga pasta: `/Users/dev-alexandre/SEELE-MOD-ESTILO/artifacts/antes-da-separacao.zip`.
