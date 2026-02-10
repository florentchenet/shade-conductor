// === shade-conductor: Standard Uniform Documentation ===
// Served as MCP resource at shader://uniforms

export const UNIFORM_DOCS = `# shade-conductor Uniform Reference

All shaders receive these uniforms automatically. The runtime prepends uniform
declarations before compiling your code. You only write the helpers + void main().

---

## Time & Space

| Uniform | Type | Description |
|---------|------|-------------|
| \`u_time\` | float | Elapsed time in seconds since shader start. Continuously increasing. Use with \`u_speed\` multiplier for controllable animation: \`u_time * u_speed\`. |
| \`u_resolution\` | vec2 | Viewport size in pixels. \`u_resolution.x\` = width, \`u_resolution.y\` = height. Use for aspect-correct UV: \`vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution) / u_resolution.y;\` |
| \`u_quality\` | float | Quality tier. 1.0 = full resolution, 0.5 = half resolution. Use to reduce iteration counts on expensive effects: \`int steps = int(64.0 * u_quality);\` |
| \`u_frame\` | int | Frame counter. Increments by 1 each frame. Useful for temporal effects, noise seeding, and frame-dependent logic. |

---

## Audio Analysis

All audio uniforms range from 0.0 to 1.0 (normalized). When no audio input is
active, all values remain at 0.0. Design shaders so they look great at 0.0
(silent mode) with audio as additive modulation.

| Uniform | Type | Range | Description |
|---------|------|-------|-------------|
| \`u_bass\` | float | 0.0 - 1.0 | Low frequency energy (20-250 Hz). Responds to kick drums, bass lines, sub-bass. Smoothed. Best for large-scale motion: pulsing, scaling, displacement. |
| \`u_mid\` | float | 0.0 - 1.0 | Mid frequency energy (250-4000 Hz). Responds to vocals, synths, guitars, snares. Best for color shifts, texture changes, medium-scale modulation. |
| \`u_high\` | float | 0.0 - 1.0 | High frequency energy (4000-20000 Hz). Responds to hi-hats, cymbals, sibilance, shimmer. Best for fine detail: sparkle, noise intensity, edge sharpness. |
| \`u_energy\` | float | 0.0 - 1.0 | Overall audio energy (RMS across full spectrum). Smoothed average of all frequency bands. Good for general reactivity: brightness, speed, intensity. |
| \`u_peak\` | float | 0.0 - 1.0 | Transient peak detector with fast attack and slow decay. Fires on sudden loud events (snare hits, drops). Use for flash/burst effects: \`if (u_peak > 0.8) { /* flash */ }\` |
| \`u_spectrum[16]\` | float[16] | 0.0 - 1.0 each | 16-band spectrum analyzer. Index 0 = lowest frequency, index 15 = highest. Use for visualizer bars, per-band effects, detailed frequency response. |

### Audio Coding Pattern

ALWAYS use additive audio. The shader must be beautiful in silence:

\`\`\`glsl
// CORRECT: base animation + audio additive
float radius = 0.3 + sin(u_time) * 0.1 + u_bass * 0.2;
float glow_strength = 0.5 + u_energy * 0.5;
vec3 col = base_color + u_mid * vec3(0.2, 0.0, 0.3);

// WRONG: audio-dependent (black screen when silent)
float radius = u_bass * 0.5;
float glow_strength = u_energy;
\`\`\`

---

## Color Palette

Four configurable colors passed as normalized RGB (0.0 - 1.0 per channel).
These are set by the palette system and can be changed at runtime without
recompiling the shader.

| Uniform | Type | Default Usage |
|---------|------|---------------|
| \`u_color1\` | vec3 | Primary / accent color. Use for main visual elements, glow, highlights. |
| \`u_color2\` | vec3 | Secondary color. Use for complementary elements, gradients, secondary shapes. |
| \`u_color3\` | vec3 | Tertiary / detail color. Use for fine details, particles, edges. |
| \`u_bg\` | vec3 | Background color. Use as the base/clear color. Often dark (near black). |

### Palette Usage

\`\`\`glsl
// Mix between palette colors based on some factor
vec3 col = mix(u_color1, u_color2, smoothstep(0.0, 1.0, factor));

// Use bg as base, add colored elements on top
vec3 col = u_bg + shape * u_color1 + glow * u_color3;
\`\`\`

---

## Tweakable Parameters

Six controllable parameters for real-time adjustment. All range 0.0 - 1.0.

| Uniform | Type | Range | Description |
|---------|------|-------|-------------|
| \`u_param1\` | float | 0.0 - 1.0 | General purpose parameter. Each shader defines its meaning (e.g., "fractal depth", "distortion amount"). |
| \`u_param2\` | float | 0.0 - 1.0 | General purpose parameter. |
| \`u_param3\` | float | 0.0 - 1.0 | General purpose parameter. |
| \`u_param4\` | float | 0.0 - 1.0 | General purpose parameter. |
| \`u_intensity\` | float | 0.0 - 2.0 | Global brightness/intensity multiplier. Default 1.0. Use to scale final color output: \`gl_FragColor = vec4(col * u_intensity, 1.0);\` |
| \`u_speed\` | float | 0.0 - 4.0 | Animation speed multiplier. Default 1.0. Use: \`float t = u_time * u_speed;\` so animations can be sped up or slowed down live. |

---

## Transition

| Uniform | Type | Range | Description |
|---------|------|-------|-------------|
| \`u_transition\` | float | 0.0 - 1.0 | Crossfade progress. 0.0 = previous shader fully visible, 1.0 = this shader fully visible. Used during shader transitions. Most shaders can ignore this. |

---

## External Input Channels

For integration with OSC, MIDI, hardware controllers, and custom input sources.

| Uniform | Type | Description |
|---------|------|-------------|
| \`u_ext[16]\` | float[16] | 16 general-purpose float channels (any range, typically 0.0 - 1.0). Set via MCP tool \`ext_input\` or REST API. Use for MIDI CC, OSC messages, sensor data, etc. |
| \`u_ext_xy[4]\` | vec2[4] | 4 XY pad channels. Each contains .x and .y (typically 0.0 - 1.0). Use for touchpad input, joystick, mouse position, accelerometer. |
| \`u_bpm\` | float | Beats per minute. Set via MCP or synced to DAW. Use for beat-synced animation: \`float beat = fract(u_time * u_bpm / 60.0);\` |
| \`u_beat\` | float | Current beat position within a bar (0.0 - 3.999 for 4/4 time). Fractional part represents position within a single beat. |
| \`u_bar\` | float | Current bar number. Increments each time a full bar completes. Use for slower periodic effects. |

---

## WebGL2-Only Uniforms

These are only available when using the \`code_webgl2\` field:

| Uniform | Type | Description |
|---------|------|-------------|
| \`u_fft\` | sampler2D | Full FFT data as a 1D texture (1024 x 1). Use \`texture(u_fft, vec2(freq, 0.5)).r\` where freq is 0.0-1.0. Higher resolution than u_spectrum. |
| \`u_prevFrame\` | sampler2D | Previous frame's output. Enables feedback effects, trails, motion blur: \`vec3 prev = texture(u_prevFrame, uv).rgb;\` |
| \`u_bufferA\` | sampler2D | Multi-pass buffer A output. For ping-pong feedback, simulation passes. |
| \`u_bufferB\` | sampler2D | Multi-pass buffer B output. |
| \`u_bufferC\` | sampler2D | Multi-pass buffer C output. |
| \`u_noise\` | sampler2D | Pre-generated noise texture (256x256, RGBA). Use for dithering, random seeds, texture: \`texture(u_noise, uv * 4.0).r\` |

### WebGL2 Output

WebGL2 shaders use \`out vec4 fragColor;\` (declared in the prepended uniforms)
instead of \`gl_FragColor\`. Use \`texture()\` instead of \`texture2D()\`.

---

## Coordinate Conventions

Standard UV setup for centered, aspect-correct coordinates:

\`\`\`glsl
void main() {
    // Centered UV: (-aspect, -1) to (aspect, 1), origin at center
    vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution) / u_resolution.y;

    // Normalized UV: (0, 0) bottom-left to (1, 1) top-right
    vec2 uv01 = gl_FragCoord.xy / u_resolution;

    // Distance from center
    float d = length(uv);

    // Angle from center
    float a = atan(uv.y, uv.x);
}
\`\`\`
`;
