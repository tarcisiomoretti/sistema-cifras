# Sistema de Cifras: o que foi feito e plano do OneDrive

Projeto de biblioteca de cifras para igreja, com cópia local em cada aparelho, busca rápida, repertórios e, na próxima etapa, sincronização com o OneDrive.

## 1. Ponto de partida

**Como funciona hoje:** as cifras ficam em PDF e .doc no cartão SD de um tablet Samsung Galaxy Tab S6 Lite. A edição e a escrita são feitas no Samsung Notes (com a caneta). A sincronização com o OneDrive, para backup, é feita pelo OneSync.

**O que se queria:**

- Ter as cifras fisicamente no tablet, para usar offline na igreja.
- Acessar o mesmo acervo no iPhone.
- Manter o OneDrive como fonte da verdade e backup.
- Pesquisar rápido e organizar melhor.

**Decisões tomadas na conversa:**

- Os arquivos continuam como são hoje: **PDF e .doc/.docx**. Nada será convertido para outro formato.
- O projeto é um **app web instalável (PWA)**, que roda no tablet e no iPhone com o mesmo código, sem publicar em loja de apps.
- O app **baixa as cifras para dentro do aparelho**, para a busca ser instantânea e funcionar sem internet.
- A construção é em duas etapas: primeiro um protótipo sem OneDrive (concluído), depois a conexão com o OneDrive (planejada abaixo).

## 2. O que foi feito: protótipo (etapa 1)

O protótipo original foi publicado como página web: https://claude.ai/artifact/M5FguhVcUWyBYsYGaZTQwu

A versão corrigida está nesta pasta, separada em arquivos (`index.html`, `styles.css`, `app.js`, `sw.js` e outros). Use os arquivos locais como referência daqui em diante; o link acima serve apenas para comparar com a versão anterior.

### Biblioteca

- **Importar** PDF e DOCX pelo botão ou arrastando arquivos. Os arquivos são guardados no aparelho (IndexedDB), então funcionam offline.
- **Busca instantânea**, que filtra a cada letra digitada. Ela olha nome, artista, tom, etiquetas e o **texto da letra** (nos PDFs e DOCX digitados). Ignora acentos e maiúsculas.
- **Organização:** em cada cifra, o botão ⋯ edita nome, artista, tom e etiquetas (louvor, adoração, Natal etc.). Há estrela de favorita e filtros por etiqueta com um toque.
- **Excluir** uma cifra do aparelho (também a remove dos repertórios).

### Repertórios

- Criar listas por culto e dar nome a elas.
- Cada repertório aparece recolhido; ao tocar no nome, mostra todas as suas músicas. **Tocar numa cifra abre ela na hora.**
- O botão **▶ Tocar** abre o repertório inteiro em sequência.
- O botão **Editar** do repertório permite adicionar, reordenar (arrastando pelo ícone ⠿) e remover músicas.
- Para adicionar, há um campo de busca com **filtro ao digitar**: aparecem as músicas que combinam, com o tom e um botão ＋.
- O botão **⤓ Exportar** monta um `.zip` com os arquivos originais na ordem do repertório (`01 - Nome.pdf`), para baixar ou compartilhar.
- O mesmo botão oferece o **PDF único**: junta as cifras em PDF e as imagens (PNG/JPEG; WebP é convertido) num só arquivo, na ordem do repertório, bom para ler, imprimir ou enviar pelo celular. Todas as páginas saem no mesmo tamanho A4. As cifras DOCX/DOC ficam de fora, com aviso.

### Visualizador (modo palco)

- Tela cheia, com **zoom** (− e +), pinsa de dois dedos e rolagem. A pinsa usa o zoom do app e mantém a barra de botões fixa no topo; o zoom de página do navegador fica desativado.
- Botões ◀ ▶ para trocar de música (e setas do teclado). Dentro de um repertório, seguem a ordem dele.
- Botão ◐ para inverter as cores (fundo escuro).
- **✎ Abrir:** baixa o arquivo original (PDF ou DOCX) para editar no Word, no Samsung Notes ou em outro app.
- **⤴ Compartilhar:** abre o menu de compartilhar do aparelho com o arquivo anexado (WhatsApp, e-mail, OneDrive etc.). Se o aparelho não permitir compartilhar arquivos, oferece salvar o arquivo.

### Outros detalhes

- Tema claro e escuro (segue o aparelho na primeira abertura, com botão para alternar e preferência salva).
- Reimportar um arquivo com o **mesmo nome** atualiza a cifra existente, mantendo tom, etiquetas, favorita e a posição nos repertórios.

## 3. Limitações atuais

- **Os dados ficam só no aparelho** em que foram importados. Tablet e iPhone ainda não compartilham nada. Resolver isso é o objetivo da etapa 2.
- **O app não edita o original no lugar.** O navegador não consegue abrir um arquivo direto no Word. O fluxo é: ✎ Abrir (baixa uma cópia), editar, reimportar com o mesmo nome.
- **.doc antigo** é guardado, listado e pode ser baixado com ✎ Abrir, mas não abre no visualizador do navegador. É preciso converter para .docx ou PDF.
- **PDFs escritos à mão** no Samsung Notes são achados só pelo nome, porque não têm texto para a busca ler.
- **Não há transposição de tom**, porque isso exigiria texto (como ChordPro) em vez de PDF.
- **A instalação como app exige HTTPS** (GitHub Pages ou um servidor local). Abrir o `index.html` direto pelo `file://` serve para testar, mas não registra o service worker e não permite instalar. O código já está preparado para PWA; falta publicar.

## 4. Pendências de teste

O teste ainda não foi feito no tablet, que é onde a edição com a caneta acontece. A fazer quando estiver com o tablet:

1. Abrir o protótipo no tablet e importar de 10 a 20 cifras.
2. Testar a busca, as etiquetas e os favoritos.
3. Criar um repertório, adicionar músicas pelo campo de busca e tocar em sequência.
4. Testar o modo palco: zoom, troca de música e fundo escuro.
5. **Testar o fluxo de edição:** ✎ Abrir, editar no Samsung Notes ou no Word, reimportar com o mesmo nome.
6. Testar ⤴ Compartilhar para ver quais apps aparecem no menu.
7. **Testar offline de verdade:** depois de importar, desligar a internet e reabrir o app; abrir uma cifra, trocar de música e usar o zoom.
8. **Testar a instalação:** Chrome no tablet ("Instalar app") e Safari no iPhone ("Adicionar à Tela de Início").
9. Anotar o que atrapalhou, o que faltou e a velocidade em PDFs grandes.

## 5. Plano da etapa 2: conexão com o OneDrive

### Ideia geral

- O **OneSync continua como está**, sincronizando a pasta do tablet com o OneDrive. É ele que sobe o que você edita com a caneta.
- O **app novo lê a pasta de cifras do OneDrive** (pela API Microsoft Graph), baixa os arquivos para o aparelho e mantém tudo sincronizado.
- Não há servidor próprio: os dados ficam no OneDrive e no navegador de cada aparelho.
- Com isso, o vai-e-volta de baixar e reimportar some: você edita o arquivo na pasta sincronizada e o app pega a versão nova.

### Etapa 2.0: hospedagem

- Publicar o app no **GitHub Pages** (gratuito, com HTTPS e endereço fixo). O endereço fixo é necessário para o cadastro da Microsoft.
- Adicionar o arquivo de manifesto e o service worker, para o app ser **instalável** e abrir offline.
- **Tablet:** abrir no Chrome e usar "Instalar app".
- **iPhone:** abrir no Safari e usar "Adicionar à Tela de Início".

### Etapa 2.1: cadastro do app na Microsoft (configuração única)

É o passo que dá ao app permissão para ler o seu OneDrive. Eu guio passo a passo.

1. Entrar no portal do Microsoft Entra (portal.azure.com) com a conta Microsoft que contém o OneDrive.
2. Em Registros de aplicativo, criar um novo registro.
3. Tipo de conta: aceitar **contas pessoais da Microsoft**.
4. Plataforma: **Aplicativo de página única (SPA)**, com o endereço do GitHub Pages como URI de redirecionamento.
5. Permissões (delegadas): **User.Read** e **Files.ReadWrite**.
6. Copiar o **ID do aplicativo (cliente)** e colocar no app. Não há segredo para guardar.

Observação: o portal pode pedir verificação da conta na primeira vez. Isso será conferido na hora, junto com você.

### Etapa 2.2: login e escolha da pasta

- Login com a biblioteca oficial **MSAL.js** (fluxo seguro com PKCE, sem senha guardada no app).
- Tela para escolher a pasta de cifras do OneDrive (por exemplo, a mesma que o OneSync usa).
- Uso do mesmo login nos dois aparelhos, cada um com a sua cópia local.

### Etapa 2.3: download e sincronização incremental

- **Primeira vez:** lista a pasta e baixa PDFs e DOCX para o aparelho, mostrando o progresso.
- **Depois:** usa a consulta de mudanças do OneDrive (delta), que devolve só o que foi criado, alterado, renomeado ou apagado desde a última sincronização.
- Cada cifra passa a ser identificada pelo **ID do item no OneDrive**, e não pelo nome. Assim, renomear ou mover um arquivo não perde etiquetas nem lugar nos repertórios.
- Ao baixar um arquivo novo ou alterado, o app **refaz o índice de texto** para a busca.
- A sincronização roda ao abrir o app e por um botão "Sincronizar agora". Funciona offline com o que já foi baixado.

### Etapa 2.4: organização compartilhada entre aparelhos

- Etiquetas, tom, artista, favoritas e repertórios ficam num arquivo pequeno na própria pasta, por exemplo `_cifras-meta.json`.
- Cada item guarda a data da última alteração. Se os dois aparelhos mexerem em coisas diferentes, tudo é mesclado. Se mexerem no mesmo item, vale o mais recente.
- Assim, um repertório criado no iPhone aparece no tablet e vice-versa.

### Etapa 2.5: envio de arquivos novos e edição

- Importar um arquivo pelo app passa a **enviá-lo para a pasta do OneDrive** (arquivos grandes usam envio em partes).
- O botão **✎ Abrir** continua disponível, mas o caminho principal passa a ser: editar o arquivo na pasta sincronizada (Samsung Notes e OneSync) e deixar o app atualizar.
- Se um arquivo for editado em dois lugares ao mesmo tempo, o OneDrive cria uma cópia de conflito. O app mostra as duas, e você escolhe qual manter.

### Etapa 2.6: ajustes finais

- Pedir ao navegador **armazenamento persistente**, para o sistema não limpar as cifras do aparelho.
- Indicador de situação: "sincronizado há X minutos", "offline" e "N arquivos pendentes".
- Opção de converter **.doc antigo para PDF** no momento do download (a API do OneDrive oferece conversão para PDF; a confirmar com um arquivo seu).

## 6. Pontos de atenção da etapa 2

- **Atraso natural:** o app só enxerga uma edição depois que o OneSync a enviou ao OneDrive. Se abrir o app logo após editar, pode ser preciso esperar o envio e tocar em Sincronizar.
- **Login periódico:** em apps de página web, a sessão com a Microsoft expira em cerca de um dia. Será preciso entrar de novo de tempos em tempos. Sem login, o app continua funcionando offline com o que já está baixado; só a sincronização pausa.
- **iPhone e armazenamento:** o Safari pode apagar dados de sites que não são usados por muito tempo. Instalar na Tela de Início e pedir armazenamento persistente reduz bastante esse risco. O OneDrive continua sendo a cópia segura, e o app baixa de novo se necessário.
- **Escrita no OneDrive:** a permissão Files.ReadWrite permite que o app altere arquivos. Por isso a regra é nunca apagar nada no OneDrive sem confirmação explícita sua.
- **PDFs escritos à mão:** continuam sendo achados só pelo nome. Se isso incomodar, uma alternativa futura é reconhecimento de texto (OCR) opcional.

## 7. Ordem sugerida e próximos passos

1. **Concluir o teste do protótipo no tablet**, principalmente o fluxo de edição, e ajustar o que aparecer.
2. **Hospedagem e instalação como app** (etapa 2.0).
3. **Cadastro na Microsoft** (etapa 2.1), feito junto com você.
4. **Login, pasta e download** (etapas 2.2 e 2.3). A partir daqui o acervo aparece sozinho nos dois aparelhos.
5. **Organização compartilhada** (etapa 2.4).
6. **Envio de arquivos e conflitos** (etapa 2.5) e ajustes finais (etapa 2.6).

## 8. Ideias para depois

- Rolagem automática no modo palco.
- Marcação de ordem de repetição ou anotações por música.
- Exportar um repertório como um único PDF para imprimir ou compartilhar.
- Transposição de tom, para as músicas que você quiser converter para texto (ChordPro), sem obrigar o acervo todo a mudar.

## 9. Código-fonte do protótipo (versão corrigida)

O protótipo deixou de ser um único arquivo e agora está separado em arquivos, sem etapa de build. Basta servir a pasta por HTTP/HTTPS.

### Arquivos

```text
index.html               estrutura da tela
styles.css               visual (temas claro/escuro, modo palco, safe-area)
app.js                   toda a lógica do app
theme-init.js            aplica o tema antes da primeira pintura
sw.js                    service worker (funciona offline)
manifest.webmanifest     manifesto de instalação do PWA
icons/                   ícones 180, 192, 512 e maskable
vendor/                  pdf.js 3.11.174 + mammoth 1.6.0 + JSZip 3.10.1 + pdf-lib 1.17.1 (locais, com licenças)
```

### Como usar

1. Na pasta do projeto, rode `python3 -m http.server 8000` (ou publique no GitHub Pages).
2. Abra `http://localhost:8000` no computador para conferir.
3. Para instalar no tablet/iPhone, o endereço precisa ser HTTPS. No GitHub Pages, use "Instalar app" no Chrome do tablet e "Adicionar à Tela de Início" no Safari do iPhone.
4. Abrir `index.html` direto pelo `file://` funciona para uma conferência rápida, mas o service worker e a instalação não funcionam nesse modo.

### Correções em relação à versão anterior

- **Download independente do artifact:** `✎ Abrir` usa um download comum do navegador, com `Blob` e `<a download>`, e `⤴ Compartilhar` usa `navigator.share` com o arquivo anexado, caindo para download quando não houver compartilhamento.
- **Offline de verdade:** pdf.js, mammoth, JSZip e pdf-lib agora são locais (`vendor/`) e entram no cache do service worker. O app abre, lê PDFs/DOCX e monta o zip e o PDF único sem internet depois da primeira visita.
- **Exportação de repertório:** o botão ⤓ Exportar monta um `.zip` com os arquivos originais, na ordem do repertório e sem recompressão, e também um **PDF único** juntando as cifras em PDF e as imagens com pdf-lib. Todas as páginas são ajustadas para o mesmo tamanho A4, sem corte, preservando o conteúdo (inclusive cifras escritas à mão); imagens também viram páginas A4. Ambos com opção de baixar ou compartilhar.
- **Importação mais segura:** limite de 100 MB por arquivo, progresso por página na leitura de PDFs, aviso de arquivo grande e trava para não importar duas vezes ao mesmo tempo.
- **Visualizador sem canvas duplicado:** cada página só é desenhada uma vez por vez, e páginas que saíram da tela são liberadas mesmo durante o zoom.
- **PDFs grandes sem travar:** o visualizador cria as páginas sob demanda e libera as que saem da tela. Também limita a resolução do canvas, cancela desenhos antigos ao trocar de música/zoom e destrói o documento ao fechar.
- **Gravação confiável:** erros do IndexedDB não são mais escondidos. A importação só confirma depois de gravar; se a cota estourar, o usuário vê o erro. O app pede armazenamento persistente ao navegador.
- **Metadados separados dos arquivos:** o banco versão 2 tem `songs` (metadados), `files` (PDFs/DOCX) e `texts` (texto para busca). Editar nome, tom, etiqueta ou favorita não regrava mais o PDF inteiro. A versão 1 é migrada automaticamente.
- **Busca melhor:** o texto é extraído de **todas** as páginas do PDF, não só das 8 primeiras. A busca tem atraso curto ao digitar e usa um índice normalizado por cifra.
- **Exclusão avisada:** ao excluir uma cifra, o app informa de quantos repertórios ela será removida.
- **Tema e tela:** o tema escolhido fica salvo; a orientação/resize é tratada no modo palco; a safe-area do iPhone foi corrigida.
- **Código limpo:** saíram as funções sem uso (`renderList`, o listener antigo do `select`), e os botões/linhas usam marcação válida e rótulos de acessibilidade.

### Preparado para a etapa 2

Cada cifra já guarda os campos `source`, `driveId`, `itemId`, `eTag`, `hash` e `updatedAt`. Hoje `source` é `local`; quando o OneDrive entrar, esses campos permitem identificar o arquivo pelo ID, detectar mudanças e mesclar metadados sem depender do nome.

Ao publicar uma versão nova, aumente `CACHE_VERSION` no início de `sw.js` para o service worker trocar o cache antigo.

## 10. Novas ideias: origem das cifras e exportação de repertórios

Esta seção registra duas ideias novas. Ela complementa o plano do OneDrive (seção 5) e as ideias para depois (seção 8). Ainda não foram construídas.

### 10.1 Duas formas de trazer as cifras para o app

O app passa a aceitar as duas origens, que podem ser usadas juntas:

- **Importação manual** (já existe no protótipo): você escolhe PDF e DOCX no aparelho, ou arrasta os arquivos. Não precisa de conta Microsoft nem de internet, e serve de plano B se o OneDrive estiver fora do ar ou sem login.
- **Sincronização com o OneDrive** (etapa 2): você aponta a pasta de cifras, o app **baixa todas as cifras da pasta** para o aparelho e depois só atualiza o que mudou.

**Como as duas convivem:**

- Uma tela de configuração permite escolher a origem: só manual, só OneDrive, ou as duas.
- Cada cifra guarda de onde veio. As que vieram do OneDrive são identificadas pelo ID do item lá, então renomear ou mover o arquivo não perde etiquetas nem lugar nos repertórios.
- As cifras importadas manualmente ficam só no aparelho. Com o OneDrive conectado, haverá a opção de enviá-las para a pasta (etapa 2.5), e a partir daí elas passam a ser sincronizadas.
- Se a mesma cifra existir nas duas origens com o mesmo nome de arquivo, o app atualiza a existente em vez de duplicar, como já faz hoje na reimportação.
- Opcional, a decidir: em vez de baixar tudo de uma vez, o app poderia listar toda a pasta e baixar cada cifra só quando for aberta, ou quando for marcada como “disponível offline”. Isso economiza espaço, mas exige internet na primeira abertura. A sugestão inicial é baixar tudo, porque o uso principal é offline na igreja.

### 10.2 Exportar um repertório

No cartão de cada repertório entra um botão **Exportar**, com duas opções de formato. Cada uma pode ser **compartilhada** (menu de compartilhar do aparelho, para WhatsApp, e-mail, OneDrive e outros apps) ou **baixada**.

#### Opção A: arquivo .zip com todas as cifras

- Reúne os **arquivos originais** do repertório, sem alterar nada: PDFs e DOCX continuam como estão.
- Os nomes dentro do zip ganham um número de ordem, por exemplo `01 - Nome da música.pdf`, para ficarem na sequência do culto ao abrir a pasta.
- O zip é montado no próprio aparelho, com uma biblioteca de compactação (JSZip), sem enviar nada a nenhum servidor.
- Como PDFs já são compactados, o zip pode ser montado sem recompressão, o que o deixa mais rápido.
- Serve bem para mandar o repertório inteiro a outro músico, que abre cada cifra no app que preferir.

#### Opção B: um único PDF com todas as cifras

- Junta as cifras **na ordem do repertório** em um só arquivo PDF, bom para ler, imprimir ou mandar pelo celular.
- Para PDFs, as páginas são incorporadas com uma biblioteca de PDF (pdf-lib) e ajustadas para o mesmo tamanho A4, sem corte. Isso mantém o texto e também as **cifras escritas à mão** do Samsung Notes, sem perda de qualidade.
- **O ponto delicado são os arquivos DOCX e .doc**, que não podem ser juntados diretamente a um PDF. Há três caminhos:
  1. Avisar quais cifras ficaram de fora e deixar a escolha ao usuário.
  2. Converter no navegador, desenhando o DOCX como página. Funciona, mas o alinhamento dos acordes sobre a letra pode mudar.
  3. Usar a **conversão para PDF do próprio OneDrive**, que respeita melhor a formatação do Word. Precisa de internet e da conexão da etapa 2 (a confirmar com um arquivo seu).
- **Implementado com o caminho 1:** o PDF único inclui as cifras em PDF e as imagens, e avisa quais DOCX/DOC ficaram de fora, sugerindo o zip. Quem quiser garantir o resultado pode guardar as cifras do repertório em PDF ou imagem. O caminho 3 fica para depois do OneDrive.
- Acabamentos possíveis, a decidir: uma **capa ou índice** com o nome do repertório e a lista das músicas com o número da página; **marcadores** no PDF para pular entre as músicas; e um nome de arquivo automático, como `Repertório - Culto domingo.pdf`.

#### Compartilhar ou baixar

- **Compartilhar** abre o menu do aparelho com o arquivo anexado. Funciona como já funciona o botão ⤴ Compartilhar de uma cifra isolada. Se o aparelho não permitir compartilhar arquivos, o app oferece baixar.
- **Baixar** salva o arquivo no aparelho. Os formatos zip e PDF são aceitos pela permissão de download da página publicada aqui. Na hospedagem definitiva, será um download comum do navegador.

### 10.3 Pontos de atenção

- **Memória e tempo:** repertórios com muitas cifras ou PDFs grandes podem demorar no tablet e no iPhone. O app deve mostrar o andamento (por exemplo, “montando 5 de 12”) e não travar a tela.
- **Tamanho do arquivo:** alguns apps de mensagem limitam o tamanho de anexos. Se o zip ou o PDF ficar grande, vale avisar o tamanho antes de enviar.
- **Fidelidade:** o zip nunca altera os arquivos. O PDF único preserva o conteúdo dos PDFs, mas padroniza todas as páginas em A4; imagens também viram páginas A4. Pode alterar DOCX se for convertido no navegador.
- **Privacidade:** tudo é montado no aparelho. Os arquivos só saem dele quando você compartilha ou baixa.

### 10.4 Onde isso entra na ordem de trabalho

A exportação trabalha com os arquivos que já estão no aparelho, então **não depende do OneDrive** e pode ser feita logo depois do teste do protótipo (seção 4). O **zip do repertório e o PDF único já estão implementados**; falta apenas, mais adiante, a conversão de DOCX para PDF pelo OneDrive. Ordem sugerida:

1. **Zip do repertório**, com compartilhar e baixar. É a parte mais simples e a que menos muda os arquivos. *(feito)*
2. **PDF único** com cifras em PDF e imagens, com aviso sobre as que são DOCX/DOC. *(feito)*
3. **Conversão de DOCX para PDF** pelo OneDrive, depois que a etapa 2 estiver pronta.
4. **Origem das cifras** (manual, OneDrive ou ambas), junto da conexão com o OneDrive.

### 10.5 Decisões em aberto

- No PDF único, você prefere **capa com índice** ou só as cifras em sequência? *(hoje: só as cifras em sequência)*
- Para DOCX no PDF único: avisar e deixar de fora, ou tentar converter mesmo que o alinhamento dos acordes possa mudar? *(hoje: avisar e deixar de fora)*
- O app deve baixar **toda a pasta** do OneDrive de uma vez, ou só as cifras que você abrir ou marcar como offline?

## 11. OneDrive: requisitos atualizados e desenho técnico

Esta seção registra as decisões tomadas depois do protótipo e serve de guia para a etapa 2. **Nada disto está implementado ainda**; o zip do repertório e as correções de robustez já estão.

### 11.1 O que o app precisa fazer

- Entrar na conta Microsoft que tem o OneDrive.
- Escolher uma **pasta base** de cifras e mostrar qual é.
- **Baixar** para o aparelho os PDFs/DOCX que já estiverem na pasta, inclusive os enviados por fora (OneDrive web, OneSync, outro computador).
- **Enviar** para a pasta os arquivos importados manualmente no app.
- Manter sincronizados nome, artista, tom, etiquetas, favoritas, repertórios e a ordem das músicas.
- **Restaurar tudo** depois de reinstalar o app ou instalar em outro aparelho: mesmos metadados, mesmas listas e os arquivos baixados de novo.
- Continuar funcionando **offline** com o que já foi baixado.

### 11.2 Pré-requisito: HTTPS

Este é o ponto que muda o plano de teste no tablet:

- O login da Microsoft em app de página única (SPA) exige um **URI de redirecionamento HTTPS** (a exceção é `http://localhost`, que só vale no próprio computador).
- O service worker e a instalação como PWA também exigem HTTPS.
- Abrir por `http://192.168.x.x:8000` continua servindo para testar importação, visualizador e zip, mas **não serve para o login do OneDrive no tablet**.
- O IndexedDB é separado por origem (esquema + domínio + porta). Um endereço fixo evita o tablet “perder” a biblioteca quando o IP do PC muda.

Opções para a etapa 2:

1. **GitHub Pages, Cloudflare Pages, Netlify ou Vercel** — HTTPS e endereço fixo de graça; o app continua sem servidor e as cifras continuam só no OneDrive e no aparelho.
2. **HTTPS local** com Caddy ou `mkcert`, instalando o certificado no tablet — funciona, mas dá mais manutenção e o endereço depende da rede.
3. **`localhost` no PC** — bom para desenvolver o login, mas não resolve o tablet.

A hospedagem serve só os arquivos estáticos do app; ela não recebe as cifras.

### 11.3 Login e escolha da pasta

- Registrar um app **SPA** no Microsoft Entra (portal.azure.com), aceitando contas pessoais da Microsoft.
- URI de redirecionamento: o endereço HTTPS onde o app estiver publicado.
- Permissões delegadas: `User.Read`, `Files.ReadWrite` e `offline_access` (para renovar a sessão). Se a banda for usar uma pasta compartilhada, avaliar `Files.ReadWrite.All`.
- Usar **MSAL.js** com fluxo de código + PKCE. Não há segredo de cliente nem senha guardada no app.
- Listar as pastas com `/me/drive/root/children`, deixar escolher uma e guardar o `folderItemId` (e o `driveId`) no aparelho. Oferecer criar uma pasta `Cifras` se não existir.
- O arquivo de metadados e arquivos temporários começam com `_` e são ignorados na lista de cifras.

### 11.4 Sincronização dos arquivos

- Identificar cada cifra pelo **`itemId` do OneDrive**, não pelo nome. Renomear ou mover não perde etiquetas nem lugar nos repertórios.
- Guardar `eTag`, `hash`, `size` e `lastModifiedDateTime`.
- Primeira sincronização: listar a pasta e baixar os PDFs/DOCX, com progresso.
- Depois: usar o **delta** da pasta (`/me/drive/items/{folderId}/delta`), guardando o `deltaLink`. Ele devolve criados, alterados, renomeados e apagados.
- Baixar com `/content`; enviar arquivos pequenos com `PUT /content` e grandes com **upload session** em partes.
- Tratar `429` (esperar `Retry-After`), `409`/`412` (conflito) e arquivos protegidos ou corrompidos sem derrubar a sincronização inteira.
- **Nunca apagar nada no OneDrive sem confirmação explícita.** Se o OneDrive criar uma cópia de conflito, mostrar as duas e deixar escolher.

### 11.5 Banco de dados compartilhado

Não vale sincronizar o arquivo binário do IndexedDB: ele não é portável e não mescla. O caminho é um **JSON pequeno** na própria pasta, por exemplo `_cifras-meta.json`:

```json
{
  "version": 1,
  "updatedAt": 0,
  "deviceId": "tablet-abc",
  "songs": {
    "uid-da-musica": {
      "name": "Nome",
      "artist": "Artista",
      "key": "G",
      "tags": ["louvor"],
      "fav": false,
      "file": "Nome.pdf",
      "itemId": "ID_NO_ONEDRIVE",
      "eTag": "...",
      "hash": "...",
      "size": 12345,
      "createdAt": 0,
      "updatedAt": 0,
      "deletedAt": null
    }
  },
  "lists": {
    "uid-do-repertorio": {
      "name": "Culto domingo",
      "items": ["uid-da-musica"],
      "createdAt": 0,
      "updatedAt": 0,
      "deletedAt": null
    }
  }
}
```

- Cada música e cada repertório tem um `uid` estável e um `updatedAt`.
- Fusão: para cada item, vence o `updatedAt` mais recente; em empate, um critério fixo (por exemplo, `deviceId`). Itens com `deletedAt` viram lápide para a exclusão se propagar.
- Gravação com **`If-Match` no eTag** do JSON. Se der `412`, baixar de novo, mesclar e tentar outra vez.
- O IndexedDB continua sendo o cache local; o JSON é a cópia de segurança/restauração dos metadados.
- **Restaurar:** entrar, escolher a pasta, baixar o `_cifras-meta.json`, recriar músicas e repertórios, baixar os arquivos e refazer o índice de texto. Se o JSON não existir, varrer a pasta e criar os metadados a partir dos arquivos.

### 11.6 Importação manual e envio

- Importar um arquivo no app grava no IndexedDB na hora, mesmo offline, e coloca o envio numa fila.
- Quando houver internet, o app envia o arquivo para a pasta. Depois do envio, grava `itemId`/`eTag`/`hash` e passa a tratá-lo como sincronizado.
- Se já existir um arquivo com o mesmo nome ou hash na pasta, o app **vincula** em vez de duplicar, como já faz a reimportação por nome.
- Se o mesmo arquivo for editado no tablet (Samsung Notes + OneSync) e no app, o OneDrive pode gerar conflito. O app mostra as versões e não escolhe sozinho.

### 11.7 Reinstalação e outro aparelho

1. Instalar o app no endereço HTTPS.
2. Entrar na conta Microsoft e escolher a mesma pasta.
3. Baixar `_cifras-meta.json` e restaurar etiquetas, favoritas e repertórios.
4. Baixar os arquivos e refazer o índice de busca.

A sugestão inicial é **baixar a pasta inteira**, porque o uso principal é offline na igreja. Baixar só ao abrir economiza espaço, mas exige internet na primeira vez.

### 11.8 Banda

- O OneDrive sincroniza bem o **seu** tablet e o **seu** iPhone com a mesma conta.
- Para a banda, cada integrante tem a própria conta Microsoft; acessar uma pasta compartilhada exige permissões e tratamento de itens compartilhados no Graph, o que é bem mais complexo.
- Até isso existir, **exportar zip/PDF e enviar** é o caminho simples e confiável para compartilhar com a banda.

### 11.9 Cuidados

- **OneSync + app:** os dois escrevem na mesma pasta. Evitar laço infinito comparando `eTag`/`hash` e só enviar quando o conteúdo local realmente mudou.
- **Atraso do OneSync:** uma edição feita com a caneta só chega ao app depois que o OneSync enviar. O botão “Sincronizar agora” e o estado “sincronizado há X minutos” ajudam.
- **Sessão:** o login pode expirar. Sem login, o app continua offline com o que já foi baixado; só a sincronização pausa.
- **Exclusão:** apagar no app não deve apagar no OneDrive sem confirmação. Decidir também o que fazer quando o arquivo é apagado no OneDrive: remover da biblioteca local ou manter a cifra sem arquivo.
- **Conflitos de metadados:** o “mais recente vence” é simples, mas depende do relógio dos aparelhos. O `deviceId` e o eTag do JSON reduzem o risco.
- **Segurança:** guardar o mínimo de token possível, usar as permissões mais estreitas e não criar segredo de cliente no app.

### 11.10 Ordem de implementação

1. Publicar em HTTPS (etapa 2.0) — sem isso não há login no tablet.
2. Cadastro no Entra e login com MSAL (etapas 2.1 e 2.2).
3. Escolha da pasta, download inicial e delta (etapa 2.3).
4. `_cifras-meta.json`, fusão e restauração (etapa 2.4).
5. Envio dos imports manuais e conflitos (etapa 2.5).
6. Indicador de sincronização, armazenamento persistente e conversão de `.doc` (etapa 2.6).
7. Pasta compartilhada com a banda, só se valer a pena depois.

### 11.11 Decisões em aberto

- Baixar a pasta inteira ou só o que for aberto/marcado como offline?
- Enviar automaticamente todo arquivo importado ou perguntar antes?
- Ao apagar uma cifra no app, criar lápide só nos metadados e manter o arquivo no OneDrive?
- Se o arquivo sumir do OneDrive, remover a cifra da biblioteca ou deixá-la como “arquivo ausente”?
- Usar uma pasta compartilhada da banda ou continuar com zip/PDF para os outros músicos?

---

## 12. Nuvem: decisão pelo Dropbox (substitui o OneDrive)

Esta seção substitui a etapa 2 do OneDrive. O desenho de sincronização é **o mesmo**; muda o provedor e os detalhes de login. O documento da seção 11 fica como referência caso haja vontade de voltar ao OneDrive depois.

### 12.1 Por que o Dropbox

Comparação feita em outubro de 2026, para o caso de uso real (uma pessoa administra, a banda acessa):

| Critério | OneDrive (Graph) | Google Drive | **Dropbox** |
|---|---|---|---|
| Login em app sem servidor | PKCE (MSAL.js) | Exige client secret — não há onde esconder num site público | **PKCE oficial, sem secret** |
| Aprovação/revisão do provedor | Sim, para escopos amplos | **Sempre**, com verificação do Google (semanas) | **Não**, se ficar em modo desenvolvimento |
| Limite de usuários conectados | — | — | **500** (muito acima do necessário) |
| Biblioteca oficial no navegador | MSAL.js | Google Identity Services | **SDK oficial com PKCE embutido** |
| Complexidade de configuração | Média (Entra ID) | Alta | **Baixa (App Console, poucos campos)** |
| Já é usado hoje | OneSync sincroniza a pasta | Não | Não |

O ponto decisivo: **o Dropbox permite o fluxo PKCE sem segredo de cliente e sem passar por revisão de produção**, desde que o número de usuários conectados fique abaixo de 500 — o que é folgado para o caso. No Google, um app de página única sem servidor **não tem onde guardar o secret** que a plataforma exige, e a verificação de app é um processo longo. No OneDrive o caminho existe, mas o cadastro no Entra ID é mais chato e você relatou travamento nele.

### 12.2 Segurança: o que pode e o que não pode ficar no código

| Item | Pode ficar no código (repositório público)? |
|---|---|
| App key / client ID | **Sim** — é público por definição |
| URI de redirecionamento | **Sim** — é o endereço público do app |
| App secret | **Não** — e não será usado (PKCE não tem secret) |
| Access token / refresh token | **Não** — ficam apenas no aparelho, nunca no repositório |
| Nome/ID da pasta pessoal | **Não** — escolhido em tempo de execução, guardado só no aparelho |
| Cifras e PDFs | **Não** — nunca saem do aparelho nem da nuvem do usuário |

Regra adicional: **nunca imprimir token no console**, nem em mensagem de erro.

### 12.3 Configuração única no Dropbox (o usuário faz, com passo a passo)

1. Acessar **https://www.dropbox.com/developers/apps** logado na conta que tem a pasta de cifras.
2. **Create app** → **Scoped access**.
3. Tipo de acesso: **Full Dropbox** (precisa enxergar a pasta que já existe; o modo “App folder” só veria uma pasta nova e vazia).
4. Nome do app: `Sistema de Cifras`.
5. Copiar o **App key** (é o client ID; não é segredo).
6. Na aba **Permissions**, marcar e **Submit**:
   - `account_info.read`
   - `files.metadata.read`
   - `files.content.read`
   - `files.content.write`
7. Na aba **Settings → OAuth 2 → Redirect URIs**, adicionar exatamente:
   ```
   https://tarcisiomoretti.github.io/sistema-cifras/
   ```
8. Copiar o **App key** e entregar para colar no app.

Notas importantes:
- O app fica em **development status**: funciona normalmente para até 500 usuários conectados, **sem revisão**.
- Alterar escopos depois **não** afeta quem já autorizou; cada usuário precisa autorizar de novo. Por isso, marcar todos os escopos necessários **de uma vez**.
- O **App secret** existe na tela, mas **não será usado**. Não colar em lugar nenhum.

### 12.4 Fluxo de login no app (PKCE)

1. O app gera um `code_verifier` aleatório e um `code_challenge` (SHA-256) usando a Web Crypto API.
2. O app abre a tela de autorização do Dropbox com o `code_challenge`.
3. O usuário entra na conta e autoriza.
4. O Dropbox devolve para o endereço do app um `code`.
5. O app troca o `code` + `code_verifier` por tokens, **sem enviar secret**.
6. O app guarda o **refresh token** (longa duração) e usa o access token (~4 horas), renovando sozinho quando expira.

Esse fluxo exige contexto seguro (HTTPS), que o GitHub Pages já fornece. O SDK oficial faz essa dança sozinho quando passado `usePKCE = true`.

### 12.5 O que será sincronizado

- **Arquivos**: PDFs e DOCX da pasta escolhida. O app lista os arquivos, baixa os que ainda não tem e envia os que foram importados no aparelho.
- **Metadados (`_cifras-meta.json`)**: arquivo pequeno gravado na própria pasta, com nome, artista, tom, etiquetas, favoritas e repertórios (com a ordem das músicas). É a ponte entre aparelhos e a cópia de segurança da organização.
- **Não** se sincroniza o IndexedDB: ele é interno do navegador, não portátil e não mesclável. O JSON é a fonte da parte “leve”; o IndexedDB continua sendo o banco local rápido e offline.

### 12.6 Regras de sincronização

- **Só manual**, disparada pelo botão **Sincronizar agora**. Nada automático ao abrir, nada em segundo plano. Isso evita competir com outros sincronizadores da pasta.
- **Direção**: baixar novidades e enviar o que foi importado no aparelho. Nunca apagar nada na nuvem sem confirmação explícita.
- **Conflito de metadados**: fusão campo a campo; se o mesmo campo mudou nos dois lados, vale o `updatedAt` mais recente. Exclusões viajam como “lápides” para não ressuscitar item apagado.
- **Conflito de arquivo**: comparar o **hash de conteúdo** do Dropbox (o SDK já calcula ao enviar) antes de subir. Se o arquivo mudou na nuvem e o app tem versão antiga, o app baixa a nova em vez de sobrescrever. Se os dois mudaram, o app **mostra as duas versões e deixa o usuário escolher** — nunca decide sozinho.
- **Identidade estável**: cada música é identificada pelo **ID do item no Dropbox**, não pelo nome. Renomear ou mover arquivo não perde etiquetas nem posição em repertório.
- **Sessão expirada**: o app avisa e pede para entrar de novo. Sem login, tudo continua funcionando offline com o que já foi baixado.

### 12.7 O cenário “todos na mesma conta”

Ponto que ainda precisa ser decidido, e que muda o desenho:

- **Todos usam a mesma conta** (mais simples): é preciso entrar **uma vez em cada aparelho**. O token de cada aparelho é independente e revogável no painel do Dropbox. A senha não deve circular por mensagem.
- **Cada um com a própria conta**: o app passa a listar também “compartilhados comigo”, e a pasta é compartilhada individualmente. Mais trabalho de implementação, mas cada pessoa é dona do próprio acesso.

Para o tamanho da banda, a primeira opção tende a bastar. Fica registrado como decisão em aberto.

### 12.8 Cuidados

- **Aprovação de produção**: se algum dia passar de 50 usuários conectados, o Dropbox abre uma janela de duas semanas para pedir aprovação de produção; se não for aprovado, a inclusão de novos usuários congela. Não se aplica ao caso atual, mas é bom saber.
- **Nome do app trava após aprovação de produção**: escolher bem antes de qualquer pedido de revisão.
- **Escopos retroativos**: marcar todos os escopos de uma vez, senão cada usuário precisa reautorizar depois.
- **Pasta compartilhada**: se o usuário criar uma pasta no Dropbox Web e o app precisar enxergá-la, o modo **Full Dropbox** já cobre isso (o modo App folder não).
- **Cota**: uploads contam para a cota do Dropbox; repertórios grandes podem falhar se a conta estiver cheia (mostrar erro claro).

### 12.9 Ordem de implementação

1. **Configuração no App Console** (usuário) e entrega do App key. *(falta — é o passo que destrava o login)*
2. **Login PKCE e botões Entrar/Sair** (SDK do Dropbox em `vendor/`, sem CDN). *(feito)*
3. **Escolha da pasta base** pelo navegador de pastas do Dropbox, guardando apenas o ID da pasta no aparelho. *(feito)*
4. **Download inicial + delta**: arquivos aparecem na biblioteca; reindexação da busca. *(feito)*
5. **`_cifras-meta.json`**: envio, fusão, restauração de etiquetas, favoritas e repertórios. *(feito — fusão por `updatedAt`)*
6. **Envio dos imports do aparelho** com verificação de revisão e tratamento de conflito. *(feito — envia o que não tem `cloudPath`)*
7. **Indicador de sincronização**: “sincronizado há X minutos”, “N pendentes”, “entrar novamente”. *(parcial — o modal mostra as pendências)*
8. **Pasta compartilhada com a banda**, só se valer a pena depois de tudo estável.

### 12.9.1 O que já está pronto no app

- Botão **☁ Nuvem** no cabeçalho. Sem o App key configurado, ele mostra as instruções em vez de quebrar.
- **Entrar/Sair** com PKCE, sem segredo de cliente. O `?code=` é retirado da barra de endereço assim que o login termina.
- **Escolher pasta** listando as pastas do Dropbox (a pasta escolhida fica só no aparelho).
- **Sincronizar agora**, manual, em duas etapas:
  1. **Lista tudo, sem baixar**: lê o `_cifras-meta.json` (etiquetas, favoritas e repertórios) e cria a ficha de cada cifra da pasta na biblioteca, marcando cada uma como **neste aparelho** ou **só na nuvem**. Também envia para a nuvem o que foi importado no aparelho.
  2. **Pergunta o que fazer** quando há cifras só na nuvem: *baixar todas agora* ou *só listar, baixo depois*.
- Cada cifra na biblioteca mostra um **☁** e a marca **nuvem** no subtítulo quando o arquivo não está no aparelho, com duas ações:
  - **⤓ Manter neste aparelho** — baixa só aquela cifra.
  - **⤒ Liberar espaço** — apaga o arquivo local e mantém a ficha e a cópia na nuvem.
- **Abrir uma cifra que só está na nuvem baixa na hora e abre**; ela fica guardada para as próximas vezes.
- **Exportar** (zip e PDF único) também baixa da nuvem o que faltar, em vez de deixar de fora.
- **Guardar numa pasta do aparelho (cartão SD)**: quando o navegador permite escolher uma pasta (`showDirectoryPicker`), o app passa a gravar e ler os arquivos **direto nessa pasta**, sem ocupar o armazenamento interno. A escolha fica na tela de nuvem; o handle é tentado no IndexedDB e a permissão é pedida de novo quando o navegador não a mantém (caso do Android).
- O token de atualização fica no `sessionStorage`: sobrevive a recarregamentos na mesma aba e desaparece ao fechar o navegador, exigindo novo login — comportamento conservador e seguro.

> Observação de segurança: hoje o token de atualização é mantido na sessão da aba. Isso é intencional nesta primeira versão; se o login frequente incomodar no tablet, dá para passar a guardá-lo de forma persistente mais adiante, com a devida avaliação de risco.

> Sobre a pasta do aparelho: a `showDirectoryPicker` só passou a existir no Chrome para **Android 132+** (janeiro de 2025) e a permissão **não é persistente** no Android — o app pede a pasta de novo quando o navegador não a lembra. Quando não há suporte, o app avisa e segue usando o armazenamento interno.

### 12.10 Decisões em aberto

- Todos na mesma conta ou cada um com a própria? *(propenso a: mesma conta, login manual em cada aparelho)*
- Ao apagar uma cifra no app, manter o arquivo na nuvem e criar só a lápide nos metadados?
- Se o arquivo sumir da nuvem, remover da biblioteca ou marcar como “arquivo ausente”?
- Sincronizar só no botão (decidido) — vale também um lembrete automático se houver pendências ao abrir?

*(Resolvido em 22/10: baixar a pasta inteira ou só o que for aberto → **perguntar sempre**, com a opção de baixar todas ou só listar. Onde guardar → **interno até o usuário escolher uma pasta do aparelho**.)*
