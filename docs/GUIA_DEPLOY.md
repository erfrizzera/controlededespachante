# Guia de Deploy — Controle de Despachante

Como colocar o sistema no ar. São duas metades: o **motor** (Apps Script) e a
**moldura** (GitHub Pages). Faça o motor primeiro — ele te dá a URL que a moldura precisa.

---

## Parte 1 — Motor (Google Apps Script)

### 1.1 Criar o projeto
1. Acesse <https://script.google.com> → **Novo projeto**.
2. Apague o `Código.gs` de exemplo.
3. Cole o conteúdo de `apps-script/Codigo.gs` (arquivo de script).
4. Crie um arquivo HTML chamado **`App`** (menu **+** → HTML) e cole `apps-script/App.html`.
5. Em **Configurações do projeto** (engrenagem), marque *"Mostrar o arquivo de manifesto
   `appsscript.json`"*. Abra o `appsscript.json` que apareceu e cole o nosso
   (`apps-script/appsscript.json`) — é o que define acesso anônimo.

> Alternativa via **clasp** (terminal): `clasp create --rootDir apps-script` dentro da pasta
> do projeto, depois `clasp push`. Requer Node instalado.

### 1.2 Publicar como Web App
1. **Implantar → Nova implantação → tipo: App da Web.**
2. Configure:
   - **Executar como:** *Eu* (sua conta).
   - **Quem tem acesso:** *Qualquer pessoa* (anônimo).
3. **Implantar** e autorize as permissões que o Google pedir (Sheets, Drive, e-mail).
4. Copie a **URL do app** (termina em `/exec`). Guarde — a moldura vai usar.

### 1.3 Cadastrar quem pode entrar
1. Na 1ª execução o sistema cria sozinho a planilha *"Controle Despachante — Base de Dados"*
   (ache no seu Drive) com as abas `Atas` e `Usuarios`.
2. Na aba **`Usuarios`**, adicione uma linha por pessoa: `Email` · `Permissão` · `Senha`.
   > A senha fica em texto puro nesta coluna (ponto a endurecer no futuro).

### ⚠️ Armadilha do clasp (se usar terminal)
O `clasp` **não** atualiza o nível de acesso de uma implantação que já existe. Depois de um
`clasp push`, vá em **Implantar → Gerenciar implantações → editar (lápis) → Nova versão** e
confirme *"Qualquer pessoa"*. Se colar direto no editor web, isto não é problema.

### Por que o login do Google NÃO aparece
O código evita de propósito `Session.getActiveUser()` e `Session.getScriptTimeZone()` — a
mera presença delas obrigaria login Google. O fuso vem da planilha
(`getSpreadsheetTimeZone()`). Não reintroduza essas chamadas.

---

## Parte 2 — Moldura (GitHub Pages)

1. Crie um repositório no GitHub e suba a pasta do projeto (menos `apps-script/`, que já
   vive no Apps Script — mas pode subir junto, não atrapalha).
2. Abra `index.html` e cole a URL do passo **1.2** na variável:
   ```js
   var APP_URL = "https://script.google.com/macros/s/SEU_ID/exec";
   ```
3. Em **Settings → Pages**, selecione a branch `main` e a pasta **/ (root)**. Salve.
4. Em alguns minutos o site fica em `https://SEU_USUARIO.github.io/SEU_REPO/`.
   Esse é o **endereço bonito** — a moldura abre o app do Google por dentro.

### (Opcional) Avisar o e-mail com o endereço bonito
Para os e-mails automáticos apontarem para a moldura (e não para a URL do Google), no Apps
Script vá em **Configurações do projeto → Propriedades do script** e crie:
`SYSTEM_URL` = `https://SEU_USUARIO.github.io/SEU_REPO/`.

### (Futuro) Domínio próprio
Quer `atas.suaempresa.com.br`? Aponte o domínio para o GitHub Pages (Settings → Pages →
Custom domain). A moldura já deixa tudo pronto para isso.

---

## Testar sem publicar nada
Abra `apps-script/App.html` direto no navegador: ele detecta que não está no Google, **pula
o login** e roda em **modo local** com 3 atas de exemplo. Serve para ver a cara do sistema.
