# Zézão Higicenter — Site + ADM CONFIG

Site institucional com painel administrativo completo ("ADM CONFIG"), sem
nenhuma dependência externa de npm — roda só com Node.js puro.

---

## 1. O que foi implementado

- **Site público preservado**: mesmo design, mesma identidade visual, mesmas
  seções (Hero, Problema, Serviços, Antes e Depois, Galeria, Autoridade,
  Como Funciona, Depoimentos, Instagram, FAQ, CTA final), agora **alimentado
  dinamicamente** por dados vindos do banco de dados em vez de texto fixo no
  HTML.
- **ADM CONFIG** (`/admin`): painel de administração real e funcional:
  - Login seguro (usuário/senha com hash, sessão em cookie HttpOnly).
  - Dashboard com contadores gerais.
  - Configurações do site (nome, cidade, telefone, e-mail, endereço, horário, Facebook).
  - Logo e favicon (upload real, troca refletida no site na hora).
  - Textos principais do Hero (título/subtítulo).
  - Serviços: criar, editar, excluir, reordenar, ativar/desativar, imagem própria.
  - Vídeos de "Antes e Depois": criar, editar, substituir vídeo, excluir, ativar/desativar.
  - Depoimentos: nome, texto, vídeo ou foto do cliente, ativar/desativar, excluir.
  - Galeria: upload de fotos, legenda, ativar/desativar, excluir.
  - Biblioteca geral de Fotos e Vídeos (para uso avulso em qualquer lugar do site).
  - WhatsApp e Contatos: número, Instagram, e as 4 mensagens automáticas de cada botão.
  - Segurança: trocar usuário, trocar senha (com confirmação da senha atual),
    ver último login/última troca de senha, encerrar todas as sessões.
- **Upload real de arquivos**, com validação de verdade no servidor (tipo,
  assinatura de bytes do arquivo, tamanho máximo) — não é só um formulário
  bonito, o arquivo é validado e gravado em disco.
- **Persistência real**: tudo é salvo em `data/db.json` no servidor (não em
  localStorage do navegador). Testei isso na prática: alterei dados, derrubei
  o servidor, subi de novo, e os dados continuaram lá (inclusive senha trocada).

### Por que sem framework (Express) e sem banco tradicional (Postgres/MySQL)?

O ambiente onde construí este projeto não tem acesso à internet, então não
consegui rodar `npm install`. Em vez de entregar um projeto que dependesse de
pacotes que eu não pude nem baixar nem testar, escrevi tudo com os módulos
nativos do Node.js (`http`, `crypto`, `fs`). Isso tem um efeito colateral bom
para você: **não existe `npm install` a fazer** — é só `node server.js` e
funciona, em qualquer lugar que tenha Node instalado.

Da mesma forma, em vez de um banco de dados tradicional, os dados ficam em
`data/db.json`, com escrita atômica em disco (não corrompe se a energia
cair no meio de uma gravação). Para o tamanho deste site, isso é uma solução
real e adequada. Se um dia o negócio crescer muito e precisar de um banco
"de verdade" (Postgres, por exemplo), a troca é localizada: só o arquivo
`lib/db.js` precisaria mudar — nenhuma rota da API muda.

**Eu testei cada uma dessas funcionalidades de verdade** (login, bloqueio sem
sessão, senha errada, CSRF, upload de arquivo válido, rejeição de arquivo
malicioso, troca de senha, e persistência completa após reiniciar o
servidor) antes de te entregar — não é "confia que funciona", eu rodei o
servidor aqui e testei com `curl`.

---

## 2. Arquivos do projeto

```
server.js              → servidor principal (rotas, sessão, estáticos)
package.json           → sem dependências
.env.example           → modelo de variáveis de ambiente
lib/
  db.js                 → banco de dados em arquivo JSON
  auth.js               → hash de senha, sessão, rate limiting de login
  upload.js             → validação e gravação de arquivos enviados
  api.js                → todos os endpoints da API
public/                 → SITE PÚBLICO
  index.html
  app.js                → busca /api/site-content e popula a página
  style.css
  assets/                → logo e vídeos padrão (usados até você trocar pelo painel)
admin/                  → ADM CONFIG
  index.html
  admin.js
  admin.css
uploads/                → arquivos enviados pelo painel (logo, fotos, vídeos)
data/                   → data/db.json é criado automaticamente no 1º start
```

---

## 3. Novas rotas criadas

**Públicas** (sem login):
- `GET /` — site público
- `GET /api/site-content` — dados públicos (config, serviços, depoimentos, galeria, vídeos)
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session`

**Administrativas** (exigem sessão válida — todas retornam 401 sem login):
- `GET/PUT /api/admin/config`
- `POST /api/admin/logo`, `POST /api/admin/favicon`
- `GET/POST /api/admin/services`, `PUT/DELETE /api/admin/services/:id`, `POST /api/admin/services/reorder`
- O mesmo padrão para `/api/admin/testimonials`, `/api/admin/gallery`, `/api/admin/photos`, `/api/admin/videos`
- `POST /api/admin/upload/image`, `POST /api/admin/upload/video`
- `GET /api/admin/security`, `PUT /api/admin/security/username`, `PUT /api/admin/security/password`, `POST /api/admin/security/logout-all`
- `GET /api/admin/dashboard`

---

## 4. Como rodar localmente

```bash
cd zezao-higicenter-site
node server.js
```

Acesse:
- Site: `http://localhost:3000/`
- ADM CONFIG: `http://localhost:3000/admin`

Na primeira vez que o servidor roda, ele cria `data/db.json` automaticamente,
usando as credenciais das variáveis de ambiente (ou os valores padrão do
`.env.example` se nenhuma variável for definida).

## 5. Variáveis de ambiente

Copie `.env.example` para `.env` e ajuste se quiser (opcional para rodar
localmente — os padrões já são os do briefing):

```
PORT=3000
ADMIN_USERNAME=Programador
ADMIN_PASSWORD=Pro26higi@
FORCE_SECURE_COOKIE=false
```

**Importante**: essas variáveis só são lidas na primeira execução, para criar
o usuário admin inicial. Depois disso, a senha vive como hash dentro de
`data/db.json` e só pode ser trocada pela tela "Segurança" do ADM CONFIG —
mudar o `.env` depois não muda mais nada.

---

## 6. Como acessar o ADM CONFIG

1. Abra `/admin` (link discreto também disponível no rodapé do site público).
2. Usuário inicial: `Programador`
3. Senha inicial: `Pro26higi@`

## 7. Como trocar a senha do administrador

1. Entre no ADM CONFIG → aba **Segurança**.
2. Preencha "Alterar senha": senha atual + nova senha (mín. 8 caracteres) + confirmação.
3. Ao salvar, todas as sessões são encerradas automaticamente (por segurança)
   e você precisa fazer login de novo com a nova senha.

## 8. Como fazer upload de fotos e vídeos

- **Logo/Favicon**: aba "Logo e Identidade" → escolher arquivo → "Enviar".
- **Fotos de um serviço**: aba "Serviços" → escolher o arquivo de imagem no
  próprio card do serviço → "Salvar".
- **Vídeos de Antes e Depois**: aba "Antes e Depois" → "+ Novo vídeo" → escolher
  o arquivo de vídeo no card → "Salvar".
- **Depoimentos**: aba "Depoimentos" → "+ Novo depoimento" → anexar vídeo ou
  foto do cliente → "Salvar".
- **Galeria**: aba "Galeria" → escolher imagem + legenda → "Adicionar à galeria".
- **Biblioteca geral**: abas "Fotos" e "Vídeos" — para arquivos avulsos que
  você quer guardar e usar depois (a URL gerada aparece ao lado de cada item).

Formatos aceitos: **JPG, PNG, WEBP** (imagens, até 8MB) e **MP4, WEBM**
(vídeos, até 80MB). Qualquer outro formato, ou arquivo malicioso disfarçado
de imagem/vídeo, é rejeitado pelo servidor (testei isso enviando um arquivo
falso — foi barrado corretamente).

---

## 9. Colocando em produção (checklist)

Este projeto roda localmente, mas **eu não tenho como hospedá-lo publicamente
a partir daqui** — não há servidor com IP público, domínio ou banco de dados
externo neste ambiente. Para publicar de verdade:

1. **Escolha uma hospedagem que rode Node.js continuamente** — ex: Render,
   Railway, um VPS (DigitalOcean, Hetzner), ou similar. Como não há
   dependências no `package.json`, o deploy é literalmente subir a pasta e
   rodar `node server.js` (ou `npm start`).
2. **Configure as variáveis de ambiente** no painel da hospedagem (`PORT` é
   geralmente definido automaticamente pela hospedagem; defina
   `ADMIN_USERNAME`/`ADMIN_PASSWORD` na primeira vez).
3. **Configure `FORCE_SECURE_COOKIE=true`** assim que o site estiver atrás de
   HTTPS (a maioria das hospedagens modernas já fornece HTTPS automático).
4. **Garanta que as pastas `data/` e `uploads/` sejam persistentes** — em
   algumas hospedagens (ex: containers efêmeros), o disco é apagado a cada
   deploy. Se for o caso da sua hospedagem, será necessário usar um "volume
   persistente" (a maioria oferece essa opção) apontando para essas duas
   pastas, ou migrar para armazenamento externo (ex: um bucket S3) —
   me avise se chegar nessa etapa que ajudo a adaptar.
5. **Troque a senha padrão** assim que o site estiver no ar (veja seção 7).
6. Aponte seu domínio (ex: `zezaohigicenter.com.br`) para essa hospedagem.

---

## 10. Verificação de segurança (feita antes da entrega)

- ✅ Senha nunca aparece no frontend, HTML, JS público ou respostas da API.
- ✅ Senha armazenada como hash (scrypt + salt aleatório), nunca em texto puro.
- ✅ Toda rota `/api/admin/*` retorna 401 sem sessão válida — testado
  diretamente por linha de comando, sem passar pela interface.
- ✅ Upload valida tipo real do arquivo (assinatura de bytes), não só a
  extensão — testado enviando um arquivo falso, foi rejeitado.
- ✅ Nome de arquivo de upload é gerado pelo servidor (nunca o nome enviado
  pelo navegador) — evita path traversal.
- ✅ Logout e troca de senha invalidam a sessão / todas as sessões.
- ✅ Rate limiting: 5 tentativas de login por IP a cada 15 minutos.
- ✅ Proteção básica contra CSRF via cabeçalho customizado nas rotas que alteram dados.
- ✅ Persistência real testada com reinício completo do servidor no meio do teste.

## 11. Limitações conhecidas e próximos passos possíveis

- Nem todo texto fixo do site (ex: seção de FAQ, seção "Mais do que limpar")
  foi conectado ao painel — priorizei o que o briefing pedia explicitamente
  (logo, nome, WhatsApp, textos do Hero, serviços, depoimentos, galeria,
  vídeos). Dá para estender o mesmo padrão para qualquer outro texto, é só pedir.
- A reordenação de itens usa botões "↑/↓" em vez de arrastar-e-soltar — mais
  simples de manter e igualmente funcional.
- Sessões ficam em memória (somem se o servidor reiniciar, exigindo novo
  login — isso é esperado e não é um bug). Os dados salvos (conteúdo do
  site) sim, persistem sempre.
