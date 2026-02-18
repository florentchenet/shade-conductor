# Shade Conductor

WebGL visual engine for live stream visuals. Deployed at stream.rhncrs.com as a static app.

## Architecture
- Pure HTML/JS/WebGL — no framework, single `public/index.html`
- 6 visual engines: hydra, cosmic, glitch, p5, shader, quantum
- Audio-reactive via Web Audio API (analyser nodes on stem tracks)
- Receives commands via WebSocket from studio (engine switch, preset push, palette change)
- OSC input support for live parameter control

## Deployment
- Static files served by Caddy on VPS at `/srv/stream`
- `scp -r public/* root@100.111.230.6:/srv/stream/`
- No build step — raw HTML/JS

## Environment
| Variable | Default | Purpose |
|----------|---------|---------|
| `HTTP_PORT` | 3333 | Express HTTP server |
| `WS_PORT` | 3334 | WebSocket server |
| `OSC_PORT` | 9000 | OSC UDP bridge |

## Key Files
- `public/index.html` — main runtime (~2400 lines, WebGL + WS + audio + HUD)
- `public/output.html` — clean output for projection/capture (no HUD)
- `public/library.html` — shader preset browser
- `src/index.ts` — MCP server entry (tools + resources + startup)
- `src/server.ts` — Express + WebSocket server + REST API
- `src/types.ts` — shared TypeScript types + GLSL uniform declarations
- `src/store/preset-store.ts` — file-based preset/setlist storage
- `src/tools/` — MCP tool registrations (shader, perform, audio, setlist, input, layer, scene, capture)
- `src/osc/osc-bridge.ts` — OSC→WebSocket bridge
