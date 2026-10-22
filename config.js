/* Configuração do Sistema de Cifras.
 *
 * Este arquivo guarda apenas valores PÚBLICOS. Nunca coloque aqui
 * App Secret, token de acesso ou qualquer dado privado: o repositório
 * é público.
 *
 * Como preencher o DROPBOX_APP_KEY:
 *   1. Acesse https://www.dropbox.com/developers/apps
 *   2. Create app -> Scoped access -> Full Dropbox
 *   3. Nome: Sistema de Cifras
 *   4. Aba Permissions: marque account_info.read, files.metadata.read,
 *      files.content.read e files.content.write, depois Submit.
 *   5. Aba Settings -> OAuth 2 -> Redirect URIs: adicione
 *      https://tarcisiomoretti.github.io/sistema-cifras/
 *   6. Copie o App key e cole abaixo entre as aspas.
 *
 * O login só aparece no app depois que este valor for preenchido.
 * O app key NÃO é segredo: ele só identifica qual aplicativo pede acesso.
 */
window.CIFRAS_CONFIG = {
  DROPBOX_APP_KEY: '6qmiez11xm1wcci'
};
