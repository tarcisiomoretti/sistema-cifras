# Retomada — Sistema de Cifras

> Documento rápido para retomar o trabalho depois de desligar a máquina.
> Estado em 26/10/2026.

## Onde está o projeto

- Pasta: `/home/tarcisio/Documentos/ProjetosPessoais/SistemaCifras`
- Repositório público: https://github.com/tarcisiomoretti/sistema-cifras
- App publicado: **https://tarcisiomoretti.github.io/sistema-cifras/**

## O que mudou nesta etapa

- **Dropbox desativado e removido.** O SDK, o `config.js` e todo o código de nuvem
  saíram do app. Não há mais login, sincronização, `_cifras-meta.json` nem cache
  relacionado ao Dropbox.
- **Pasta das cifras (mapeamento local).** O botão **📁** abre a tela da pasta.
  O app usa `showDirectoryPicker` (File System Access API) para o usuário escolher
  uma pasta do tablet. A pasta fica guardada no IndexedDB e é relida ao abrir o app.
- **A pasta vira a biblioteca.** O app varre a pasta e as subpastas e lista
  automaticamente **PDF, DOC, DOCX, PNG, JPG e WEBP**. As cifras existentes não são
  copiadas nem apagadas do tablet. Ao adicionar/remover arquivos, use **Atualizar lista**.
- **Banco de dados na pasta.** O app grava `cifras-backup.json` na pasta escolhida,
  atualizado automaticamente após alterações. O arquivo inclui metadados, repertórios,
  textos, cifras ocultas e arquivos importados manualmente. Dá para salvar na hora ou
  restaurar pela tela da pasta; as cifras em si continuam intactas. Numa instalação nova,
  ao escolher uma pasta que já tenha o backup, o app restaura o banco automaticamente
  antes de gravar por cima.
- **Importação grava na pasta.** Quando a pasta está conectada, um arquivo importado é
  salvo nela (além de aparecer na biblioteca). Sem pasta, fica no armazenamento interno.
- **Anotação em PDF.** O visualizador ganhou **✏ Anotar**: desenhar com dedo/caneta
  (com pressão e eventos coalescidos do S Pen), escolher cor e espessura, desfazer,
  usar a borracha (botão do S Pen ou **⌫ Borracha**) e **Salvar no PDF**. A anotação
  é gravada no arquivo original, seja ele da pasta ou interno. Antes da primeira
  anotação o app guarda uma cópia limpa; **↺ Remover anotações** restaura essa cópia.
- **Localizar arquivo.** O botão **📂 Localizar** mostra o caminho relativo dentro da
  pasta e permite copiá-lo. O navegador não abre o Samsung Notes direto no arquivo;
  o fluxo confiável é Meus Arquivos → arquivo → **Abrir com** → Samsung Notes.
- **Repertórios recolhíveis e arrastáveis.** Clicar no cabeçalho expande e mostra todas
  as músicas. Em **Editar**, a linha inteira pode ser arrastada para reordenar (sem
  setinhas ou alça).
- **Índice da pasta em cache.** A releitura automática ao abrir o app usa um índice
  salvo na última vez em que **Atualizar lista** foi tocado. Assim o boot não varre a
  pasta inteira de novo. Se você adicionar/mover arquivos, use **Atualizar lista**
  para atualizar o índice. Ao reconectar a pasta depois de reiniciar, o app não
  re-sincroniza a lista sozinho; as cifras são abertas pelo caminho salvo.
- **Excluir com opção.** Para cifra da pasta, **Ocultar da biblioteca** mantém o arquivo;
  **Apagar da pasta** remove o arquivo definitivamente, com confirmação.
- **Caminhos após reinstalar.** Se o backup guardou `Antiga/Cifra.pdf` e o arquivo agora
  está em outro caminho, a leitura seguinte relocaliza pelo nome/tamanho e mantém o
  mesmo ID, repertórios, etiquetas e favoritos, sem marcar como ausente.
- **Abrir em outro app.** O botão **↗ Abrir em outro app** compartilha o arquivo com o
  aparelho; se o Samsung Notes não aparecer no menu, **📂 Localizar** mostra o caminho
  para abrir pelo Meus Arquivos. **⤓ Baixar** salva uma cópia em Downloads.
- **Imagens abrem no visualizador**, com zoom, como os PDFs.
- **Busca pelo texto** dos PDFs/DOCX é preparada aos poucos ao abrir cada cifra;
  também existe o botão **Preparar busca pelo texto** na tela da pasta.
- Arquivos que somem da pasta ficam marcados como **ausentes**, sem perder
  etiquetas, favoritas e repertórios.
- Importação manual continua disponível (PDF, DOC, DOCX, PNG, JPG). Com pasta conectada
  ela grava o original na pasta; sem pasta, mantém a cópia no armazenamento interno.
- O `sw.js` foi para **`cifras-v18`**.
- **Troca de cifra no visualizador.** Os botões ◀ ▶, as setas do teclado e o deslize
  horizontal funcionam. Ao abrir uma cifra de um repertório, o app pré-carrega em
  segundo plano as demais cifras **daquele repertório**, começando pelas mais
  próximas e espaçando o trabalho para não atrasar a primeira página. Ao abrir pela
  biblioteca, nada é pré-carregado. O cache é liberado ao fechar o visualizador.
- **Zoom por pinsa sem perder os botões.** A pinsa na tela usa o zoom do próprio app
  dentro do visualizador; o navegador não amplia a página inteira, então a barra com
  fechar, anterior/próxima e os demais botões continua fixa no topo. O gesto de dois
  dedos ajusta o zoom mantendo o ponto tocado como referência. O zoom de página do
  navegador fica desativado para não deslocar a barra; use a pinsa ou os botões
  **−** e **+** para ampliar a cifra.
- O **PDF único** do repertório agora usa **sempre o mesmo tamanho A4** em todas as
  páginas, inclusive imagens. A orientação (retrato ou paisagem) é definida pela
  primeira cifra; as demais são reduzidas/proporcionais para caber sem corte. Assim
  o leitor não fica alternando o tamanho de uma cifra para outra. PDFs e imagens
  entram nesta ordem; WebP é convertido para PNG; DOC/DOCX ficam de fora com aviso.
- A pasta pede permissão de **leitura e escrita** porque grava o backup do banco,
  recebe arquivos importados e salva anotações feitas nos PDFs. Fora essas ações
  explícitas, o app não altera nem apaga as cifras.

## Como testar no tablet

1. Atualizar o app (fechar/abrir ou puxar para atualizar).
2. Tocar em **📁** → **Escolher pasta do tablet**.
3. Escolher a pasta onde já estão as cifras.
4. Confirmar que PDFs, DOCs, DOCXs e PNGs aparecem na lista.
5. Abrir um PDF, um DOCX e uma imagem.
6. Fechar e abrir o app; se o navegador pedir, tocar em **📁 → Reconectar**.
   Abrir uma cifra antes de reconectar e confirmar que o app pede o acesso em vez de
   dizer que o arquivo sumiu.
7. Colocar um arquivo novo na pasta e tocar em **📁 → Atualizar lista**.
8. Conferir se `cifras-backup.json` apareceu na pasta (o app pode pedir permissão
   de escrita). Alterar algo e verificar que o arquivo é atualizado.
9. Importar um PDF pelo botão **Importar** e conferir se o arquivo apareceu na pasta.
10. Abrir um PDF, tocar em **✏ Anotar**, fazer um traço e salvar; fechar e abrir de novo
    para confirmar que a anotação ficou no arquivo. Testar a borracha pelo botão
    **⌫ Borracha** e pelo botão do S Pen. Testar **↺ Remover anotações**.
11. Em **Editar** uma cifra da pasta, testar **Ocultar da biblioteca** e **Apagar da pasta**.
12. Em uma instalação limpa, escolher uma pasta que já tenha `cifras-backup.json` e
    confirmar que o banco é restaurado antes de ser regravado. Movimentar um arquivo
    de subpasta e tocar em **Atualizar lista** para confirmar que o caminho é corrigido
    sem perder o repertório.
13. Em **Repertórios**, tocar no cabeçalho para expandir; tocar em **Editar** e
    arrastar a linha da música para conferir a nova ordem.
14. Abrir **📂 Localizar** e testar **Copiar caminho**; abrir o arquivo pelo Meus Arquivos
    com o Samsung Notes.
15. Em um repertório, abrir uma cifra e dar zoom com dois dedos (pinsa). Confirmar que
    a barra de botões continua visível e que a cifra aumenta/diminui sem a página
    inteira ser ampliada. Testar também os botões **−** e **+**.
16. Exportar um repertório com PDFs de tamanhos diferentes (A4, Carta e uma página
    girada) em **PDF único** e conferir se todas as páginas saem no mesmo tamanho A4,
    sem conteúdo cortado.

## Pendências conhecidas / decisões em aberto

- Testar em tablet real: o navegador pode não oferecer `showDirectoryPicker`.
  Se não oferecer, o app orienta a usar **Importar arquivos / pasta** (cópia).
- `.doc` antigo é listado, mas o navegador não consegue abrir. Converter para
  `.docx` ou PDF.
- O navegador pode exigir confirmar o acesso à pasta após reiniciar; o botão
  **Reconectar** resolve.
- Ainda não há transposição de tom.
- A borracha apaga os traços da sessão atual. Depois de salvar, a anotação vira
  parte do PDF; use **↺ Remover anotações** para voltar à cópia original guardada
  antes da primeira anotação desta versão. PDFs anotados por versões anteriores
  não têm essa cópia.
- Repertórios grandes (zip/PDF único) ainda dependem da memória do tablet.

## Documentação detalhada

- `README.md` — o que funciona, limitações, estrutura e licenças.
- `Sistema de Cifras o que foi feito e plano do OneDrive.md` — plano geral e
  histórico das seções 11 (OneDrive) e 12 (Dropbox), mantido como registro.

## Fluxo de publicação (lembrete)

1. Alterar os arquivos.
2. **Subir `CACHE_VERSION` em `sw.js`** a cada publicação (está em `cifras-v18`).
3. `git commit` + `git push origin main`.
4. O GitHub Pages publica sozinho em ~1 minuto.

## Ambiente de teste

- Não há Node/npm na máquina.
- Selenium no venv: `/tmp/opencode/venv` (selenium + esprima).
- Firefox headless: `/snap/firefox/current/usr/lib/firefox/firefox`.
- Servidor local: `python3 -m http.server 8765 --bind 127.0.0.1`.
- Teste do mapeamento de pasta e backup do banco: `/tmp/opencode/smoke_pasta.py`
  (mock de `showDirectoryPicker` com PNG/DOCX em subpasta, gravação e restauração
  de `cifras-backup.json`).
- Teste de repertório: `/tmp/opencode/smoke_repertorio.py` (expansão ao clicar e
  arraste da linha inteira no modo de edição).
- Checagem de sintaxe: `esprima` (trocar `6_000_000` por `6000000` antes de validar).
- `gh` autenticado como `tarcisiomoretti`.
