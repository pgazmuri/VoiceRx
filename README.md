<div align="center">
	<h1>VoiceRx • Realtime PBM / Pharmacy Assistant Demo</h1>
	<p><strong>Interactive voice + tool calling prototype using OpenAI Realtime + Next.js.</strong></p>
	<p>Not for production use. Demonstrates how a pharmacy benefit agent can reason over a structured scenario and call domain tools.</p>
</div>

## Overview
VoiceRx is a demo that:
* Streams audio to the OpenAI Realtime API and renders synthesized speech + live transcript.
* Surfaces model function (tool) calls in real time and executes them via a local tool router backed by an LLM-based mock layer.
* Grounds reasoning in a selectable structured “scenario” (plan, prescriptions, operational status, adherence, PA flags, etc.).
* Demonstrates iterative UI design for an operator-facing console (large adaptive text, drag-resize stage, live tool panel).

## Key Features
| Area | Highlights |
|------|------------|
| Runtime | Next.js (App Router), TypeScript, Edge-style API routes |
| Realtime | WebRTC peer connection (audio) + data channel events (tool calls, deltas) |
| UI | TailwindCSS, framer-motion animations, adaptive binary-search font fitting |
| Tools | Structured function specs (`lib/tools.ts`) with args + result schema + sample result |
| Scenarios | Central preset catalog (`lib/scenarios.ts`) with rich structured tokens (PRESCRIPTION, REFILL_ELIGIBLE, PA_PENDING, etc.) |
| Tool Router | `/api/tool` caches responses per scenario + args; uses OpenAI Responses API to synthesize result JSON |
| Persistence | Scenario persisted to memory via noop POST; rehydrated on load |
| Safety | Single secret file `.key` (demo only). No production-grade ephemeral token flow yet |

## Repository Structure (high level)
```
app/
	api/
		realtime-token/route.ts   # Returns (insecure) client_secret read from .key
		tool/route.ts             # Tool execution + LLM mock + cache
		tool-specs/route.ts       # Exposes declared tool list
components/                  # UI components (realtime stage, settings, logs, hooks)
lib/                         # Tools, scenarios, defaults, prompt
```

## Tool System
Each tool in `lib/tools.ts` declares:
* `name`, `description`
* `parameters` (JSON schema for arguments)
* `resultSchema` (expected JSON shape used to nudge model)
* `sampleResult` (example payload improving deterministic tool mock generation)

During a realtime session we pass sanitized tool specs to the model. When the model emits a function call event:
1. Arguments stream in (delta events aggregated).
2. On completion we POST to `/api/tool` with `{ tool, args }`.
3. The route:
	 - Hashes scenario + args for cache keys.
	 - Uses the Responses API (`gpt-4.1-nano`) with a structured system + user prompt to synthesize JSON.
	 - Returns parsed result (or fallback structure) and scenario-derived metadata.
4. The client echoes function_call_output back to Realtime so the model can continue grounded.

## Scenario Presets
Defined in `lib/scenarios.ts` as an array of `{ id, name, text }` with enriched clinical + operational tokens. Selecting a preset overwrites the active scenario text; choosing “Custom” preserves edits. The tool router uses a hashed snapshot of the current scenario text when caching results.

## Realtime Flow Summary
1. User clicks “Start Voice” → `/api/realtime-token` fetch returns raw key → creates RTCPeerConnection & data channel.
2. Client sends `session.update` with instructions + tool specs + temperature + voice.
3. Incoming data channel events handled in `realtime-stage.tsx` (`handleRealtimeEvent`). Supported variants: text deltas, audio transcript deltas, function_call creation/delta/done.
4. Tool execution result is posted back via conversation.item + response.create events.
5. Overlay text auto-adjusts size (binary search) to avoid clipping inside dynamic stage.

## Installation & Local Development
Prerequisites: Node 18+ (or 20+ recommended), npm (or pnpm/yarn if you adapt scripts).

```bash
git clone <YOUR_FORK_URL> VoiceRx
cd VoiceRx
npm install
echo "sk-..." > .key   # Place a valid OpenAI API key (never commit it)
npm run dev
# Visit http://localhost:3000
```

### Environment / Secrets
For demo: a single `.key` file containing an API key. Production SHOULD use ephemeral keys:
1. Server issues short-lived ephemeral token via OpenAI ephemeral key endpoint.
2. Client initiates Realtime with that ephemeral secret (never the long-lived key).

### Scripts (package.json)
* `dev` – Next dev server
* `build` – Production build
* `start` – Start built app
* (Add lint/test scripts as desired.)

## Configuration Points
| Concern | Where | Notes |
|---------|-------|-------|
| OpenAI API key | `.key` | Replace with ephemeral exchange before deployment |
| Model (tool mock) | `/api/tool` | Uses `gpt-4.1-nano` hard-coded; adjust for fidelity/perf |
| Realtime model | `realtime-stage.tsx` | `gpt-realtime` (default); update session.update call if changing |
| Temperature | UI Slider | Propagated via `session.update` while streaming |
| Voice | UI Dropdown | Sent initially + on updates; ensure backend model supports voice name |
| Scenario persistence | POST `/api/tool` with `noop` | Enables rehydration after refresh |

## Development Notes
* Font fitting: Implemented via `use-fit-text` binary search hook (container + overlay measurement) to avoid clipped large text blocks.
* Drag stage height: pointer-driven resizing (30–80vh) with debounced refit.
* Tool call dedupe: Guard ensures a function call executes once (handles dual event patterns: args.done vs output_item.done).
* Caching: File-based `.tool_cache/` under project root; safe to delete to invalidate.

## Extending
### Add a New Tool
1. Edit `lib/tools.ts`, append a new spec with robust `resultSchema` & `sampleResult`.
2. (Optional) Add scenario tokens that the tool may reference.
3. Restart or trigger a new session (tools snapshot passed at session start & on updates).

### Add a Scenario Preset
1. Append to `SCENARIO_PRESETS` in `lib/scenarios.ts`.
2. Ensure `id` unique & `name` human friendly.
3. Include structured tokens so the model can ground tool decisions.

## Known Limitations / TODO
| Area | Issue | Planned Approach |
|------|-------|------------------|
| Security | Raw key served to client | Implement ephemeral server exchange + auth guard |
| Voice Input | Only mic start/stop | Add push-to-talk or VAD pause/resume |
| Persistence | Only scenario memory | Persist temperature & voice (localStorage or server) |
| Validation | Tool results not schema-validated | Add JSON schema validation + error surfacing |
| Observability | Minimal logging in prod | Introduce log levels + optional server event stream |

## Production Hardening Checklist
* Replace raw `.key` with ephemeral tokens.
* Enforce auth/session boundaries (JWT or similar) before granting realtime token.
* Rate limit tool executions + add input validation.
* Add structured logging & audit trail for tool calls.
* Validate model tool results against `resultSchema` and re-request if invalid.
* Consider streaming audio encoding (e.g., Opus) and packet loss handling if scaling globally.

## Safety & Compliance Notice
All clinical / pharmacy data here is synthetic. Do not use VoiceRx outputs for real patient care decisions. Remove or clearly label demo-only logic before any regulated environment deployment.

## License
Not specified; treat as internal demo unless a license is added.

---
Questions or improvements you’d like to see next (schema validation, ephemeral auth, analytics panel)? Open an issue or extend and PR.
