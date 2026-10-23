# Retomada — Sistema de Cifras

> Documento rápido para retomar o trabalho depois de desligar a máquina.
> Estado em 23/10/2026.

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
  restaurar pela tela da pasta; as cifras em si continuam intactas.
- **Importação grava na pasta.** Quando a pasta está conectada, um arquivo importado é
  salvo nela (além de aparecer na biblioteca). Sem pasta, fica no armazenamento interno.
- **Anotação em PDF.** O visualizador ganhou **✏ Anotar**: desenhar com dedo/caneta,
  escolher cor e espessura, desfazer/limpar e **Salvar no PDF**. A anotação é gravada no
  arquivo original, seja ele da pasta ou interno.
- **Repertórios recolhíveis e arrastáveis.** Clicar no cabeçalho expande e mostra todas
  as músicas. Em **Editar**, a linha inteira pode ser arrastada para reordenar (sem
  setinhas ou alça).
- **Imagens abrem no visualizador**, com zoom, como os PDFs.
- **Busca pelo texto** dos PDFs/DOCX é preparada aos poucos ao abrir cada cifra;
  também existe o botão **Preparar busca pelo texto** na tela da pasta.
- **Excluir da biblioteca não apaga o arquivo**: a cifra mapeada fica só oculta
  (há o botão **Mostrar ocultos** para trazer de volta).
- Arquivos que somem da pasta ficam marcados como **ausentes**, sem perder
  etiquetas, favoritas e repertórios.
- Importação manual continua disponível (PDF, DOC, DOCX, PNG, JPG). Com pasta conectada
  ela grava o original na pasta; sem pasta, mantém a cópia no armazenamento interno.
- O `sw.js` foi para **`cifras-v10`**.
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
7. Colocar um arquivo novo na pasta e tocar em **📁 → Atualizar lista**.
8. Conferir se `cifras-backup.json` apareceu na pasta (o app pode pedir permissão
   de escrita). Alterar algo e verificar que o arquivo é atualizado.
9. Importar um PDF pelo botão **Importar** e conferir se o arquivo apareceu na pasta.
10. Abrir um PDF, tocar em **✏ Anotar**, fazer um traço e salvar; fechar e abrir de novo
    para confirmar que a anotação ficou no arquivo.
11. Em **Repertórios**, tocar no cabeçalho para expandir; tocar em **Editar** e
    arrastar a linha da música para conferir a nova ordem.

## Pendências conhecidas / decisões em aberto

- Testar em tablet real: o navegador pode não oferecer `showDirectoryPicker`.
  Se não oferecer, o app orienta a usar **Importar arquivos / pasta** (cópia).
- `.doc` antigo é listado, mas o navegador não consegue abrir. Converter para
  `.docx` ou PDF.
- O navegador pode exigir confirmar o acesso à pasta após reiniciar; o botão
  **Reconectar** resolve.
- Ainda não há transposição de tom.
- Repertórios grandes (zip/PDF único) ainda dependem da memória do tablet.

## Documentação detalhada

- `README.md` — o que funciona, limitações, estrutura e licenças.
- `Sistema de Cifras o que foi feito e plano do OneDrive.md` — plano geral e
  histórico das seções 11 (OneDrive) e 12 (Dropbox), mantido como registro.

## Fluxo de publicação (lembrete)

1. Alterar os arquivos.
2. **Subir `CACHE_VERSION` em `sw.js`** a cada publicação (está em `cifras-v10`).
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
