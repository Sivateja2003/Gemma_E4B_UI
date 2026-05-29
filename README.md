# Gemma E4B — Frontend

A React + Vite chat interface for the Gemma E4B backend. It talks to a self-hosted Ollama LLM, shows per-response token counts, latency, and cost (USD and INR) directly in each chat bubble, and persists an analytics dashboard across sessions — all without requiring any login.

---

## Table of Contents

- [What It Does](#what-it-does)
- [Feature Breakdown](#feature-breakdown)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Setup and Installation](#setup-and-installation)
- [Environment Variables](#environment-variables)
- [Connecting to the Backend](#connecting-to-the-backend)
- [Running the Dev Server](#running-the-dev-server)
- [Component Overview](#component-overview)
- [Data Flow](#data-flow)
- [LocalStorage Keys](#localstorage-keys)

---

## What It Does

Gemma E4B UI is a browser-based AI chat client. On every message send it:

1. Sends the user message (and optionally a PDF or image file) to the FastAPI backend along with a persistent anonymous `user_id` and `session_id`
2. Receives the LLM response plus `usage` (token counts), `latency_ms`, and `cost` (USD + INR) from the backend
3. Renders the response as Markdown inside a chat bubble
4. Appends a small metadata footer under every AI response showing: `Tokens In / Out | Latency | Cost`
5. Accumulates all query metrics in the local Analytics Dashboard

No account, login, or server-side authentication is required. The browser generates a UUID on first load and reuses it forever.

---

## Feature Breakdown

### Anonymous Persistent Identity

On first load the app calls `crypto.randomUUID()` and stores the result in `localStorage` as `gemma_user_id`. Every subsequent visit reuses the same ID. It is sent as `user_id` in every request body so the backend can link sessions and analytics to a single identity across page refreshes.

### Chat Bubble with Live Metrics

Every AI response bubble has a footer line rendered immediately after the Markdown content:

```
Tokens 312 / 89  |  1842ms  |  $0.00006748 / ₹0.00573
```

- **Tokens** — prompt context tokens / completion tokens, sourced from `data.usage` in the backend response
- **Latency** — sourced from `data.latency_ms` (backend wall-clock measurement). Falls back to `Date.now()` delta if the backend field is absent.
- **Cost** — sourced from `data.cost.usd` and `data.cost.inr`. Falls back to frontend calculation from `MODEL_PRICING` constants if absent.

### File Uploads (PDF and Image)

- Supported types: PDF, PNG, JPEG, GIF, WebP, SVG
- Max size: 10 MB (enforced client-side before upload)
- PDF files are sent to `/chat-file` via `FormData`
- Image files are previewed inline in the user bubble using a `FileReader` DataURL, then uploaded to `/chat-file`
- Upload progress is tracked with `XMLHttpRequest` and shown as a progress bar in the file chip

### Model Selection

A dropdown in the input toolbar lets users switch between:

- **Gemma** — uses SentencePiece tokenizer on the backend for accurate token counts
- **GPT-4** — uses tiktoken (cl100k_base) on the backend; pricing reflects GPT-4 rates

The selected model is sent with every request and affects token counting and cost calculation server-side.

### Analytics Dashboard

Every chat query is logged locally to a `metricsData` array persisted in `localStorage`. The Analytics Dashboard (MetricsView component) visualises this data with:

- Summary stat cards: total queries, total tokens, total cost, average latency
- Line charts: token usage over time, latency trend, cost over time

The dashboard is reached via the sidebar "Analytics Dashboard" button.

### Sidebar Navigation

The sidebar has three fixed navigation items at the bottom:

| Item | Behaviour |
|---|---|
| **Analytics Dashboard** | Switches main view to the MetricsView component. Badge shows query count. |
| **TokenLens** | Opens `tokenlens.dev` in a new tab. |
| **Clear History** | Visible only when messages exist. Prompts confirmation, then clears chat and starts a new session. |

### Persistent Chat History

The full message array (including per-message `meta` with tokens, latency, and cost) is serialised to `localStorage` as `gemma_chat_history` on every update. Refreshing the page restores the entire conversation including all bubble footers.

---

## Tech Stack

| Concern | Library |
|---|---|
| Framework | React 19 |
| Build tool | Vite |
| Markdown rendering | react-markdown |
| Charts | Recharts |
| Icons | Lucide React |
| Styling | Plain CSS custom properties (dark theme) |
| HTTP (text) | Fetch API |
| HTTP (file upload) | XMLHttpRequest (for upload progress events) |

---

## Project Structure

```
Gemma_E4B_UI/
|
|-- src/
|   |-- App.jsx          # Root component: all state, API calls, layout
|   |-- MetricsView.jsx  # Analytics Dashboard: stat cards + Recharts graphs
|   |-- App.css          # (minimal, most styles are in index.css)
|   +-- index.css        # All CSS custom properties and component styles
|
|-- public/              # Static assets
|-- index.html
|-- vite.config.js
|-- package.json
+-- .env                 # Not committed — see Environment Variables
```

---

## Setup and Installation

### Prerequisites

- Node.js 18 or higher
- The Gemma E4B backend running (see backend README)

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/for-real-afk/Gemma_E4B_UI.git
cd Gemma_E4B_UI

# 2. Install dependencies
npm install

# 3. Create your .env file
echo "VITE_API_BASE_URL=http://localhost:8000" > .env
```

---

## Environment Variables

Create `.env` in the project root. Never commit this file.

```env
# URL of the Gemma E4B FastAPI backend
# Defaults to http://localhost:8000 if this file is absent
VITE_API_BASE_URL=http://localhost:8000
```

If the backend is deployed remotely, replace the value with the public URL:

```env
VITE_API_BASE_URL=https://your-backend.example.com
```

---

## Connecting to the Backend

The frontend connects to two backend endpoints:

| Action | Method | Endpoint | Body |
|---|---|---|---|
| Text chat | POST | `/chat` | JSON: `{ message, session_id, user_id, model }` |
| File + text chat | POST | `/chat-file` | FormData: `file, mssg, session_id, user_id, model` |

The backend must have CORS configured to allow `http://localhost:5173`. The default backend `.env` includes this origin automatically.

No proxy is configured in Vite — CORS is handled entirely by the backend's `CORSMiddleware`.

### Minimal backend `.env` for local development

```env
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=gemma3:4b
ALLOWED_ORIGINS=http://localhost:5173
```

---

## Running the Dev Server

```bash
npm run dev
```

App runs at `http://localhost:5173`.

To build for production:

```bash
npm run build
# Output in dist/
```

---

## Component Overview

### `App.jsx`

The single root component. Owns all application state and contains the full UI layout.

**State:**

| State variable | Persisted | Description |
|---|---|---|
| `messages` | localStorage `gemma_chat_history` | Full conversation array. Each bot message carries a `meta` object with `{ pTok, cTok, latencyMs, costUsd, costInr }`. |
| `sesssionId` | localStorage `gemma_session_id` | Current session identifier sent to the backend. Regenerated on "New Chat". |
| `userId` | localStorage `gemma_user_id` | Anonymous UUID. Never regenerated — survives new chats and page refreshes. |
| `metricsData` | localStorage `gemma_metrics` | Array of per-query analytics objects fed to MetricsView. |
| `selectedModel` | — (in-memory) | `"gemma"` or `"gpt4"`. Sent with every request. |
| `input` | — (in-memory) | Current textarea value. |
| `selectedFile` | — (in-memory) | File object staged for upload. |
| `uploadProgress` | — (in-memory) | 0–100 or null. Drives the file chip progress bar. |
| `isLoading` | — (in-memory) | True while awaiting a backend response. Shows typing indicator. |
| `view` | — (in-memory) | `"chat"` or `"metrics"`. Controls which panel is shown. |

**Key functions:**

- `handleSend(e)` — validates input, builds the user message, calls the backend, unpacks `data.latency_ms` and `data.cost`, attaches `meta` to the bot message, appends to `metricsData`
- `handleFileSelect(e)` — validates file type and size before staging
- `clearChat()` — confirms with user, clears messages, generates new `session_id`
- `isImageFile(file)` — helper used to choose between inline preview and file icon

**Chat bubble meta footer** (rendered for every bot message that has a `meta` field):

```jsx
<div className="message-meta">
  <span>Tokens {pTok} / {cTok}</span>
  <span className="meta-sep">|</span>
  <span>{latencyMs < 1000 ? `${Math.round(latencyMs)}ms` : `${(latencyMs/1000).toFixed(1)}s`}</span>
  <span className="meta-sep">|</span>
  <span>${costUsd.toFixed(6)} / ₹{costInr.toFixed(4)}</span>
</div>
```

### `MetricsView.jsx`

The Analytics Dashboard. Receives `metrics` (array) and `onClearMetrics` (callback) as props.

Renders:
- 4 stat cards: Total Queries, Total Tokens, Total Cost (USD), Avg Latency
- Line chart: token usage per query (prompt + completion)
- Line chart: latency per query (ms)
- Line chart: cost per query (USD)

All charts use Recharts `LineChart` with `ResponsiveContainer`.

---

## Data Flow

```
User types message and hits Send
        |
        v
handleSend()
  |
  |-- Build user message object
  |-- Append to messages (shows immediately)
  |-- Set isLoading = true  (typing indicator appears)
  |
  |-- If file attached:
  |     POST /chat-file  (FormData, XHR for progress)
  |-- Else:
  |     POST /chat  (fetch, JSON)
  |
  v
Backend responds with:
  { response, usage: {prompt_tokens, completion_tokens}, latency_ms, cost: {usd, inr} }
  |
  |-- Extract: pTok, cTok from usage
  |-- Extract: latencyMs from data.latency_ms  (fallback: Date.now() delta)
  |-- Extract: costUsd from data.cost.usd      (fallback: MODEL_PRICING calc)
  |-- Extract: costInr from data.cost.inr      (fallback: costUsd * 85)
  |
  |-- Append to metricsData  (feeds Analytics Dashboard)
  |-- Append bot message with meta: { pTok, cTok, latencyMs, costUsd, costInr }
  |
  v
Chat bubble renders:
  <ReactMarkdown>{response}</ReactMarkdown>
  <div class="message-meta">Tokens 312 / 89 | 1842ms | $0.000067 / ₹0.0057</div>
```

---

## LocalStorage Keys

| Key | Content | Cleared on |
|---|---|---|
| `gemma_user_id` | Anonymous UUID — permanent identity | Never (manual clear only) |
| `gemma_session_id` | Current session ID | New Chat / Clear History |
| `gemma_chat_history` | Serialised messages array | New Chat / Clear History |
| `gemma_metrics` | Serialised analytics array | "Clear Metrics" button in Dashboard |
