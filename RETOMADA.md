# Retomada — Sistema de Cifras

> Documento rápido para retomar o trabalho depois de desligar a máquina.
> Estado em 22/10/2026.

## Onde está o projeto

- Pasta: `/home/tarcisio/Documentos/ProjetosPessoais/SistemaCifras`
- Repositório público: https://github.com/tarcisiomoretti/sistema-cifras
- App publicado: **https://tarcisiomoretti.github.io/sistema-cifras/**
- Tudo commitado e enviado (`git push origin main`), sem pendências.

Últimos commits:

```
93442c5 Corrige config.js preso no cache do service worker
5057011 Ativa o login do Dropbox com o App key do app
3cc56ab Nuvem: listar tudo e baixar sob demanda, com pasta do aparelho
43d32fd Nuvem com Dropbox: login PKCE, escolha da pasta e sincronização manual
8a01746 Sistema de Cifras: protótipo offline com exportação de repertório
```

## O que funcionou até agora

Tudo testado com Selenium (Firefox headless) e publicado:

- Biblioteca offline: importar PDF/DOCX, busca, etiquetas, favoritas, repertórios, modo palco.
- Exportar repertório em **zip** (originais) e em **PDF único** (só PDFs; DOCX fica de fora com aviso).
- **Nuvem (Dropbox)**:
  - Login **PKCE** (sem segredo de cliente), com o App key `6qmiez11xm1wcci`.
  - Escolher a pasta do Dropbox.
  - **Sincronizar agora**, manual, em duas etapas: baixa o `_cifras-meta.json`, **lista tudo sem baixar** os arquivos, e depois **pergunta** se quer baixar todas ou só listar.
  - Cada cifra mostra **nuvem** ou **neste aparelho**, com **⤓ Manter neste aparelho** e **⤒ Liberar espaço**.
  - Abrir uma cifra só na nuvem baixa na hora e mantém.
  - Exportar (zip/PDF) também baixa da nuvem o que faltar.
  - Opção de guardar os arquivos numa **pasta do aparelho (cartão SD)**, via `showDirectoryPicker`, quando o navegador permite.

## Onde paramos (ponto exato)

Acabei de corrigir um problema: o **`config.js` estava preso no cache** do service worker,
então o tablet continuava dizendo que faltava o App key.

Correção publicada (commit `93442c5`):

- `config.js` saiu do `APP_SHELL` e agora é buscado **na rede primeiro**.
- `CACHE_VERSION` foi para **`cifras-v6`** (descarta o cache antigo na próxima visita).

Verificado no ar: `cifras-v6`, `config.js` fora do pacote, key presente.

## PRÓXIMO PASSO (é só isto)

**O usuário precisa atualizar o app no tablet** para pegar a correção:

1. Fechar e abrir o app, **ou** puxar para atualizar, **ou** limpar os dados do site
   (se insistir, desinstalar e instalar de novo o ícone).
2. Abrir o **☁** — deve aparecer **"Entrar no Dropbox"**.
3. Testar: entrar, escolher a pasta, sincronizar, manter/liberar, e ver se a opção
   de **pasta do aparelho (cartão SD)** aparece no navegador do tablet.

Depois disso, o usuário relata o que apareceu, e a partir daí:
- Se o login funcionar: seguir para o teste real de sincronização com as cifras dele.
- Se o cartão SD não aparecer: o app já avisa; decidir se vale um botão de
  "baixar arquivo avulso" como alternativa.

## Pendências conhecidas / decisões em aberto

- Todos na mesma conta do Dropbox ou cada um com a própria? *(propenso a: mesma conta, login manual em cada aparelho)*
- Ao apagar uma cifra no app: manter o arquivo na nuvem e criar só a lápide?
- Se o arquivo sumir da nuvem: remover da biblioteca ou marcar "arquivo ausente"?
- O login pede de novo ao fechar o navegador (token no `sessionStorage`, proposital).
  Se incomodar no tablet, avaliar guardar de forma persistente.
- Casamento de conflito (ambos mudaram): hoje é simples — "mais recente vence" por
  campo, usando `updatedAt`. A escolha manual das duas versões ainda **não** foi feita.

## Documentação detalhada

- `Sistema de Cifras o que foi feito e plano do OneDrive.md` — plano geral,
  seção 11 (OneDrive, referência) e **seção 12 (Dropbox)**, com o passo a passo
  do App Console e as decisões.
- `README.md` — o que funciona, limitações, estrutura e licenças.

## Fluxo de publicação (lembrete)

1. Alterar os arquivos.
2. **Subir `CACHE_VERSION` em `sw.js`** a cada publicação (está em `cifras-v6`).
3. `git commit` + `git push origin main`.
4. O GitHub Pages publica sozinho em ~1 minuto.

## Ambiente de teste (se precisar repetir)

- Não há Node/npm na máquina.
- Selenium no venv: `/tmp/opencode/venv` (selenium + pypdf + esprima).
- Firefox headless: `/snap/firefox/current/usr/lib/firefox/firefox`.
- Servidor local: `python3 -m http.server 8765 --bind 127.0.0.1`.
- Scripts de teste: `/tmp/opencode/smoke5.py` (zip + PDF único),
  `smoke7.py` (app real sem mock), `smoke8.py` (fluxo da nuvem com SDK simulado),
  `smoke9.py` (App key e URL de login), `smoke10.py` (cache do service worker).
- Geo do Firefox exige que os arquivos de upload fiquem dentro do projeto
  (recriar `.smoke-fixtures/` e um `smoke-test.html`/`smoke-real.html`).
- Checagem de sintaxe: `esprima` (trocar `6_000_000` por `6000000` antes de validar).
- `gh` autenticado como `tarcisiomoretti`.
