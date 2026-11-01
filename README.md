# Resenha v2

Salas estilo Discord com login, chat salvo, cargos e call com voz, câmera e tela.

- **Call (LiveKit Cloud):** servidor de mídia SFU com TURN embutido. Aguenta 7 a 10 pessoas sem pesar no PC de ninguém.
- **Banco e login (Supabase):** contas, salas, cargos, banimentos e histórico do chat. Projeto `resenha`, região São Paulo, já criado e configurado.
- **Render:** serve o site e gera as "chaves de entrada" da call só para quem é membro da sala.

## O que tem nesta versão (Fase 1)

| Área | Recursos |
| --- | --- |
| Contas | Cadastro, login, recuperação de senha, login com Google (precisa ativar) |
| Salas | Criar sala, link de convite, sala pública ou privada, explorar salas públicas, sair e excluir |
| Cargos | Dono, moderador e membro; cargos personalizados com nome, cor e permissões (expulsar, banir, gerenciar cargos, apagar mensagens); passar a posse |
| Moderação | Expulsar e banir (derruba da call na hora), lista de banidos e desbanir |
| Áudio e vídeo | Cancelamento de eco e de ruído, mutar e ensurdecer, volume individual (0 a 200%), escolha de microfone, saída e câmera, teste do microfone, indicador de quem fala, câmera, transmissão de tela com áudio |
| Chat | Histórico salvo no banco, chat da sala disponível fora da call, apagar mensagens, links clicáveis, anti-flood (5 mensagens a cada 5 segundos) |

Todas as permissões são checadas **no banco** (RLS + funções), não só na tela. Mesmo que alguém mexa no código do navegador, não consegue expulsar, banir ou ler salas sem permissão.

---

## Configuração (uma vez só)

### 1. LiveKit Cloud (a call)

1. Crie uma conta em **https://cloud.livekit.io** (plano Build, grátis).
2. Crie um projeto, por exemplo `resenha`.
3. Vá em **Settings → API Keys → Create key**.
4. Anote três coisas:
   - **URL** do projeto, tipo `wss://resenha-xxxx.livekit.cloud`
   - **API Key**
   - **API Secret** (aparece uma vez só; guarde)

O plano grátis tem 5.000 minutos-pessoa por mês. Com 7 pessoas, isso dá umas 12 horas de call cheia. O consumo aparece no painel do LiveKit.

### 2. Render (o site)

No seu serviço do Render, abra **Environment** e adicione:

| Variável | Valor |
| --- | --- |
| `LIVEKIT_URL` | a URL `wss://...livekit.cloud` |
| `LIVEKIT_API_KEY` | a API Key |
| `LIVEKIT_API_SECRET` | o API Secret |

O **Build Command** continua `npm install`, porque ele já compila o site sozinho, e o **Start Command** continua `npm start`.

### 3. Supabase (login)

O banco já está pronto. Faltam só alguns ajustes no painel, que eu não consigo fazer por aqui. Entre em **https://supabase.com/dashboard**, abra o projeto **resenha** e faça:

1. **Authentication → URL Configuration**
   - **Site URL:** o link do Render, por exemplo `https://seu-app.onrender.com`
   - **Redirect URLs:** adicione o mesmo link do Render e `http://localhost:3000`
2. **Authentication → Sign In / Providers → Email**
   - Recomendado: **desligue "Confirm email"**. O envio de e-mail grátis do Supabase manda poucas mensagens por hora. Se vários amigos se cadastrarem ao mesmo tempo, os e-mails de confirmação travam. A recuperação de senha continua funcionando.
3. **Login com Google (opcional)**
   - No [Google Cloud Console](https://console.cloud.google.com/apis/credentials), crie um **ID do cliente OAuth** do tipo "Aplicativo da Web".
   - Em "URIs de redirecionamento autorizados", coloque: `https://bwcfcielvdrdpseftstk.supabase.co/auth/v1/callback`
   - Copie o Client ID e o Client Secret para **Supabase → Authentication → Sign In / Providers → Google** e ative.

> O plano grátis do Supabase **pausa o projeto depois de 7 dias sem uso**. Se isso acontecer, entre no painel e clique em "Restore". Com a galera usando toda semana, ele não pausa.

---

## Atualizar o GitHub (vindo da versão 1)

A estrutura mudou, então:

1. No GitHub, **apague** os arquivos antigos `public/app.js` e `package-lock.json`.
2. Suba todos os arquivos deste zip: `server.js`, `package.json`, `package-lock.json`, `README.md`, a pasta `src` e a pasta `public`, substituindo os antigos.
3. Faça o commit. O Render atualiza sozinho em uns 3 minutos.

## Rodar no PC (opcional)

```bash
npm install
set LIVEKIT_URL=wss://...        (no Windows; no Linux/Mac use export)
set LIVEKIT_API_KEY=...
set LIVEKIT_API_SECRET=...
npm start
```

Abra `http://localhost:3000`.

## Estrutura

```
server.js           Express: /config, token do LiveKit, moderação
src/main.js         login, salas, cargos, chat, menus
src/call.js         call com LiveKit (voz, câmera, tela, volumes, dispositivos)
src/ui.js           componentes de interface
public/             HTML, CSS, ícones e app instalável (PWA)
public/dist/        gerado no build (não suba para o GitHub)
```

## Banco de dados (Supabase)

Tabelas: `profiles`, `rooms`, `room_members`, `room_roles`, `room_bans` e `messages`, todas com RLS. As ações sensíveis passam por funções que conferem a permissão: `create_room`, `join_room`, `kick_member`, `ban_member`, `create_role`, `assign_role`, `set_moderator`, `transfer_ownership` e outras.

Regras de hierarquia:
- Ninguém age sobre o dono.
- Moderadores só podem ser expulsos ou banidos pelo dono.
- Um membro com cargo só age sobre membros comuns.
- Ninguém cria um cargo com uma permissão que não tem.
