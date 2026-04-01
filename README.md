# Sistema de retirada de kits

Aplicacao web simples para sua assessoria registrar atletas e organizar a retirada de kits.

## O que o sistema faz

- Cadastra nome completo, distancia e tamanho da camisa
- Mostra os nomes abaixo da lista, separados por distancia
- Ordena alfabeticamente dentro de cada distancia
- Mantem os dados salvos no navegador com `localStorage` e `IndexedDB`
- Exporta um arquivo CSV que pode ser aberto no Excel
- Pode carregar e enviar cada cadastro para um Google Sheets com Apps Script

## Como usar

1. Abra o arquivo `index.html` no navegador.
2. Preencha os campos e clique em `Enviar`.
3. A lista atualizada aparece automaticamente na mesma pagina.
4. Clique em `Exportar CSV` quando quiser baixar a planilha para Excel.

## Persistencia dos dados

- Sem Google Sheets: os cadastros ficam guardados no navegador atual. Se a pagina estiver sendo aberta diretamente como arquivo local, alguns navegadores podem limpar ou isolar esses dados.
- Com Google Sheets: a lista passa a ser carregada novamente sempre que a pagina abrir, o que resolve a perda de dados entre acessos.
- No modo `GOOGLE_SHEETS_ONLY_MODE`, o navegador limpa os dados locais ao entrar e mostra somente o que estiver salvo na planilha.

## Google Sheets opcional

Se quiser receber tudo em uma planilha online:

1. Crie uma planilha no Google Sheets.
2. Abra `Extensoes > Apps Script`.
3. Cole o conteudo de `google-apps-script/Code.gs`.
4. Publique como `Aplicativo da Web` com acesso para qualquer pessoa com o link.
5. Copie a URL publicada.
6. No arquivo `app.js`, preencha a constante `GOOGLE_SCRIPT_URL`.

Assim, cada novo cadastro sera salvo na tela, enviado para a planilha e recarregado automaticamente ao abrir a pagina novamente.

Importante:

- URL errada: `https://docs.google.com/spreadsheets/...`
- URL correta: `https://script.google.com/macros/s/.../exec`

Se quiser usar somente os dados da planilha, deixe `GOOGLE_SHEETS_ONLY_MODE = true` no arquivo `app.js`.
