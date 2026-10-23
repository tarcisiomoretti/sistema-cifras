# Sistema de Cifras

Protótipo de biblioteca de cifras offline para igreja. Roda no navegador (tablet Android e iPhone), lê as cifras direto de uma pasta escolhida no aparelho e não precisa de servidor.

Esta é a versão corrigida do protótipo descrito em `Sistema de Cifras o que foi feito e plano do OneDrive.md`.

## O que já funciona

- **Pasta das cifras**: escolha uma pasta do tablet (ou do computador) e o app lista automaticamente os PDF, DOC, DOCX e imagens (PNG/JPG) que estiverem nela, inclusive em subpastas. As cifras são lidas **direto da pasta**. Ao importar um arquivo novo com a pasta conectada, ele é gravado nessa pasta (e aparece nela); nada é movido ou apagado sem ação sua. Ao colocar ou remover arquivos, use **Atualizar lista**.
- **Banco na pasta**: o app grava automaticamente `cifras-backup.json` na pasta escolhida (metadados, repertórios, textos, ocultos e arquivos importados). Serve para sincronizar a pasta com o OneDrive e restaurar em outro aparelho. Numa instalação nova, ao escolher uma pasta que já tenha esse arquivo, o app restaura o banco automaticamente antes de gravar.
- Importar PDF, DOCX, DOC, PNG e JPG avulsos (arrastando ou pelo botão). Com uma pasta conectada, o arquivo original é salvo nela; sem pasta, fica no armazenamento interno do app.
- **Anotar no PDF**: abra a cifra e toque em **✏ Anotar** para escrever com o dedo ou a caneta, escolher cor/espessura, desfazer, usar a **borracha** (botão do S Pen ou botão ⌫ Borracha) e **Salvar no PDF**. As anotações são gravadas no próprio arquivo original (na pasta ou no armazenamento interno).
- **Excluir sem perder o original**: para cifras da pasta, o app separa **Ocultar da biblioteca** (mantém o arquivo) de **Apagar da pasta** (remove definitivamente, com confirmação).
- Busca instantânea por nome, artista, tom, etiqueta e texto da letra (todas as páginas dos PDFs; a busca pelo texto é preparada aos poucos, ao abrir cada cifra, ou pelo botão **Preparar busca pelo texto**).
- Etiquetas, favoritas e edição de nome/artista/tom.
- Repertórios recolhíveis: toque no nome para expandir e ver todas as músicas.
- Repertórios com adicionar, arrastar para reordenar, remover e tocar em sequência.
- Exportar um repertório em `.zip` (arquivos originais) ou em um **PDF único** com as cifras em PDF, para baixar ou compartilhar.
- Modo palco com PDF renderizado sob demanda, imagens, zoom, fundo invertido, troca de música e atalhos de teclado.
- Download do arquivo original e compartilhamento pelo menu do aparelho.
- No visualizador, **↗ Abrir em outro app** envia o arquivo para o Samsung Notes ou outro app compatível sem precisar baixar uma cópia permanente; **⤓ Baixar** guarda uma cópia em Downloads.
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

O app lê as cifras da pasta e só escreve nela quando você pede: ao importar um arquivo
(quando a pasta está conectada), ao salvar anotações feitas em um PDF e ao atualizar o
arquivo `cifras-backup.json`, usado como banco portátil. O backup é atualizado
automaticamente quando algo muda e também pode ser salvo ou restaurado pelos botões da tela
da pasta. Se o navegador não oferecer essa API (por exemplo, Firefox antigo), use
**Importar arquivos / pasta**; nesse caso os arquivos são copiados para o armazenamento
interno do app.

## Dados

Tudo fica no IndexedDB do navegador, na base `cifras` (versão 3):

- `songs` — metadados (nome, artista, tom, etiquetas, favorita, origem, caminho na pasta, hash, datas).
- `files` — arquivos importados como cópia em `Blob` (as cifras mapeadas da pasta **não** são copiadas).
- `texts` — texto extraído para a busca.
- `lists` — repertórios e ordem das músicas.
- `handles` — a referência à pasta escolhida (File System Access API).

Além do IndexedDB, a pasta escolhida guarda `cifras-backup.json` com os mesmos dados
(metadados, repertórios, textos, ocultos e arquivos importados). Ele é regravado
automaticamente depois de alterações e pode ser restaurado em outro aparelho pela tela
da pasta. As cifras mapeadas não entram nesse arquivo: elas já estão na própria pasta.

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
- A anotação grava no **próprio PDF original**, como pedido. Se quiser guardar uma versão sem anotações, mantenha uma cópia do arquivo antes de salvar. Depois de salva, a anotação vira parte do PDF e não pode ser apagada separadamente pela borracha em outra sessão.
- O navegador não consegue iniciar o Samsung Notes apontando direto para um arquivo da pasta. Use **↗ Abrir em outro app** (compartilhamento) ou **⤓ Baixar**; o Samsung Notes importa o PDF a partir daí.
- Não há transposição de tom.
- O Safari pode limpar dados de sites pouco usados. Instalar na Tela de Início e manter o app em uso reduz o risco; mantenha as cifras originais na pasta mapeada.
- O visualizador abre PDFs página a página; arquivos muito grandes ainda dependem da memória do aparelho.

## Testes feitos

- Mapeamento de pasta com PDF, DOCX e PNG, incluindo subpastas: os arquivos aparecem sozinhos na biblioteca, sem cópia, e a imagem abre no visualizador.
- Backup do banco em `cifras-backup.json` na pasta, automático e manual, com restauração conferida.
- Releitura da pasta: arquivos novos entram e os removidos ficam marcados como ausentes, sem apagar metadados.
- Importação com pasta conectada: o arquivo de teste foi gravado na pasta e o metadado ficou como `storage: 'folder'`; sem pasta, cai no armazenamento interno.
- Instalação nova com `cifras-backup.json` na pasta: o app restaurou o banco automaticamente antes de gravar e preservou a cifra e o repertório do backup.
- Exclusão de cifra da pasta: **Apagar da pasta** removeu o arquivo do mock e a linha da biblioteca; **Ocultar** mantém o arquivo.
- Anotação em PDF: traço desenhado no visualizador e salvo no arquivo original; o PDF foi regravado e reabriu com a anotação.
- Borracha: o botão do S Pen (eventos `button=5`/`buttons=32` e botão lateral como `button=2`) e o botão **⌫ Borracha** apagaram o traço; desfazer restaurou e o PDF salvou normalmente.
- Repertório recolhível: clique no cabeçalho expande e mostra todas as músicas; na edição, a linha inteira é arrastada para reordenar.
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

Ainda falta o teste real no tablet e no iPhone, principalmente a escolha da pasta no navegador do tablet e a anotação com caneta/dedo na tela sensível.

## Licenças de terceiros

- pdf.js — Apache License 2.0 (`vendor/LICENSE-pdfjs.txt`).
- mammoth.js — BSD 2-Clause (`vendor/LICENSE-mammoth.txt`).
- JSZip — MIT ou GPLv3, à escolha; usamos MIT (`vendor/LICENSE-jszip.txt`).
- pdf-lib — MIT (`vendor/LICENSE-pdflib.txt`).
