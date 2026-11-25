# CBCM AI Assistant — Gemini Configuration & Setup

This document covers the Google Gemini integration for the CBCM Clinical
Mentorship Assistant (Phase 2–3). All Gemini communication is isolated inside
`src/providers/llm.provider.js`; no other module imports `@google/genai`.

## 1. Obtaining a Gemini API key

1. Go to <https://aistudio.google.com/apikey> and sign in with a Google account.
2. Create an API key (a Google Cloud project is created automatically).
3. Copy the key into the backend `.env` as `GEMINI_API_KEY`.
   - The key is **server-side only**. Never expose it to the Next.js or Flutter
     clients, never commit it, and never return it in API responses.

## 2. Environment variables

Add to `.env` (placeholders are in `.env.example`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | — | Gemini API key (required for AI features) |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Chat/generation model |
| `GEMINI_EMBEDDING_MODEL` | `gemini-embedding-2` | Embedding model for RAG |
| `GEMINI_EMBEDDING_DIMENSIONS` | `768` | Embedding size — must stay consistent between ingestion and queries |
| `AI_MAX_OUTPUT_TOKENS` | `2048` | Max tokens per generated response |
| `AI_TEMPERATURE` | `0.3` | Sampling temperature |
| `AI_MAX_RETRIEVED_CHUNKS` | `5` | Max knowledge chunks retrieved per question (Phase 7) |
| `AI_REQUEST_TIMEOUT` | `60000` | Per-request timeout in milliseconds |
| `AI_MAX_RETRIES` | `2` | Retries for transient (429/5xx/timeout) failures |
| `AI_SEND_USER_CONTEXT` | `false` | **Privacy gate** — see below |

If `GEMINI_API_KEY` is empty, AI endpoints return `503 AI_NOT_CONFIGURED` and the
rest of the application continues to work normally.

## 3. Privacy gate (`AI_SEND_USER_CONTEXT`)

Default: **disabled**. While disabled, the following are **never** sent to
Gemini:

- Mentee/mentor profile fields (name, email, phone, qualification)
- Assessment results, scores, competency status, or practical assessment data
- Mentorship assignments, facility details, or learning progress records
- Any other user-specific database records

The gate is enforced in code in `src/services/ai-context.service.js` — prompt
construction receives only the user's role label while the flag is `false`.

### What IS sent to Gemini (always)

Even with the gate disabled, the following are transmitted to Google's API to
produce a response:

- The user's chat message text (whatever they type — including any personal or
  patient details they choose to enter)
- Retrieved chunks from **approved** knowledge documents only
- The user's role label (`mentee`, `mentor`, `facility_admin`, `admin`)
- Conversation history from the same AI conversation (previous user/assistant
  messages, limited to the most recent entries)

**Warning:** users can still type patient-identifiable information or personal
details into the chat box — that text is sent to Gemini. The safety layer
(`src/services/ai-safety.service.js`) detects likely patient-specific and
emergency content and appends a notice or short-circuits with an escalation
message, but it is not a substitute for user discretion. Frontend clients
should display a "do not share patient identifiers" notice in the chat UI.

Set `AI_SEND_USER_CONTEXT=true` **only after** organizational privacy, security,
and legal approval for sending user records to a third-party API has been
obtained and documented.

## 4. Provider usage

```js
const { getLlmProvider, createLlmProvider } = require('./providers/llm.provider');

// Shared provider (uses env config):
const llm = getLlmProvider();

// Ad-hoc provider (e.g. tests inject a mock client):
const llm = createLlmProvider({ client: mockGoogleGenAIClient });

// Generate a chat response:
const { text, usage, finishReason } = await llm.generateContent({
  contents: [
    { role: 'user', parts: [{ text: 'Explain IPC principles.' }] },
  ],
  // optional overrides: model, generationConfig: { temperature, maxOutputTokens }
});

// Generate embeddings (768-dim vectors by default):
const { embeddings } = await llm.embedContent({
  contents: ['chunk text one', 'chunk text two'],
  taskType: 'RETRIEVAL_DOCUMENT', // or 'RETRIEVAL_QUERY' at query time
});
```

### Behaviour

- **Timeout**: each API call is bounded by `AI_REQUEST_TIMEOUT`; exceeding it
  raises `504 AI_TIMEOUT`.
- **Retries**: transient failures (HTTP 429, 5xx, network/timeout errors) are
  retried up to `AI_MAX_RETRIES` times with exponential backoff + jitter.
- **Errors** are normalized to `AppError`:
  - `503 AI_NOT_CONFIGURED` — missing API key
  - `429 AI_RATE_LIMITED` — persistent rate limiting
  - `502 AI_REQUEST_FAILED` — request rejected (400/401/403)
  - `502 AI_PROVIDER_ERROR` — other provider failures
  - `504 AI_TIMEOUT` — request timeout
  - `400 VALIDATION_ERROR` — invalid embedding input

## 5. Local verification

```bash
npm run test:ai     # unit tests with a mocked Gemini client (no API calls)
npm run dev         # server starts normally even without GEMINI_API_KEY
```

A live smoke test (requires a real key) can be performed by calling
`llm.generateContent({ contents: 'ping' })` from a script — do not commit real
keys or log them.
