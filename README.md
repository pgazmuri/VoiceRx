<div align="center">
	<h1>VoiceRx • "Any Agent You Want"</h1>
## Scenario Presets
Scenarios are **generated dynamically** with each industry config or use **baseline pharmacy presets** (`lib/scenarios.ts`).

Each scenario is `{ id, name, text }` with domain-specific context tokens (e.g., pharmacy: PRESCRIPTION, REFILL_ELIGIBLE; travel: BOOKING_ID, DEPARTURE_DATE).

Selecting a preset overwrites the active scenario text; choosing "Custom" allows free-form editing. The tool router uses a hashed snapshot of the current scenario text when caching results, ensuring consistent mocked responses within the same scenario context.p><strong>Build voice agents for any industry using OpenAI Realtime API with dynamic config generation.</strong></p>
	<p>Generate custom industry configurations (tools, scenarios, prompts) on-the-fly using GPT-5 and deploy voice agents instantly.</p>
</div>

## Overview
VoiceRx is a dynamic voice agent platform that:
* Streams audio to the OpenAI Realtime API and renders synthesized speech + live transcript.
* **Generates complete industry configurations** (tools, scenarios, prompts) from simple descriptions using GPT-5.
* Surfaces model function (tool) calls in real time and executes them via an LLM-based mock layer.
* Grounds reasoning in selectable structured scenarios that adapt to any domain.
* Demonstrates iterative UI design for an operator-facing console (large adaptive text, drag-resize stage, live tool panel).center">
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
| **Config Generation** | **Generate complete industry configs from descriptions using GPT-5** (tools, scenarios, prompts) |
| Runtime | Next.js (App Router), TypeScript, Edge-style API routes |
| Realtime | WebRTC peer connection (audio) + data channel events (tool calls, deltas) |
| UI | TailwindCSS, framer-motion animations, adaptive binary-search font fitting |
| Tools | Dynamic tool specs generated or baseline pharmacy tools; args + result schema + sample result |
| Scenarios | Generated per industry OR baseline pharmacy presets (refills, prior auth, adherence, etc.) |
| Tool Router | `/api/tool` caches responses per scenario + args; uses OpenAI Responses API to synthesize result JSON |
| Persistence | Configs saved to disk; scenario persisted to memory; rehydrated on load |
| Safety | Single secret file `.key` (demo only). No production-grade ephemeral token flow yet |

## Dynamic Config Generation ("Any Agent You Want")

VoiceRx ships with a **baseline Pharmacy/PBM configuration** as the default, but you can generate agents for **any industry** with a simple text description.

### How It Works
1. Navigate to the **Industry Config** tab
2. Enter a description like: `"Travel concierge for flight booking and hotel reservations"` or `"Auto parts store assistant for inventory and orders"`
3. Click **Generate & Activate** → GPT-5 (with reasoning) creates:
   - **3-6 custom tools** with argument schemas, result schemas, and sample results
   - **2-4 domain-specific scenarios** with realistic context and parameters
   - **A tailored system prompt** with appropriate guardrails for the industry
   - **Default scenario selection** to ground the agent immediately
4. The new config is **persisted to disk** and **automatically activated**
5. Switch to the **Voice Stage** tab and start talking to your new agent

### Config Management
- **Switch Configs**: Instantly swap between generated configs (pharmacy, travel, retail, etc.)
- **Refine Configs**: Update existing configs with natural language instructions ("add a tool for X", "shorten the prompt")
- **Custom Scenarios**: Select "Custom" to write your own scenario context or edit generated ones
- **Persistence**: All configs are saved in `configs/generated/` and survive server restarts

### Example Industries
- **Default**: Pharmacy benefits management (prescriptions, prior auth, refills)
- **Travel**: Flight booking, hotel reservations, itinerary management
- **Retail**: Inventory lookup, order management, returns processing
- **Healthcare**: Appointment scheduling, medical records, insurance verification
- **Finance**: Account inquiries, transaction history, fraud detection
- **Real Estate**: Property search, showing scheduling, offer management
- **Support**: Ticket routing, knowledge base, escalation workflows

## Repository Structure (high level)
```
app/
	api/
		config/
			route.ts          # GET/POST active config
			generate/route.ts # Generate new industry config with GPT-5
			refine/route.ts   # Refine existing config with instructions
		realtime-token/route.ts   # Returns (insecure) client_secret read from .key
		tool/route.ts             # Tool execution + LLM mock + cache
		tool-specs/route.ts       # Exposes declared tool list for active config
components/
	config-manager.tsx       # Industry config UI (generate, switch, refine)
	realtime-stage.tsx       # Voice UI (stage, controls, tool log)
	[...other components]    # Settings, logs, hooks
lib/
	industry-config.ts       # Config registry, persistence, validation
	tools.ts                 # Baseline pharmacy tools (used as example)
	scenarios.ts             # Baseline pharmacy scenarios
configs/
	pharmacy/index.ts        # Default pharmacy config
	generated/               # Dynamically generated configs (*.json)
		__active.json         # Currently active config ID
```

## Tool System
Tools can be **dynamically generated** (via GPT-5 config generation) or use the **baseline pharmacy tools** (`lib/tools.ts`).

Each tool declares:
* `name`, `description`
* `parameters` (JSON schema for arguments)
* `resultSchema` (expected JSON shape used to nudge model)
* `sampleResult` (example payload improving deterministic tool mock generation)

During a realtime session we pass sanitized tool specs from the **active config** to the model. When the model emits a function call event:
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

### Generate a New Industry Config (Recommended)
1. Navigate to **Industry Config** tab
2. Enter a description of the industry and desired capabilities
3. Click **Generate & Activate**
4. GPT-5 creates a complete config with tools, scenarios, and prompts
5. Optionally use **Refine Config** to adjust with natural language instructions

### Manually Add a Tool (Advanced)
1. Edit `lib/tools.ts` or create a new config file in `configs/`
2. Append a new spec with robust `resultSchema` & `sampleResult`
3. Add scenario tokens that the tool may reference
4. Register the config in `lib/industry-config.ts`
5. Restart or trigger a new session (tools snapshot passed at session start & on updates)

### Manually Add a Scenario Preset (Advanced)
1. Edit the config file (e.g., `configs/pharmacy/index.ts`)
2. Append to the `scenarios` array
3. Ensure `id` unique & `name` human friendly
4. Include structured tokens so the model can ground tool decisions

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
All data in generated configs and scenarios is **synthetic and for demonstration only**. This includes:
- Pharmacy: prescriptions, patient data, clinical decisions
- Travel: bookings, payment info, personal details
- Any other industry: customer data, transactions, etc.

**Do not use VoiceRx outputs for real operational decisions** in regulated environments (healthcare, finance, etc.) without proper validation, security hardening, and compliance review.

## License
Not specified; treat as internal demo unless a license is added.

---
Questions or improvements you’d like to see next (schema validation, ephemeral auth, analytics panel)? Open an issue or extend and PR.
