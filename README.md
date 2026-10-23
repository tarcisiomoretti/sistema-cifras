# Sistema de Cifras

Protótipo de biblioteca de cifras offline para igreja. Roda no navegador (tablet Android e iPhone), lê as cifras direto de uma pasta escolhida no aparelho e não precisa de servidor.

Esta é a versão corrigida do protótipo descrito em `Sistema de Cifras o que foi feito e plano do OneDrive.md`.

## O que já funciona

- **Pasta das cifras**: escolha uma pasta do tablet (ou do computador) e o app lista automaticamente os PDF, DOC, DOCX e imagens (PNG/JPG) que estiverem nela, inclusive em subpastas. Os arquivos são lidos **direto da pasta**: nada é copiado, movido ou apagado. Ao colocar ou remover arquivos, use **Atualizar lista**.
- Importar PDF, DOCX, DOC, PNG e JPG avulsos (arrastando ou pelo botão), como alternativa quando o navegador não permite mapear uma pasta.
- Busca instantânea por nome, artista, tom, etiqueta e texto da letra (todas as páginas dos PDFs; a busca pelo texto é preparada aos poucos, ao abrir cada cifra, ou pelo botão **Preparar busca pelo texto**).
- Etiquetas, favoritas e edição de nome/artista/tom.
- Repertórios recolhíveis: toque no nome para expandir e ver todas as músicas.
- Repertórios com adicionar, arrastar para reordenar, remover e tocar em sequência.
- Exportar um repertório em `.zip` (arquivos originais) ou em um **PDF único** com as cifras em PDF, para baixar ou compartilhar.
- Modo palco com PDF renderizado sob demanda, imagens, zoom, fundo invertido, troca de música e atalhos de teclado.
- Download do arquivo original e compartilhamento pelo menu do aparelho.
- Tema claro/escuro salvo.
- Funciona **offline** depois da primeira visita, inclusive abrindo PDFs e imagens.
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

### Pasta das cifras

O botão 📁 abre a tela da pasta. O app usa a **File System Access API** do navegador
(`showDirectoryPicker`) para pedir acesso a uma pasta do aparelho. A escolha fica guardada
no IndexedDB; ao abrir o app de novo, o navegador pode pedir para confirmar o acesso —
basta tocar em **Reconectar**.

A leitura é somente leitura: o app nunca grava nem apaga arquivos na pasta escolhida.
Se o navegador não oferecer essa API (por exemplo, Firefox antigo), use
**Importar arquivos / pasta**; nesse caso os arquivos são copiados para o armazenamento
interno do app.

## Dados

Tudo fica no IndexedDB do navegador, na base `cifras` (versão 3):

- `songs` — metadados (nome, artista, tom, etiquetas, favorita, origem, caminho na pasta, hash, datas).
- `files` — arquivos importados como cópia em `Blob` (as cifras mapeadas da pasta **não** são copiadas).
- `texts` — texto extraído para a busca.
- `lists` — repertórios e ordem das músicas.
- `handles` — a referência à pasta escolhida (File System Access API).

A versão 1 do banco (protótipo antigo, com blob e texto dentro de `songs`) é migrada automaticamente na primeira abertura.

Os campos `source`, `folderPath`, `missing` e `hash` identificam a origem e o estado de cada cifra. Cifras mapeadas usam `source: 'folder'` e `folderPath` (caminho relativo dentro da pasta).

## Limitações conhecidas

- A pasta só pode ser mapeada em navegadores com a **File System Access API** (Chrome/Edge no Android, tablet e computador). Sem essa API, use **Importar arquivos / pasta** (cópia).
- O navegador pode pedir para liberar o acesso à pasta de novo depois de fechar; toque em 📁 → **Reconectar**.
- Cada arquivo importado tem limite de 100 MB. O zip e o PDF único do repertório são montados na memória do aparelho; repertórios muito grandes podem demorar ou falhar em tablets com pouca memória.
- O PDF único inclui apenas as cifras em PDF. DOC/DOCX e imagens ficam de fora e o app avisa quais são; use o zip para levá-las.
- Ao abrir o app por `http://IP:8000`, o service worker e a instalação como PWA não funcionam. Além disso, o IndexedDB é separado por endereço e porta: se o IP do computador mudar, o tablet enxerga outro site e a biblioteca parece vazia. Para uso real, use um endereço HTTPS fixo.
- `.doc` antigo é listado e pode ser baixado, mas não abre no navegador. Converta para `.docx` ou PDF.
- PDFs escritos à mão (Samsung Notes) e imagens não têm texto; a busca encontra só pelo nome.
- Não há transposição de tom.
- O Safari pode limpar dados de sites pouco usados. Instalar na Tela de Início e manter o app em uso reduz o risco; mantenha as cifras originais na pasta mapeada.
- O visualizador abre PDFs página a página; arquivos muito grandes ainda dependem da memória do aparelho.

## Testes feitos

- Mapeamento de pasta com PDF, DOCX e PNG, incluindo subpastas: os arquivos aparecem sozinhos na biblioteca, sem cópia, e a imagem abre no visualizador.
- Releitura da pasta: arquivos novos entram e os removidos ficam marcados como ausentes, sem apagar metadados.
- Importação de PDF de 3 páginas, PDF de 40 páginas e DOCX.
- Busca sem acentos (`adoracao` encontra `adoração`).
- Edição de metadados e reimportação com o mesmo nome, preservando nome, artista, tom e etiquetas.
- Criação de repertório, adicionar, reordenar, tocar e excluir cifra com remoção do repertório.
- Visualizador de PDF com renderização sob demanda (1 canvas visível de 40 páginas) e zoom.
- Visualizador de DOCX e de imagens.
- Exportação de repertório em zip, com dois arquivos na ordem correta (`01 - ...`, `02 - ...`), incluindo o caminho de "Compartilhar" com a tela de arquivo pronto.
- PDF único do repertório: 4 páginas na ordem correta (3 de um PDF de 3 páginas + 1 de outro), com o texto preservado e a cifra DOCX avisada e excluída.
- Tema persistente após recarregar.
- Migração do banco versão 1 para a versão 2.
- Uso offline com o servidor desligado, abrindo o app e um PDF.

Ainda falta o teste real no tablet e no iPhone, principalmente a escolha da pasta no navegador do tablet e o fluxo de edição com a caneta.

## Licenças de terceiros

- pdf.js — Apache License 2.0 (`vendor/LICENSE-pdfjs.txt`).
- mammoth.js — BSD 2-Clause (`vendor/LICENSE-mammoth.txt`).
- JSZip — MIT ou GPLv3, à escolha; usamos MIT (`vendor/LICENSE-jszip.txt`).
- pdf-lib — MIT (`vendor/LICENSE-pdflib.txt`).
