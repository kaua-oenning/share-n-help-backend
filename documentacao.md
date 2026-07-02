# Share&Help — Documentação Técnica (Backend)

API REST da plataforma **Share&Help**, uma plataforma de doação de itens que conecta doadores e solicitantes. Este documento cobre a arquitetura, o modelo de dados, as instruções de execução e a referência completa da API.

---

## 1. Visão geral

O backend é uma API REST em **Fastify + TypeScript**, com persistência em **PostgreSQL** via **Prisma ORM** (usando o adaptador `@prisma/adapter-pg`). Autenticação é feita por **JWT** e senhas são armazenadas com hash **bcrypt**.

Responsabilidades principais:

- Cadastro/login de usuários (auth JWT).
- CRUD de doações (`bens`) e o fluxo de confirmação doador ↔ destinatário.
- Registro de "interesses" em uma doação.
- Solicitações de itens (`requests`).
- Notificações por usuário.
- Perfil público de usuário com badges de gamificação.

### Stack

| Camada | Tecnologia |
|--------|-----------|
| Runtime | Node.js (>= 18) |
| Framework HTTP | Fastify 5 |
| Linguagem | TypeScript |
| ORM | Prisma 7 (`@prisma/client`) |
| Driver DB | `pg` + `@prisma/adapter-pg` |
| Banco | PostgreSQL |
| Auth | `@fastify/jwt` |
| Hash de senha | `bcryptjs` |
| Rate limit | `@fastify/rate-limit` |
| CORS | `@fastify/cors` |
| Dev runner | `tsx watch` |

---

## 2. Arquitetura

```
Cliente (frontend React)
        │  HTTP + JWT (Bearer)
        ▼
┌─────────────────────────────┐
│  Fastify app (server.ts)    │
│  ┌───────────────────────┐  │
│  │ Middlewares globais   │  │  cors · jwt · rate-limit
│  │ decorator authenticate│  │  jwtVerify → 401
│  └───────────────────────┘  │
│  Rotas (prefix /api):       │
│   authRoutes                │
│   bemRoutes                 │
│   requestRoutes             │
│   notificationRoutes        │
│   userRoutes                │
└─────────────┬───────────────┘
              │ Prisma Client (adapter-pg)
              ▼
        PostgreSQL
```

### Estrutura de pastas

```
share-n-help-backend/
├── prisma/
│   ├── schema.prisma          # Modelo de dados
│   └── migrations/            # Migrações SQL versionadas
├── src/
│   ├── server.ts              # Bootstrap: plugins, decorators, registro de rotas, listen
│   ├── database/
│   │   └── prisma.ts          # Instância do PrismaClient (pool pg + adapter)
│   └── routes/
│       ├── authRoutes.ts      # /auth/register, /auth/login
│       ├── bemRoutes.ts       # /bens/* (doações, interesses, fluxo de status)
│       ├── requestRoutes.ts   # /requests/* (solicitações)
│       ├── notificationRoutes.ts # /notifications/*
│       └── userRoutes.ts      # /users/:id/profile
├── prisma.config.ts           # Config de schema/migrations/datasource
├── package.json
└── tsconfig.json
```

### Configuração do servidor (`server.ts`)

- **CORS**: `origin: true` (reflete a origem), `credentials: true`, métodos GET/POST/PUT/PATCH/DELETE/OPTIONS.
- **JWT**: segredo obrigatório em `JWT_SECRET`. O processo **falha ao iniciar** se a variável estiver ausente.
- **Rate limit global**: 100 req/min por IP. Resposta 429 com mensagem `"Muitas requisições. Tente novamente em breve."` Algumas rotas têm limites mais estritos (ver tabela de endpoints).
- **Decorator `authenticate`**: `preHandler` que chama `request.jwtVerify()`. Em falha responde `401 { message: "Token inválido ou ausente." }`.
- **Listen**: porta `3000`, host `0.0.0.0`.

O payload do JWT contém: `{ sub: userId, name, email }`. Nas rotas autenticadas o usuário é lido em `request.user`.

---

## 3. Modelo de dados

### Diagrama de entidade-relacionamento

```
┌──────────────────┐
│      User        │
│──────────────────│
│ id (uuid) PK     │
│ name             │
│ email  UNIQUE    │
│ password (hash)  │
│ createdAt        │
│ updatedAt        │
└──────────────────┘
      │ 1        │ 1          │ 1
      │          │            │
      │ N        │ N          │ N
┌─────▼──────┐ ┌─▼─────────┐ ┌▼──────────────┐
│  Donation  │ │  Request  │ │ Notification  │
│────────────│ │───────────│ │───────────────│
│ id PK      │ │ id PK     │ │ id PK         │
│ title      │ │ name      │ │ userId FK     │
│ description│ │ phone     │ │ type          │
│ categoryId │ │ email?    │ │ message       │
│ condition  │ │ location  │ │ relatedItemId?│
│ imageUrl?  │ │ reason    │ │ read (bool)   │
│ contact*   │ │ items[]   │ │ createdAt     │
│ location   │ │ status    │ └───────────────┘
│ pickup*    │ │ userId FK │
│ status     │ │ createdAt │
│ interests# │ │ updatedAt │
│ donatedTo  │ └───────────┘
│  InterestId?│
│ *ConfirmedAt│
│ userId FK  │
└─────┬──────┘
      │ 1
      │ N
┌─────▼──────┐
│  Interest  │
│────────────│
│ id PK      │
│ name       │
│ phone      │
│ email      │
│ donationId FK
│ createdAt  │
└────────────┘
```

Relacionamentos:

- `User 1—N Donation` (`Donation.userId` → `User.id`, `onDelete: Cascade`)
- `User 1—N Request` (`onDelete: Cascade`)
- `User 1—N Notification` (`onDelete: Cascade`)
- `Donation 1—N Interest` (`Interest.donationId` → `Donation.id`, `onDelete: Cascade`)

### Tabelas

#### User
| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid | PK, default uuid |
| name | string | |
| email | string | **único** |
| password | string | hash bcrypt (cost 10) |
| createdAt | datetime | default now |
| updatedAt | datetime | auto |

#### Donation (`bens`)
| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid | PK |
| title | string | obrigatório |
| description | string | |
| categoryId | string | id de categoria (ver §7) |
| condition | string | estado do item |
| imageUrl | string? | opcional |
| contactName / contactEmail / contactPhone | string | contato do doador |
| location | string | cidade/localização |
| pickupDates / pickupTimes | string | disponibilidade de retirada |
| status | string | `available` \| `reserved` \| `pending_confirmation` \| `donated` |
| interestsNumber | int | default 0 |
| donatedToInterestId | string? | interesse selecionado para receber |
| donorConfirmedAt | datetime? | quando o doador confirmou a entrega |
| recipientConfirmedAt | datetime? | quando o destinatário confirmou o recebimento |
| userId | uuid | FK → User |
| createdAt / updatedAt | datetime | |

#### Interest
Demonstração de interesse de um usuário em uma doação.
| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid | PK |
| name / phone / email | string | dados de contato do interessado |
| donationId | uuid | FK → Donation |
| createdAt | datetime | |

#### Request
Pedido/solicitação de itens por quem precisa.
| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid | PK |
| name / phone | string | obrigatórios |
| email | string? | opcional |
| location / reason | string | obrigatórios |
| items | string[] | lista de itens, obrigatório não-vazio |
| status | string | default `active` (`active` \| `fulfilled` \| `expired`) |
| userId | uuid | FK → User |
| createdAt / updatedAt | datetime | |

#### Notification
| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid | PK |
| userId | uuid | FK → User (destinatário da notificação) |
| type | string | `new_interest` \| `recipient_confirm_request` \| `donation_confirmed` \| `selection_cancelled` \| `auto_confirmed` |
| message | string | texto exibido |
| relatedItemId | string? | id da doação relacionada |
| read | bool | default false |
| createdAt | datetime | |

---

## 4. Fluxo de doação (máquina de estados)

O ciclo de vida de uma `Donation` (`status`):

```
                        POST /bens/salvar
                              │
                              ▼
                       ┌────────────┐
        cancel-selection│ available  │
        ◄───────────────┤            │
        │               └─────┬──────┘
        │        PATCH /bens/:id/status
        │        (status=pending_confirmation, interestId)
        │        → notifica destinatário
        │               │
        │               ▼
        │        ┌──────────────────────┐
        └────────┤ pending_confirmation │
                 └──────────┬───────────┘
                            │
          ┌─────────────────┼──────────────────┐
          │ confirm-receipt │ auto (24h após   │
          │ (destinatário)  │ donorConfirmedAt) │
          ▼                 ▼                   
    ┌──────────┐      notificação "auto_confirmed"
    │  donated │◄─────────────┘
    └──────────┘
```

- **available → pending_confirmation**: doador seleciona um interesse (`interestId`), grava `donorConfirmedAt` e notifica o destinatário (`recipient_confirm_request`).
- **pending_confirmation → donated**: o destinatário confirma via `confirm-receipt` (grava `recipientConfirmedAt`, notifica o doador `donation_confirmed`); **ou** auto-confirmação após 24h (`auto_confirmed`).
- **pending_confirmation → available**: doador cancela a seleção (`cancel-selection`), limpa os campos de confirmação e notifica o destinatário (`selection_cancelled`).

**Auto-confirmação**: a função `autoConfirmExpired()` roda no início de `GET /bens` e `GET /bens/:id`. Qualquer doação em `pending_confirmation` com `donorConfirmedAt` há mais de 24h é marcada como `donated` automaticamente.

---

## 5. Execução do sistema

### Pré-requisitos

- **Node.js** >= 18
- **PostgreSQL** em execução e acessível
- **npm** >= 9

### 5.1 Variáveis de ambiente

Crie um `.env` na raiz do backend (baseado em `.env.example`):

```env
DATABASE_URL=postgresql://user:password@localhost:5432/sharenhelp
JWT_SECRET=TROQUE_POR_UM_SEGREDO_FORTE_AQUI
CORS_ORIGIN=http://localhost:5173
```

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | String de conexão PostgreSQL (usada pelo Prisma e pelo pool `pg`). |
| `JWT_SECRET` | Segredo de assinatura dos tokens JWT. **Obrigatório** — sem ela o servidor não inicia. |
| `CORS_ORIGIN` | Origem permitida (referência; atualmente o CORS reflete a origem via `origin: true`). |

### 5.2 Instalação

```bash
cd share-n-help-backend
npm install
```

### 5.3 Banco de dados / migrações

```bash
# Aplica as migrações existentes e gera o Prisma Client
npx prisma migrate deploy

# Em desenvolvimento, para criar/aplicar novas migrações:
npx prisma migrate dev

# Gerar o client manualmente (se necessário)
npx prisma generate

# Inspecionar dados
npx prisma studio
```

### 5.4 Rodando

```bash
# Desenvolvimento (hot reload via tsx)
npm run dev

# Build para produção (compila TS → dist/)
npm run build

# Produção
npm start
```

A API sobe em `http://localhost:3000`.

---

## 6. Referência da API

- **Base URL**: `http://localhost:3000`
- **Prefixo**: todas as rotas usam o prefixo `/api`.
- **Autenticação**: header `Authorization: Bearer <token>` nas rotas marcadas com 🔒.
- **Content-Type**: `application/json`.

### 6.1 Autenticação

#### `POST /api/auth/register`
Cria usuário e retorna token. Rate limit: 5/min.

Body:
```json
{ "name": "Ana", "email": "ana@email.com", "password": "segredo123" }
```
Respostas:
- `201` → `{ "token": "...", "user": { "id", "name", "email" } }`
- `400` → campos ausentes ou email já cadastrado.

#### `POST /api/auth/login`
Autentica e retorna token. Rate limit: 5/min.

Body:
```json
{ "email": "ana@email.com", "password": "segredo123" }
```
Respostas:
- `200` → `{ "token": "...", "user": { "id", "name", "email" } }`
- `400` → email/senha ausentes.
- `401` → credenciais inválidas.

### 6.2 Doações (`/bens`)

#### `GET /api/bens`
Lista doações com paginação. Roda auto-confirmação de expirados antes de responder.

Query: `page` (default 1), `limit` (default 12, máx 50), `status` (opcional, ex.: `available`).

Resposta `200`:
```json
{ "items": [ /* Donation + interests */ ], "total": 42, "page": 1, "limit": 12, "hasMore": true }
```

#### `GET /api/bens/count-by-category`
Contagem de itens **disponíveis** por categoria.
```json
{ "furniture": 3, "clothing": 7 }
```

#### `GET /api/bens/meus` 🔒
Lista as doações do usuário autenticado (inclui `interests`).

#### `GET /api/bens/:id`
Retorna uma doação com `interests` e `user` (`{ id, name }`). `404` se não existir.

#### `POST /api/bens/:id/interest` 🔒
Demonstra interesse em uma doação. Rate limit: 3/min.

Body: `{ "phone": "11999998888" }`
Regras: não pode ser dono do item; não pode repetir interesse (mesmo email).
- `200` → `{ "success": true }`
- `400` → telefone ausente / dono do item / já interessado.
- `404` → item não encontrado.

Efeito: cria `Interest` e notifica o dono (`new_interest`).

#### `POST /api/bens/salvar` 🔒
Cria uma doação. Rate limit: 10/hora.

Body (campos):
```json
{
  "title": "Sofá 3 lugares",
  "description": "Bom estado",
  "categoryId": "furniture",
  "condition": "usado",
  "location": "São Paulo, SP",
  "pickupDates": "Seg-Sex",
  "pickupTimes": "09h-18h",
  "contactName": "Ana",
  "contactPhone": "11999998888",
  "contactEmail": "ana@email.com",
  "status": "available",
  "imageUrl": null,
  "interestsNumber": 0
}
```
Obrigatórios: `title`, `categoryId`, `location`. `status` default `available`.
- `200` → `{ "success": true, "id": "...", "bem": { ... } }`

#### `PUT /api/bens/:id` 🔒
Edita uma doação (somente o dono). Campos são atualizados apenas se enviados (partial update): `title, description, categoryId, condition, location, pickupDates, pickupTimes, contactName, contactPhone, contactEmail, imageUrl`.
- `200` → `{ "success": true, "bem": { ... } }`
- `403` → não é o dono. `404` → não existe.

#### `PATCH /api/bens/:id/status` 🔒
Atualiza status (somente o dono). Ver §4.

Body: `{ "status": "pending_confirmation", "interestId": "<id>" }`
Ao mover para `pending_confirmation` com `interestId`: grava `donatedToInterestId`, `donorConfirmedAt` e notifica o destinatário.
- `200` → `{ "success": true }`

#### `PATCH /api/bens/:id/confirm-receipt` 🔒
Destinatário confirma o recebimento. Exige status `pending_confirmation` e que o email do usuário atual bata com o interesse selecionado. Marca `donated`, grava `recipientConfirmedAt` e notifica o doador.
- `200` → `{ "success": true }`
- `400` → item não está aguardando confirmação. `403` → não é o destinatário.

#### `PATCH /api/bens/:id/cancel-selection` 🔒
Doador cancela a seleção; volta para `available`, limpa confirmações e notifica o destinatário (`selection_cancelled`).
- `200` → `{ "success": true }`

### 6.3 Solicitações (`/requests`)

#### `GET /api/requests`
Lista solicitações com `status = active` (ordem decrescente por data).

#### `GET /api/requests/:id`
Retorna uma solicitação. `404` se não existir.

#### `GET /api/requests/minhas` 🔒
Solicitações do usuário autenticado.

#### `POST /api/requests` 🔒
Cria solicitação. Rate limit: 10/hora.

Body:
```json
{
  "name": "João",
  "phone": "11988887777",
  "email": "joao@email.com",
  "location": "Campinas, SP",
  "reason": "Família em situação de vulnerabilidade",
  "items": ["cobertor", "fogão"]
}
```
Obrigatórios: `name`, `phone`, `location`, `reason`, `items` (array não-vazio). `email` opcional.
- `201` → `{ "success": true, "request": { ... } }`

#### `DELETE /api/requests/:id` 🔒
Exclui uma solicitação própria. `403` se não for o dono; `404` se não existir.
- `200` → `{ "success": true }`

### 6.4 Notificações (`/notifications`)

#### `GET /api/notifications` 🔒
Últimas 20 notificações do usuário + contagem de não lidas.
```json
{ "notifications": [ ... ], "unreadCount": 3 }
```

#### `PATCH /api/notifications/read-all` 🔒
Marca todas como lidas. → `{ "success": true }`

#### `PATCH /api/notifications/:id/read` 🔒
Marca uma como lida (somente do próprio usuário). `403`/`404` conforme o caso.

### 6.5 Usuário (`/users`)

#### `GET /api/users/:id/profile`
Perfil público + estatísticas e badges de gamificação.
```json
{
  "id": "...",
  "name": "Ana",
  "createdAt": "...",
  "totalDonations": 12,
  "totalCompleted": 5,
  "badges": ["first_donation", "active_donor"],
  "donations": [ /* itens com status donated */ ]
}
```

**Badges** (por número de doações concluídas):
| Badge | Condição |
|-------|----------|
| `first_donation` | >= 1 |
| `active_donor` | >= 5 |
| `frequent_donor` | >= 10 |
| `veteran` | >= 20 |

---

## 7. Categorias

`categoryId` das doações usa os seguintes valores (definidos no frontend em `lib/data.ts`):

| id | Nome |
|----|------|
| `beds` | Camas |
| `clothing` | Roupas |
| `furniture` | Móveis |
| `kitchen` | Cozinha |
| `appliances` | Eletrodomésticos |
| `baby` | Bebê |
| `hygiene` | Higiene |
| `food` | Alimentos |
| `other` | Outros |

---

## 8. Segurança

- **Senhas**: hash bcrypt (cost 10); nunca retornadas nas respostas.
- **JWT**: obrigatório em rotas protegidas; expira/inválido → `401`.
- **Rate limiting**: global (100/min) + limites específicos em auth (5/min), interesse (3/min), criação de doação/solicitação (10/hora).
- **Autorização por dono**: edição/exclusão/mudança de status validam `userId` do recurso contra o `sub` do token (`403` caso não confira).
- **Cascade delete**: remover um usuário remove suas doações, solicitações, interesses e notificações associadas.

### Pontos de atenção

- `CORS_ORIGIN` está definida no `.env`, mas o servidor usa `origin: true` (reflete qualquer origem). Em produção, restrinja a origem.
- O `.env` do repositório contém um `JWT_SECRET` de exemplo — troque por um segredo forte e nunca versione segredos reais.

---

## 9. Códigos de status usados

| Código | Significado |
|--------|-------------|
| 200 | Sucesso |
| 201 | Recurso criado (register, request) |
| 400 | Requisição inválida / regra de negócio |
| 401 | Não autenticado / credenciais inválidas |
| 403 | Sem permissão (não é o dono) |
| 404 | Recurso não encontrado |
| 429 | Rate limit excedido |
| 500 | Erro interno |
