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

## Key Files
- `public/index.html` — entire app (single file, ~2000 lines)
- Shader/setlist/scene management via WebSocket commands
- hexToRgb handles both 3-char and 6-char hex (fixed RHN-366)
