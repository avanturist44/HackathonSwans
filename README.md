# CaseBrief

A case digest for personal-injury firms and the medical providers treating their clients.
Built for the Swans Applied AI Hackathon on the **Sapini** matter, read live from Clio Manage.

- **Attorney brief**: where the case stands, whether it holds up (who caused it, injuries and
  diagnoses, insurance and money, statute of limitations), the 60-second pitch, what needs
  attention, treatment and bills sorted by treatment status, and the 10 entries that matter.
  Every fact has a source chip that opens the note, email or document it came from.
- **Share review**: the attorney decides what one treating provider may see. A triage model
  pre-sorts every entry with a confidence score; the attorney only rules on the uncertain ones.
- **Provider view**: a secure link showing the provider only case status, their own balance,
  whether the patient is still treating, and what the firm needs from them. Opens are logged.

## Run it

Requires Node 20+.

1. `npm install`
2. `cp .env.example .env` (if you don't have one) and fill in:
   - `CLIO_CLIENT_ID` / `CLIO_CLIENT_SECRET`: the **Key** and **Secret** of a Clio developer app
     (developers.clio.com/apps) with redirect URI `http://127.0.0.1:8765/callback` and
     **read-only** permissions.
   - `ANTHROPIC_API_KEY`
3. `npm run dev`, then open http://127.0.0.1:8765
4. Click **Connect Clio**, approve, then **Build the case brief**. The first build reads every
   document and takes a few minutes; later refreshes only re-read what changed in Clio.

## How it works

```
Clio (read-only GET)  ->  normalize  ->  read documents  ->  triage entries  ->  write brief  ->  cache  ->  UI
                                          (per version,       (per version,      (skipped if
                                           cached)             cached)            nothing changed)
```

- `lib/clio/`: OAuth and a read-only Clio client (GET only; field fallback; pagination; rate-limit retry;
  documents proxied so the token never reaches the browser).
- `lib/digest/documents.ts`: reads each PDF, scan or image with the model (long PDFs are split into chunks),
  extracting diagnoses, amounts, dates and key facts with page numbers.
- `lib/digest/triage.ts`: scores every entry: category, importance, how safe it is to share with a provider,
  and whether it marks a status change.
- `lib/digest/synthesize.ts`: writes the brief as structured data. Every claim must cite entry ids; citations to
  entries that don't exist are dropped. Computed, not generated: the statute of limitations (from the firm's
  limitations task or date of loss), overdue and upcoming items (Clio tasks and calendar), and firm spend
  (Clio expense entries).
- `.data/` (git-ignored): our own store for cached digests, share decisions and the provider open log.
  Nothing is ever written to Clio.

## Submission answers

- **Stack**: Next.js 16 (App Router, TypeScript), runs locally (`npm run dev`); data outside Clio lives in
  local JSON files under `.data/`.
- **AI models**: Claude Haiku 4.5 reads documents and triages entries; Claude Sonnet writes the brief.
  Models are set in `.env` (`MODEL_TRIAGE`, `MODEL_DIGEST`), and all calls go through `lib/llm.ts`, so moving
  to a BAA-covered host is a config change.
- **Cost per case**: logged per run in `.data/usage-log.json` (`costUsd`). The first full build of Sapini is
  the per-case cost; refreshes only pay for new or changed entries. Prices per million tokens are set in
  `lib/config.ts` and can be overridden in `.env`.
- **Read-only**: the app only sends GET requests to Clio, and the Clio app is granted read-only permissions.
- **Privacy**: the provider page is built server-side from approved entries only; strategy, valuation and
  amounts never leave. This is built to run on a BAA-covered model host; it is not HIPAA-certified.

## Dev utility

`backend/clio_pull.py` dumps the matter to `data/` (git-ignored) for inspecting raw Clio fields. The app does not
use it.
