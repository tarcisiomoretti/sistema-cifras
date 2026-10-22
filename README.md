# Sistema de Cifras

Protótipo de biblioteca de cifras offline para igreja. Roda no navegador (tablet Android e iPhone), guarda PDFs/DOCX no aparelho e não precisa de servidor.

Esta é a versão corrigida do protótipo descrito em `Sistema de Cifras o que foi feito e plano do OneDrive.md`.

## O que já funciona

- Importar PDF, DOCX e DOC (arrastando ou pelo botão).
- Busca instantânea por nome, artista, tom, etiqueta e texto da letra (todas as páginas dos PDFs).
- Etiquetas, favoritas e edição de nome/artista/tom.
- Repertórios com adicionar, reordenar, remover e tocar em sequência.
- Exportar um repertório em `.zip` (arquivos originais) ou em um **PDF único** com as cifras em PDF, para baixar ou compartilhar.
- Modo palco com PDF renderizado sob demanda, zoom, fundo invertido, troca de música e atalhos de teclado.
- Download do arquivo original e compartilhamento pelo menu do aparelho.
- Tema claro/escuro salvo.
- Funciona **offline** depois da primeira visita, inclusive abrindo PDFs.
- Instalável como PWA quando servido por HTTPS.

## Como rodar

Na pasta do projeto:

```bash
python3 -m http.server 8000
```

Abra `http://localhost:8000`.

Para testar no tablet/iPhone na mesma rede, use o IP do computador, por exemplo `http://192.168.0.10:8000`. Instalar como app e usar o service worker exige **HTTPS** (ou `localhost`).

## Publicar no GitHub Pages

1. Crie um repositório e envie estes arquivos.
2. Em **Settings → Pages**, escolha a branch principal e a pasta raiz.
3. Abra o endereço `https://SEU-USUARIO.github.io/SEU-REPO/`.
4. No tablet, Chrome → **Instalar app**. No iPhone, Safari → **Adicionar à Tela de Início**.

Sempre que alterar o app, aumente `CACHE_VERSION` no começo de `sw.js` (por exemplo `cifras-v2`) para os aparelhos baixarem a versão nova.

## Estrutura

```text
index.html               tela principal
styles.css               estilos e temas
app.js                   lógica do app
theme-init.js            tema aplicado antes da primeira pintura
sw.js                    service worker (cache offline)
manifest.webmanifest     manifesto do PWA
icons/                   ícones do app
vendor/                  pdf.js 3.11.174, mammoth 1.6.0, JSZip 3.10.1 e pdf-lib 1.17.1, com licenças
```

Não há build nem dependências de CDN. As bibliotecas de PDF, DOCX, zip e junção de PDFs são servidas da própria pasta.

## Dados

Tudo fica no IndexedDB do navegador, na base `cifras` (versão 2):

- `songs` — metadados (nome, artista, tom, etiquetas, favorita, origem, IDs do OneDrive, hash, datas).
- `files` — o PDF/DOCX original em `Blob`.
- `texts` — texto extraído para a busca.
- `lists` — repertórios e ordem das músicas.

A versão 1 do banco (protótipo antigo, com blob e texto dentro de `songs`) é migrada automaticamente na primeira abertura.

Os campos `source`, `driveId`, `itemId`, `eTag` e `hash` já existem para a etapa 2 (OneDrive), mas a sincronização ainda **não** foi implementada.

## Limitações conhecidas

- Ainda não sincroniza com o OneDrive; os dados ficam só no aparelho.
- Cada arquivo importado tem limite de 100 MB. O zip e o PDF único do repertório são montados na memória do aparelho; repertórios muito grandes podem demorar ou falhar em tablets com pouca memória.
- O PDF único inclui apenas as cifras em PDF. As cifras DOCX/DOC ficam de fora e o app avisa quais são; use o zip para levá-las.
- Ao abrir o app por `http://IP:8000`, o service worker e a instalação como PWA não funcionam. Além disso, o IndexedDB é separado por endereço e porta: se o IP do computador mudar, o tablet enxerga outro site e a biblioteca parece vazia. Para uso real, use um endereço HTTPS fixo.
- `.doc` antigo é listado e pode ser baixado, mas não abre no navegador. Converta para `.docx` ou PDF.
- PDFs escritos à mão no Samsung Notes não têm texto; a busca encontra só pelo nome.
- Não há transposição de tom.
- O Safari pode limpar dados de sites pouco usados. Instalar na Tela de Início e manter o app em uso reduz o risco; o OneDrive será a cópia segura na etapa 2.
- O visualizador abre PDFs página a página; arquivos muito grandes ainda dependem da memória do aparelho.

## Testes feitos

- Importação de PDF de 3 páginas, PDF de 40 páginas e DOCX.
- Busca sem acentos (`adoracao` encontra `adoração`).
- Edição de metadados e reimportação com o mesmo nome, preservando nome, artista, tom e etiquetas.
- Criação de repertório, adicionar, reordenar, tocar e excluir cifra com remoção do repertório.
- Visualizador de PDF com renderização sob demanda (1 canvas visível de 40 páginas) e zoom.
- Visualizador de DOCX.
- Exportação de repertório em zip, com dois arquivos na ordem correta (`01 - ...`, `02 - ...`), incluindo o caminho de "Compartilhar" com a tela de arquivo pronto.
- PDF único do repertório: 4 páginas na ordem correta (3 de um PDF de 3 páginas + 1 de outro), com o texto preservado e a cifra DOCX avisada e excluída.
- Tema persistente após recarregar.
- Migração do banco versão 1 para a versão 2.
- Uso offline com o servidor desligado, abrindo o app e um PDF.

Ainda falta o teste real no tablet e no iPhone, principalmente o fluxo de edição com a caneta e o compartilhamento.

## Licenças de terceiros

- pdf.js — Apache License 2.0 (`vendor/LICENSE-pdfjs.txt`).
- mammoth.js — BSD 2-Clause (`vendor/LICENSE-mammoth.txt`).
- JSZip — MIT ou GPLv3, à escolha; usamos MIT (`vendor/LICENSE-jszip.txt`).
- pdf-lib — MIT (`vendor/LICENSE-pdflib.txt`).
