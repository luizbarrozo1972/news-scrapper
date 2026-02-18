# News Scraper Platform

AI-assisted, multi-theme news/content scraping platform with a claims-first pipeline.

## Tech Stack

- **Frontend**: Next.js 16 (App Router), shadcn/ui, Tailwind CSS
- **Auth**: NextAuth.js v5 (Credentials)
- **Database**: PostgreSQL via Prisma ORM
- **Extraction**: Readability (Mozilla)

## Setup

### Prerequisites

- Node.js 20+
- Docker (for local PostgreSQL)
- npm

### 1. Install dependencies

```bash
npm install
```

### 2. Start database

```bash
docker compose up -d
```

### 3. Configure environment

Copy `.env.example` to `.env` and set:

- `DATABASE_URL` - PostgreSQL connection string (default: `postgresql://postgres:postgres@localhost:5432/news_scrapper`)
- `NEXTAUTH_SECRET` - Generate with `openssl rand -base64 32`
- `NEXTAUTH_URL` - e.g. `http://localhost:3000`
- `GOOGLE_VERTEX_API_KEY` or `GEMINI_API_KEY` - **Required for AI features** (config assistant, claim extraction, fact-check)

#### Getting API Keys

**Google Vertex AI / Gemini API Key:**
1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey) or [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new API key
3. Copy the key to your `.env` file as `GOOGLE_VERTEX_API_KEY` or `GEMINI_API_KEY`

**Note:** Without an API key, the AI Config Assistant will use rule-based fallback parsing. Other AI features (claim extraction, fact-check) require the API key.

### 4. Run migrations

```bash
npx prisma migrate dev
```

### 5. Start dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Register an account, then create a theme and run ingestion.

## Project structure

- `src/app` - Next.js App Router pages and API routes
- `src/components` - React components (shadcn + custom)
- `src/lib` - Utilities (auth, prisma, extraction, hmac)
- `prisma` - Schema and migrations
- `docker-compose.yml` - Local PostgreSQL

## Key features

- **Multi-tenant auth** - Register, login, protected routes
- **Theme CRUD** - Create themes with config
- **AI Config Assistant** - Describe objectives, AI fills config (requires `GOOGLE_VERTEX_API_KEY` or `GEMINI_API_KEY`)
- **GDELT Integration** - Uses GDELT DOC 2.0 API as primary news source (FREE, no API key required - with fallback to mock URLs)
- **Manual ingestion** - Trigger scraping for a theme
- **Extraction** - Readability-based article extraction
- **news_item** - Structured JSON with summary, entities, claims
- **Daily budget** - Enforced per theme
- **Dedup** - Canonical URL + content hash
