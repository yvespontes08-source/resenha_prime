# Resenha

Site no estilo Discord para ficar em call com os amigos:

- **Sala de voz** com indicador de quem está falando
- **Transmissão de tela** (com o áudio da aba/tela, quando o navegador permite), em destaque e com tela cheia
- **Chat de texto** com links clicáveis
- Botões de mutar, ensurdecer e sair, além de convite por link

O áudio e a tela vão direto de um navegador para o outro (WebRTC). O servidor só faz a "apresentação" entre as pessoas e guarda as últimas 100 mensagens do chat enquanto a sala existir.

---

## Rodar no seu computador

Precisa do [Node.js](https://nodejs.org) 18 ou mais novo.

```bash
npm install
npm start
```

Abra `http://localhost:3000`. Para testar, abra duas abas, entre com nomes diferentes e use o mesmo código de sala.

> No `localhost` o navegador libera o microfone e a tela. Para os amigos entrarem de outros lugares, o site precisa estar na internet com **HTTPS**, como no passo abaixo.

---

## Colocar no ar de graça (Render)

1. Crie um repositório no GitHub e suba esta pasta (sem a `node_modules`).
2. Entre em [render.com](https://render.com), clique em **New → Web Service** e conecte o repositório.
3. Configure:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
4. Clique em **Deploy**. Em alguns minutos você recebe um link `https://seu-app.onrender.com`.
5. Entre na sala e clique no ícone de **convite** (o bonequinho com +) para copiar o link e mandar para a galera.

O plano grátis do Render "dorme" depois de uns 15 minutos sem ninguém usando. O primeiro acesso depois disso demora cerca de 1 minuto para acordar, e depois funciona normal.

Também roda em Railway, Fly.io ou numa VPS. Basta ter Node e suporte a WebSocket.

---

## Se algum amigo não conseguir se conectar

Na maioria das redes a conexão direta funciona. Em algumas redes mais fechadas (alguns 4G e redes de empresa ou faculdade), a pessoa entra na sala mas não ouve ninguém. Para esses casos, configure um servidor **TURN**, que repassa o áudio.

Um jeito grátis é o [Metered (Open Relay)](https://www.metered.ca/tools/openrelay/). Crie a conta, pegue as credenciais e adicione estas variáveis de ambiente no Render (**Environment**):

| Variável | Exemplo |
| --- | --- |
| `TURN_URL` | `turn:global.relay.metered.ca:80,turn:global.relay.metered.ca:443?transport=tcp` |
| `TURN_USERNAME` | seu usuário |
| `TURN_CREDENTIAL` | sua senha |

---

## Limites

- Até **8 pessoas por sala** por padrão. Cada pessoa conecta direto com cada outra, então salas grandes pesam na internet de quem transmite. Para mudar o limite, defina a variável `MAX_PER_ROOM`.
- A transmissão de tela funciona no **computador** (Chrome, Edge, Firefox). No celular dá para entrar, falar, ouvir e assistir, mas não transmitir.
- O áudio da tela aparece quando você escolhe uma **aba do Chrome/Edge** ou a **tela inteira no Windows** e marca "compartilhar áudio".
- O chat não é salvo: quando todo mundo sai, a sala e as mensagens somem.

## Estrutura

```
server.js          servidor (Express + Socket.io): salas, sinalização, chat
public/index.html  interface
public/style.css   visual
public/app.js      voz, tela e chat (WebRTC)
```
