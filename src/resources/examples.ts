// === shade-conductor: Example Shader Presets ===
// 10 production-quality shaders for live visual performance.
// Aesthetic: demoscene meets dark electronic post-industrial.

import type { ShaderPreset } from '../types.js';

const now = new Date().toISOString();

// ---------------------------------------------------------------------------
// 1. VOID PULSE
// ---------------------------------------------------------------------------
const void_pulse: ShaderPreset = {
  id: 'void_pulse',
  name: 'Void Pulse',
  description:
    'Dark void with pulsing concentric rings emanating from center. ' +
    'Bass makes rings expand and glow brighter. Minimal and hypnotic.',
  tags: ['rings', 'minimal', 'bass-reactive', 'dark', 'hypnotic'],
  params: {
    param1: 'Ring Count',
    param2: 'Ring Width',
    param3: 'Glow Intensity',
    param4: 'Distortion',
  },
  code: `
float glow(float d, float radius, float intensity) {
    return intensity / (abs(d) / radius + 1.0);
}

float hash(vec2 p) {
    p = fract(p * vec2(443.8975, 397.2973));
    p += dot(p, p.yx + 19.19);
    return fract(p.x * p.y);
}

void main() {
    vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution) / u_resolution.y;
    float t = u_time * u_speed;

    // Slight distortion driven by param4
    float distort = u_param4 * 0.3;
    uv += distort * vec2(sin(uv.y * 3.0 + t), cos(uv.x * 3.0 + t * 0.7));

    float d = length(uv);
    float angle = atan(uv.y, uv.x);

    // Number of rings controlled by param1
    float ringCount = 4.0 + u_param1 * 12.0;
    float ringWidth = 0.02 + u_param2 * 0.06;

    // Breathing animation + bass expansion
    float breathe = sin(t * 0.5) * 0.15;
    float bassExpand = u_bass * 0.3;

    // Accumulate ring glow
    float rings = 0.0;
    for (float i = 0.0; i < 16.0; i++) {
        if (i >= ringCount) break;

        float radius = (i + 1.0) / ringCount;
        radius += breathe * (1.0 - radius);
        radius += bassExpand * radius;

        // Slight per-ring angular wobble
        float wobble = sin(angle * 3.0 + t + i * 1.7) * 0.01 * (1.0 + u_mid * 2.0);
        float ringDist = abs(d - radius + wobble);

        float glowAmount = 0.3 + u_param3 * 0.7;
        rings += glow(ringDist, ringWidth, glowAmount * 0.15) * (0.7 + 0.3 * sin(i * 0.9 + t * 0.3));
    }

    // Color from palette
    vec3 col = u_bg;
    col += rings * mix(u_color1, u_color2, d);

    // Center glow
    float centerGlow = glow(d, 0.15 + u_bass * 0.1, 0.06);
    col += centerGlow * u_color3;

    // Peak flash
    col += u_peak * 0.3 * u_color1 * smoothstep(0.7, 1.0, u_peak);

    // Subtle vignette
    vec2 uv01 = gl_FragCoord.xy / u_resolution;
    vec2 q = uv01;
    q *= 1.0 - q;
    float vig = smoothstep(0.0, 0.25, pow(q.x * q.y, 0.4));

    col *= vig;
    col *= u_intensity;

    gl_FragColor = vec4(col, 1.0);
}
`,
  created: now,
  modified: now,
};

// ---------------------------------------------------------------------------
// 2. FRACTAL ZOOM
// ---------------------------------------------------------------------------
const fractal_zoom: ShaderPreset = {
  id: 'fractal_zoom',
  name: 'Fractal Zoom',
  description:
    'Mandelbrot / Julia hybrid with continuous deep zoom. ' +
    'u_param1 morphs between Mandelbrot and Julia. Energy modulates zoom speed. ' +
    'Deep, hypnotic, endlessly detailed.',
  tags: ['fractal', 'mandelbrot', 'julia', 'zoom', 'psychedelic', 'math'],
  params: {
    param1: 'Mandelbrot/Julia Mix',
    param2: 'Julia Real',
    param3: 'Julia Imaginary',
    param4: 'Color Shift',
  },
  code: `
vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
    return a + b * cos(6.28318 * (c * t + d));
}

void main() {
    vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution) / u_resolution.y;
    float t = u_time * u_speed;

    // Continuous zoom: exponential zoom driven by time + energy
    float zoomSpeed = 0.3 + u_energy * 0.4;
    float zoom = exp(-mod(t * zoomSpeed, 12.0));

    // Zoom target that drifts slowly
    vec2 center = vec2(
        -0.7435 + sin(t * 0.017) * 0.005,
         0.1314 + cos(t * 0.013) * 0.005
    );

    // Julia set parameter from param2/param3
    vec2 juliaC = vec2(
        -0.7 + (u_param2 - 0.5) * 0.6,
        0.27015 + (u_param3 - 0.5) * 0.6
    );

    // Mix factor between Mandelbrot and Julia
    float juliaBlend = u_param1;

    vec2 c_mandel = uv * zoom + center;
    vec2 z = c_mandel;

    // For Julia, z starts as the coordinate, c is fixed
    // For Mandelbrot, z starts at 0, c is the coordinate
    vec2 c_iter = mix(c_mandel, juliaC, juliaBlend);
    z = mix(vec2(0.0), c_mandel, mix(0.0, 1.0, juliaBlend));
    // When Mandelbrot-dominant, z=0 and c=coordinate
    // When Julia-dominant, z=coordinate and c=juliaC
    z = mix(vec2(0.0), c_mandel, juliaBlend);

    float iter = 0.0;
    float maxIter = 80.0;
    float smooth_iter = 0.0;

    for (float i = 0.0; i < 80.0; i++) {
        // z = z^2 + c
        z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c_iter;

        if (dot(z, z) > 256.0) {
            // Smooth iteration count for continuous coloring
            smooth_iter = i - log2(log2(dot(z, z))) + 4.0;
            break;
        }
        iter = i;
        smooth_iter = i;
    }

    // Normalize iteration count
    float n = smooth_iter / maxIter;

    // Color using palette + param4 for phase shift
    float colorShift = u_param4 * 2.0 + t * 0.05;
    vec3 col;
    if (smooth_iter >= maxIter - 1.0) {
        // Inside the set: deep dark with subtle color
        col = u_bg * 0.3;
    } else {
        col = palette(
            n * 3.0 + colorShift,
            vec3(0.5),
            vec3(0.5),
            vec3(1.0, 0.7, 0.4),
            vec3(0.0, 0.15, 0.20)
        );
        // Mix with palette colors
        col = mix(col, u_color1, 0.3 * sin(n * 6.28 + t) * 0.5 + 0.5);
        col = mix(col, u_color2, 0.2 * cos(n * 4.0 + t * 0.7) * 0.5 + 0.5);
    }

    // Bass adds brightness to the edges of the set
    col += u_bass * 0.15 * u_color3 * smoothstep(0.0, 0.1, n);

    // Mid shifts overall hue slightly
    col = mix(col, col.gbr, u_mid * 0.15);

    col *= u_intensity;
    gl_FragColor = vec4(col, 1.0);
}
`,
  created: now,
  modified: now,
};

// ---------------------------------------------------------------------------
// 3. TUNNEL WARP
// ---------------------------------------------------------------------------
const tunnel_warp: ShaderPreset = {
  id: 'tunnel_warp',
  name: 'Tunnel Warp',
  description:
    'Classic demoscene tunnel with procedural walls, perspective warping, ' +
    'and camera rotation. Speed driven by u_speed + u_mid. ' +
    'Raw, hypnotic, relentless forward motion.',
  tags: ['tunnel', 'demoscene', 'retro', 'perspective', 'motion'],
  params: {
    param1: 'Tunnel Radius',
    param2: 'Wall Pattern Scale',
    param3: 'Fog Density',
    param4: 'Twist Amount',
  },
  code: `
float hash(vec2 p) {
    p = fract(p * vec2(443.8975, 397.2973));
    p += dot(p, p.yx + 19.19);
    return fract(p.x * p.y);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p, const int octaves) {
    float v = 0.0;
    float a = 0.5;
    float tot = 0.0;
    for (int i = 0; i < 5; i++) {
        if (i >= octaves) break;
        v += a * noise(p);
        tot += a;
        p *= 2.0;
        a *= 0.5;
        p += vec2(5.3, 1.7);
    }
    return v / tot;
}

void main() {
    vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution) / u_resolution.y;
    float t = u_time * u_speed;

    // Camera rotation
    float rotAngle = t * 0.2 + u_param4 * sin(t * 0.3) * 2.0;
    float cs = cos(rotAngle);
    float sn = sin(rotAngle);
    uv = mat2(cs, -sn, sn, cs) * uv;

    // Tunnel mapping: polar coordinates
    float radius = length(uv);
    float angle = atan(uv.y, uv.x);

    // Prevent division by zero at center
    radius = max(radius, 0.001);

    // Tunnel inversion: depth = 1/radius
    float tunnelRadius = 0.3 + u_param1 * 0.5;
    float depth = tunnelRadius / radius;

    // Forward motion speed
    float speed = t * 2.0 + u_mid * 1.5;

    // Tunnel texture coordinates
    vec2 tunnelUV = vec2(
        angle / 3.14159265 * (2.0 + u_param2 * 4.0),
        depth + speed
    );

    // Twist effect
    float twist = u_param4 * 1.5;
    tunnelUV.x += depth * twist * sin(t * 0.5);

    // Wall pattern: layered noise
    float pattern = fbm(tunnelUV * 2.0, 4);
    float lines = smoothstep(0.48, 0.50, abs(fract(tunnelUV.y * 4.0) - 0.5));
    float grid = smoothstep(0.48, 0.50, abs(fract(tunnelUV.x * 4.0) - 0.5));
    pattern = pattern * 0.7 + (lines + grid) * 0.3;

    // Depth fog
    float fogDensity = 1.0 + u_param3 * 4.0;
    float fog = exp(-depth * 0.1 * fogDensity);
    fog = clamp(fog, 0.0, 1.0);

    // Color based on depth and angle
    vec3 wallColor = mix(u_color1, u_color2, pattern);
    wallColor = mix(wallColor, u_color3, sin(angle * 2.0 + t) * 0.3 + 0.3);

    // Lighting: brighter at center (further depth)
    float lighting = 0.3 + 0.7 * smoothstep(0.0, 3.0, depth);
    lighting *= 0.8 + 0.2 * sin(depth * 6.0 - t * 4.0); // pulsing lights

    // Bass makes tunnel walls pulse
    lighting += u_bass * 0.3 * sin(depth * 10.0 - t * 8.0);

    vec3 col = wallColor * pattern * lighting;

    // Apply fog (fade to background)
    col = mix(u_bg, col, fog);

    // High-frequency sparkle
    col += u_high * 0.1 * hash(tunnelUV * 100.0 + t) * fog;

    // Peak flash
    col += u_peak * 0.4 * u_color1 * smoothstep(0.6, 1.0, u_peak) * fog;

    col *= u_intensity;
    gl_FragColor = vec4(col, 1.0);
}
`,
  created: now,
  modified: now,
};

// ---------------------------------------------------------------------------
// 4. NEON GRID
// ---------------------------------------------------------------------------
const neon_grid: ShaderPreset = {
  id: 'neon_grid',
  name: 'Neon Grid',
  description:
    'Retrowave synthwave grid receding to horizon with neon lines, ' +
    'glowing sun, and fog. Bass pulses the grid lines. ' +
    'Pure 80s cyberpunk aesthetic.',
  tags: ['synthwave', 'retrowave', 'grid', 'neon', 'cyberpunk', '80s'],
  params: {
    param1: 'Grid Density',
    param2: 'Sun Size',
    param3: 'Horizon Height',
    param4: 'Fog Amount',
  },
  code: `
float glow(float d, float radius, float intensity) {
    return intensity / (abs(d) / radius + 1.0);
}

void main() {
    vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution) / u_resolution.y;
    float t = u_time * u_speed;

    float horizonY = -0.1 + (u_param3 - 0.5) * 0.4;
    vec3 col = u_bg;

    // Sky gradient
    float skyGrad = smoothstep(horizonY - 0.3, horizonY + 0.8, uv.y);
    vec3 skyColor = mix(u_color1 * 0.2, u_bg, skyGrad);
    col = skyColor;

    // Sun/Moon
    float sunSize = 0.15 + u_param2 * 0.25;
    vec2 sunPos = vec2(0.0, horizonY + 0.35);
    float sunDist = length(uv - sunPos);
    float sun = smoothstep(sunSize + 0.01, sunSize - 0.01, sunDist);

    // Sun horizontal stripe cutout (retro style)
    float stripes = 0.0;
    for (float i = 0.0; i < 6.0; i++) {
        float stripeY = sunPos.y - sunSize * 0.8 + i * sunSize * 0.25;
        float stripeH = sunSize * 0.03 * (1.0 + i * 0.5);
        stripes += smoothstep(stripeH, 0.0, abs(uv.y - stripeY)) *
                   step(sunDist, sunSize);
    }
    sun = max(sun - stripes * 0.8, 0.0);

    vec3 sunColor = mix(u_color1, u_color2, smoothstep(sunPos.y - sunSize, sunPos.y + sunSize, uv.y));
    col = mix(col, sunColor, sun);

    // Sun glow
    float sunGlow = glow(sunDist - sunSize, 0.3, 0.15);
    col += sunGlow * u_color1 * 0.5;

    // Grid (only below horizon)
    if (uv.y < horizonY) {
        // Perspective projection
        float perspY = (horizonY - uv.y);
        float depth = 0.2 / max(perspY, 0.001);

        float gridDensity = 3.0 + u_param1 * 8.0;

        // Grid X lines (vertical in perspective)
        float gridX = uv.x * depth * gridDensity;
        float lineX = abs(fract(gridX) - 0.5);
        float gridLineX = smoothstep(0.02 * depth, 0.0, lineX);

        // Grid Z lines (horizontal in perspective)
        float gridZ = depth * gridDensity + t * 3.0;
        float lineZ = abs(fract(gridZ) - 0.5);
        float gridLineZ = smoothstep(0.03, 0.0, lineZ);

        // Combine grid lines
        float grid = max(gridLineX, gridLineZ);

        // Bass makes grid pulse brighter
        float gridBrightness = 0.5 + u_bass * 0.8;
        grid *= gridBrightness;

        // Depth fog on grid
        float gridFog = exp(-perspY * (2.0 + u_param4 * 6.0));
        grid *= 1.0 - gridFog;

        // Color grid lines
        vec3 gridColor = mix(u_color2, u_color3, gridLineX / (grid + 0.001));
        col += grid * gridColor;

        // Grid glow
        col += grid * 0.2 * u_color1;

        // Horizon glow line
        float horizonGlow = glow(perspY, 0.05, 0.08);
        col += horizonGlow * u_color1;
    }

    // Stars above horizon
    if (uv.y > horizonY + 0.1) {
        vec2 starUV = floor(uv * 80.0);
        float starHash = fract(sin(dot(starUV, vec2(12.9898, 78.233))) * 43758.5453);
        if (starHash > 0.97) {
            float twinkle = 0.5 + 0.5 * sin(t * 2.0 + starHash * 100.0);
            col += vec3(twinkle * 0.3) * smoothstep(horizonY + 0.1, horizonY + 0.4, uv.y);
        }
    }

    // Scanline overlay
    float scan = 0.95 + 0.05 * sin(gl_FragCoord.y * 3.0);
    col *= scan;

    // Mid frequency adds subtle color shift
    col = mix(col, col.gbr, u_mid * 0.1);

    col *= u_intensity;
    gl_FragColor = vec4(col, 1.0);
}
`,
  created: now,
  modified: now,
};

// ---------------------------------------------------------------------------
// 5. ORGANIC FLOW
// ---------------------------------------------------------------------------
const organic_flow: ShaderPreset = {
  id: 'organic_flow',
  name: 'Organic Flow',
  description:
    'Perlin noise flow field with domain warping creating organic, ' +
    'biological tendrils. Mid-frequency shifts hue. ' +
    'Smooth, flowing, alive.',
  tags: ['organic', 'flow', 'noise', 'fbm', 'warp', 'biological'],
  params: {
    param1: 'Warp Intensity',
    param2: 'Scale',
    param3: 'Color Complexity',
    param4: 'Flow Speed',
  },
  code: `
float hash(vec2 p) {
    p = fract(p * vec2(443.8975, 397.2973));
    p += dot(p, p.yx + 19.19);
    return fract(p.x * p.y);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    float tot = 0.0;
    for (int i = 0; i < 6; i++) {
        v += a * noise(p);
        tot += a;
        p = p * 2.0 + vec2(5.3, 1.7);
        a *= 0.5;
    }
    return v / tot;
}

void main() {
    vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution) / u_resolution.y;
    float t = u_time * u_speed;
    float flowSpeed = 0.3 + u_param4 * 0.7;

    // Scale
    float scale = 2.0 + u_param2 * 4.0;
    vec2 p = uv * scale;

    // Domain warping: warp the coordinates through multiple noise layers
    float warpAmount = 1.0 + u_param1 * 3.0 + u_bass * 0.5;

    // First warp layer
    vec2 q = vec2(
        fbm(p + vec2(1.7, 9.2) + t * flowSpeed * 0.3),
        fbm(p + vec2(8.3, 2.8) + t * flowSpeed * 0.2)
    );

    // Second warp layer (warp of warp)
    vec2 r = vec2(
        fbm(p + warpAmount * q + vec2(1.2, 3.4) + t * flowSpeed * 0.15),
        fbm(p + warpAmount * q + vec2(4.7, 8.1) + t * flowSpeed * 0.1)
    );

    // Final noise value with double domain warping
    float f = fbm(p + warpAmount * r + t * flowSpeed * 0.05);

    // Build color from multiple layers
    float colorComplexity = 1.0 + u_param3 * 3.0;

    // Base color from palette, driven by noise layers
    vec3 col = u_bg;

    // Layer 1: primary flow color
    float m1 = smoothstep(0.2, 0.8, f);
    col = mix(col, u_color1, m1 * 0.6);

    // Layer 2: secondary color from warp offset
    float m2 = smoothstep(0.3, 0.7, length(q) * 0.7);
    col = mix(col, u_color2, m2 * 0.4 * colorComplexity * 0.3);

    // Layer 3: tertiary color from double-warp
    float m3 = smoothstep(0.4, 0.9, length(r));
    col = mix(col, u_color3, m3 * 0.3 * colorComplexity * 0.3);

    // Ridges: sharp features at warp boundaries
    float ridge = abs(f - 0.5) * 2.0;
    ridge = pow(ridge, 3.0);
    col += ridge * u_color3 * 0.4;

    // Mid frequency hue shift
    float hueShift = u_mid * 0.3;
    float cosH = cos(hueShift * 6.28);
    float sinH = sin(hueShift * 6.28);
    vec3 shifted = vec3(
        col.r * cosH + col.g * sinH,
        col.g * cosH - col.r * sinH,
        col.b
    );
    col = mix(col, shifted, u_mid);

    // Energy adds vibrancy
    col *= 1.0 + u_energy * 0.3;

    // High adds fine detail sparkle
    float detail = noise(uv * 40.0 + t * 2.0);
    col += u_high * 0.08 * detail * u_color3;

    // Vignette
    vec2 uv01 = gl_FragCoord.xy / u_resolution;
    vec2 vq = uv01;
    vq *= 1.0 - vq;
    float vig = smoothstep(0.0, 0.3, pow(vq.x * vq.y, 0.3));
    col *= vig;

    col *= u_intensity;
    gl_FragColor = vec4(col, 1.0);
}
`,
  created: now,
  modified: now,
};

// ---------------------------------------------------------------------------
// 6. CRYSTAL SDF
// ---------------------------------------------------------------------------
const crystal_sdf: ShaderPreset = {
  id: 'crystal_sdf',
  name: 'Crystal SDF',
  description:
    'Raymarched geometric crystal (octahedron intersected with box). ' +
    'Slow rotation, refraction-like coloring, specular highlights. ' +
    'Bass makes it pulse. Dramatic and monolithic.',
  tags: ['raymarching', 'sdf', 'crystal', '3d', 'specular', 'geometric'],
  params: {
    param1: 'Crystal Shape',
    param2: 'Rotation Speed',
    param3: 'Refraction',
    param4: 'Roughness',
  },
  code: `
float sdOctahedron(vec3 p, float s) {
    p = abs(p);
    float m = p.x + p.y + p.z - s;
    vec3 q;
    if (3.0 * p.x < m) q = p.xyz;
    else if (3.0 * p.y < m) q = p.yzx;
    else if (3.0 * p.z < m) q = p.zxy;
    else return m * 0.57735027;
    float k = clamp(0.5 * (q.z - q.y + s), 0.0, s);
    return length(vec3(q.x, q.y - s + k, q.z - k));
}

float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

mat3 rotateY(float a) {
    float s = sin(a), c = cos(a);
    return mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c);
}

mat3 rotateX(float a) {
    float s = sin(a), c = cos(a);
    return mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c);
}

float map(vec3 p) {
    float t = u_time * u_speed;
    float rotSpeed = 0.2 + u_param2 * 0.8;
    p = rotateY(t * rotSpeed) * rotateX(t * rotSpeed * 0.7) * p;

    float pulse = 1.0 + u_bass * 0.15 + sin(t * 0.5) * 0.05;
    float shape = u_param1;

    float octa = sdOctahedron(p, 1.0 * pulse);
    float box = sdBox(p, vec3(0.75 * pulse));

    // Morph between octahedron and box intersection
    float crystal = mix(octa, max(octa, box), shape);

    // Ground plane far below
    float ground = p.y + 3.0;

    return min(crystal, ground);
}

vec3 getNormal(vec3 p) {
    vec2 e = vec2(0.001, 0.0);
    return normalize(vec3(
        map(p + e.xyy) - map(p - e.xyy),
        map(p + e.yxy) - map(p - e.yxy),
        map(p + e.yyx) - map(p - e.yyx)
    ));
}

float raymarch(vec3 ro, vec3 rd) {
    float t = 0.0;
    for (int i = 0; i < 100; i++) {
        vec3 p = ro + rd * t;
        float d = map(p);
        if (d < 0.001) return t;
        if (t > 50.0) break;
        t += d;
    }
    return -1.0;
}

void main() {
    vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution) / u_resolution.y;
    float t = u_time * u_speed;

    // Camera
    vec3 ro = vec3(0.0, 0.5, 3.5);
    vec3 rd = normalize(vec3(uv, -1.5));

    vec3 col = u_bg;

    float dist = raymarch(ro, rd);

    if (dist > 0.0) {
        vec3 p = ro + rd * dist;
        vec3 n = getNormal(p);

        // Is this the crystal or the ground?
        bool isCrystal = p.y > -2.9;

        // Light setup
        vec3 lightDir = normalize(vec3(0.5, 1.0, 0.8));
        vec3 lightDir2 = normalize(vec3(-0.7, 0.3, -0.5));

        // Diffuse
        float diff = max(dot(n, lightDir), 0.0);
        float diff2 = max(dot(n, lightDir2), 0.0);

        // Specular (Blinn-Phong)
        vec3 viewDir = normalize(ro - p);
        vec3 halfDir = normalize(lightDir + viewDir);
        float roughness = 0.1 + u_param4 * 0.9;
        float specPow = mix(128.0, 8.0, roughness);
        float spec = pow(max(dot(n, halfDir), 0.0), specPow);
        float spec2 = pow(max(dot(n, normalize(lightDir2 + viewDir)), 0.0), specPow * 0.5);

        if (isCrystal) {
            // Refraction-like coloring: use normal as color lookup
            float refraction = u_param3;
            vec3 refractDir = refract(rd, n, 0.9 - refraction * 0.3);
            float fresnel = pow(1.0 - max(dot(viewDir, n), 0.0), 3.0);

            // Base crystal color from normals
            vec3 crystalColor = mix(u_color1, u_color2, n.y * 0.5 + 0.5);
            crystalColor = mix(crystalColor, u_color3, abs(n.x) * refraction);

            // Refraction tint
            vec3 refractColor = mix(u_color2, u_color3,
                dot(refractDir, vec3(0.0, 1.0, 0.0)) * 0.5 + 0.5);

            col = crystalColor * (diff * 0.6 + 0.2);
            col += diff2 * 0.15 * u_color3;
            col = mix(col, refractColor, fresnel * refraction * 0.5);
            col += spec * 1.5 * vec3(1.0);
            col += spec2 * 0.3 * u_color1;

            // Energy glow around edges
            col += u_energy * 0.2 * u_color1 * fresnel;
        } else {
            // Ground plane: dark reflective surface
            col = u_bg * 0.5 * (diff * 0.5 + 0.3);

            // Reflected crystal glow on ground
            float groundGlow = smoothstep(3.0, 0.0, length(p.xz));
            col += groundGlow * 0.1 * u_color1;
        }

        // Fog
        float fog = exp(-dist * 0.05);
        col = mix(u_bg, col, fog);
    } else {
        // Background: subtle gradient
        col = u_bg + uv.y * 0.03 * u_color1;
    }

    // Peak flash
    col += u_peak * 0.2 * u_color1 * smoothstep(0.6, 1.0, u_peak);

    col *= u_intensity;
    gl_FragColor = vec4(col, 1.0);
}
`,
  created: now,
  modified: now,
};

// ---------------------------------------------------------------------------
// 7. PARTICLE FIELD
// ---------------------------------------------------------------------------
const particle_field: ShaderPreset = {
  id: 'particle_field',
  name: 'Particle Field',
  description:
    'Procedural starfield / particle system with depth parallax. ' +
    'Foreground particles move faster, creating a warp-speed effect. ' +
    'Energy increases speed, peaks trigger particle pulses.',
  tags: ['particles', 'stars', 'parallax', 'warp', 'space', 'motion'],
  params: {
    param1: 'Particle Density',
    param2: 'Trail Length',
    param3: 'Depth Layers',
    param4: 'Particle Size',
  },
  code: `
float hash(vec2 p) {
    p = fract(p * vec2(443.8975, 397.2973));
    p += dot(p, p.yx + 19.19);
    return fract(p.x * p.y);
}

vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)),
             dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453123);
}

void main() {
    vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution) / u_resolution.y;
    vec2 uv01 = gl_FragCoord.xy / u_resolution;
    float t = u_time * u_speed;

    vec3 col = u_bg;

    // Number of depth layers
    float layerCount = 3.0 + u_param3 * 5.0;
    int layers = int(layerCount);

    float totalGlow = 0.0;
    vec3 totalColor = vec3(0.0);

    for (int layer = 0; layer < 8; layer++) {
        if (layer >= layers) break;

        float layerDepth = float(layer) / layerCount;
        float depthFactor = 1.0 - layerDepth; // 1.0 = closest, 0.0 = farthest

        // Parallax speed: closer = faster
        float speed = (0.2 + depthFactor * 1.8) * (1.0 + u_energy * 1.5);

        // Particle grid for this layer
        float density = 4.0 + u_param1 * 12.0;
        float gridScale = density * (0.5 + depthFactor * 0.5);

        vec2 movingUV = uv;
        movingUV.y -= t * speed;
        movingUV *= gridScale;

        vec2 gridID = floor(movingUV);
        vec2 gridUV = fract(movingUV) - 0.5;

        // Check neighboring cells for particles
        for (int dy = -1; dy <= 1; dy++) {
            for (int dx = -1; dx <= 1; dx++) {
                vec2 offset = vec2(float(dx), float(dy));
                vec2 cellID = gridID + offset;
                vec2 cellHash = hash2(cellID + float(layer) * 31.7);

                // Skip some cells for randomness
                if (cellHash.x > (0.3 + u_param1 * 0.5)) continue;

                // Particle position within cell
                vec2 particlePos = offset + cellHash - 0.5;
                vec2 diff = gridUV - particlePos;

                // Particle distance
                float d = length(diff);

                // Particle size varies by depth and param4
                float baseSize = (0.02 + u_param4 * 0.06) * depthFactor;

                // Trail: elongate in direction of motion
                float trailLength = u_param2 * 3.0 * speed;
                vec2 trailDiff = diff;
                trailDiff.y = max(trailDiff.y, 0.0) * (1.0 / (1.0 + trailLength));
                float trailD = length(trailDiff);

                float particleBright = smoothstep(baseSize, baseSize * 0.1, min(d, trailD));

                // Twinkle
                float twinkle = 0.6 + 0.4 * sin(t * 3.0 + cellHash.y * 100.0);
                particleBright *= twinkle;

                // Peak makes some particles flash
                float peakFlash = 1.0 + u_peak * 2.0 * step(0.9, cellHash.y);
                particleBright *= peakFlash;

                // Color varies by layer and cell
                vec3 pColor = mix(u_color1, u_color2, cellHash.x);
                pColor = mix(pColor, u_color3, layerDepth);

                // Depth-based brightness falloff
                float depthBright = 0.3 + 0.7 * depthFactor;

                totalColor += particleBright * pColor * depthBright;
                totalGlow += particleBright * depthBright * 0.05;
            }
        }
    }

    col += totalColor;

    // Soft background glow from accumulated particles
    col += totalGlow * u_color1 * 0.3;

    // Vignette
    vec2 vq = uv01;
    vq *= 1.0 - vq;
    float vig = smoothstep(0.0, 0.2, pow(vq.x * vq.y, 0.35));
    col *= vig;

    col *= u_intensity;
    gl_FragColor = vec4(col, 1.0);
}
`,
  created: now,
  modified: now,
};

// ---------------------------------------------------------------------------
// 8. GLITCH STORM
// ---------------------------------------------------------------------------
const glitch_storm: ShaderPreset = {
  id: 'glitch_storm',
  name: 'Glitch Storm',
  description:
    'Aggressive digital glitch aesthetic with block displacement, ' +
    'RGB channel splitting, noise bands, and scanlines. ' +
    'Peak triggers intense glitch bursts. Rhythmic digital corruption.',
  tags: ['glitch', 'digital', 'noise', 'aggressive', 'rgb-split', 'corruption'],
  params: {
    param1: 'Glitch Intensity',
    param2: 'Block Size',
    param3: 'RGB Split',
    param4: 'Scanline Density',
  },
  code: `
float hash(vec2 p) {
    p = fract(p * vec2(443.8975, 397.2973));
    p += dot(p, p.yx + 19.19);
    return fract(p.x * p.y);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Stepped time for glitch rhythm
float glitchTime(float t, float rate) {
    return floor(t * rate) / rate;
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec2 centeredUV = (gl_FragCoord.xy * 2.0 - u_resolution) / u_resolution.y;
    float t = u_time * u_speed;

    float glitchIntensity = 0.15 + u_param1 * 0.85;

    // Glitch trigger: peaks cause intense bursts, otherwise subtle
    float burstIntensity = u_peak * u_peak;
    float activeGlitch = glitchIntensity * (0.3 + burstIntensity * 2.0);

    // Stepped time for block-based glitching
    float gt = glitchTime(t, 8.0);
    float gt2 = glitchTime(t, 4.0);
    float gt3 = glitchTime(t, 16.0);

    // Block size
    float blockSize = 0.02 + u_param2 * 0.15;
    vec2 blockUV = floor(uv / blockSize) * blockSize;

    // Block displacement
    float blockNoise = hash(blockUV + gt);
    float blockActive = step(1.0 - activeGlitch * 0.5, blockNoise);
    vec2 displacement = vec2(0.0);
    displacement.x = (hash(blockUV + gt + 0.1) - 0.5) * blockActive * activeGlitch * 0.3;
    displacement.y = (hash(blockUV + gt + 0.2) - 0.5) * blockActive * activeGlitch * 0.1;

    vec2 glitchedUV = uv + displacement;

    // Horizontal noise bands
    float bandNoise = hash(vec2(floor(uv.y * 30.0), gt2));
    float bandActive = step(1.0 - activeGlitch * 0.3, bandNoise);
    glitchedUV.x += bandActive * (hash(vec2(floor(uv.y * 30.0), gt3)) - 0.5) * 0.15 * activeGlitch;

    // RGB split amount
    float rgbSplit = (0.003 + u_param3 * 0.02) * (1.0 + burstIntensity * 3.0);
    float splitAngle = hash(vec2(gt, 0.5)) * 6.28;
    vec2 splitDir = vec2(cos(splitAngle), sin(splitAngle)) * rgbSplit;

    // Base pattern: geometric shapes that get corrupted
    vec2 patUV = (glitchedUV * 2.0 - 1.0) * vec2(u_resolution.x / u_resolution.y, 1.0);

    // Rotating geometric base
    float angle = t * 0.3;
    float cs = cos(angle), sn = sin(angle);
    vec2 rotUV = mat2(cs, -sn, sn, cs) * patUV;

    // Multiple geometric layers
    float pattern = 0.0;

    // Concentric squares
    vec2 absUV = abs(rotUV);
    float squareDist = max(absUV.x, absUV.y);
    pattern += smoothstep(0.01, 0.0, abs(fract(squareDist * 4.0 + t * 0.5) - 0.5) - 0.45);

    // Diagonal lines
    pattern += smoothstep(0.02, 0.0, abs(fract((rotUV.x + rotUV.y) * 3.0 + t * 0.3) - 0.5) - 0.45) * 0.5;

    // Circle
    float circleDist = length(patUV);
    pattern += smoothstep(0.02, 0.0, abs(circleDist - 0.5 - sin(t) * 0.1)) * 0.7;

    // Generate RGB channels with chromatic aberration
    vec2 uvR = glitchedUV + splitDir;
    vec2 uvB = glitchedUV - splitDir;

    // Recompute pattern for each channel (offset UVs)
    vec2 patR = (uvR * 2.0 - 1.0) * vec2(u_resolution.x / u_resolution.y, 1.0);
    vec2 patB = (uvB * 2.0 - 1.0) * vec2(u_resolution.x / u_resolution.y, 1.0);

    float pR = max(abs(mat2(cs,-sn,sn,cs) * patR).x, abs(mat2(cs,-sn,sn,cs) * patR).y);
    float pB = max(abs(mat2(cs,-sn,sn,cs) * patB).x, abs(mat2(cs,-sn,sn,cs) * patB).y);

    float patternR = smoothstep(0.01, 0.0, abs(fract(pR * 4.0 + t * 0.5) - 0.5) - 0.45);
    float patternB = smoothstep(0.01, 0.0, abs(fract(pB * 4.0 + t * 0.5) - 0.5) - 0.45);

    // Compose color
    vec3 col;
    col.r = mix(pattern, patternR, min(rgbSplit * 20.0, 1.0));
    col.g = pattern;
    col.b = mix(pattern, patternB, min(rgbSplit * 20.0, 1.0));

    // Color from palette
    vec3 tintR = u_color1;
    vec3 tintG = u_color2;
    vec3 tintB = u_color3;
    col = col.r * tintR + col.g * tintG * 0.3 + col.b * tintB;
    col += u_bg * 0.5;

    // Noise overlay
    float noiseOverlay = hash(gl_FragCoord.xy + fract(t * 100.0)) * 0.08 * (1.0 + burstIntensity);
    col += noiseOverlay;

    // Scanlines
    float scanDensity = 200.0 + u_param4 * 600.0;
    float scan = 0.9 + 0.1 * sin(gl_FragCoord.y * scanDensity / u_resolution.y * 3.14159);
    col *= scan;

    // Horizontal sync glitch: entire line shifts
    float syncGlitch = step(0.98 - burstIntensity * 0.1, hash(vec2(floor(gl_FragCoord.y * 0.5), gt3)));
    col = mix(col, col.gbr * 1.5, syncGlitch * activeGlitch);

    // Inversion on peak
    col = mix(col, 1.0 - col, burstIntensity * 0.3);

    // Bass drives overall brightness
    col *= 0.8 + u_bass * 0.4;

    col *= u_intensity;
    gl_FragColor = vec4(col, 1.0);
}
`,
  created: now,
  modified: now,
};

// ---------------------------------------------------------------------------
// 9. LIQUID METAL
// ---------------------------------------------------------------------------
const liquid_metal: ShaderPreset = {
  id: 'liquid_metal',
  name: 'Liquid Metal',
  description:
    'Smooth metallic blobs using 2D metaball distance fields. ' +
    'Chrome-like reflections, specular highlights, blobs merge and split. ' +
    'Bass makes blobs expand. T-1000 vibes.',
  tags: ['metaball', 'metal', 'chrome', 'liquid', 'reflective', 'organic'],
  params: {
    param1: 'Blob Count',
    param2: 'Smoothness',
    param3: 'Reflectivity',
    param4: 'Color Tint',
  },
  code: `
vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
    return a + b * cos(6.28318 * (c * t + d));
}

vec3 hsv2rgb(vec3 c) {
    vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
    return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

void main() {
    vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution) / u_resolution.y;
    float t = u_time * u_speed;

    // Blob parameters
    int blobCount = 3 + int(u_param1 * 6.0);
    float smoothK = 0.3 + u_param2 * 1.2;
    float reflectivity = 0.3 + u_param3 * 0.7;

    // Accumulate metaball field
    float field = 0.0;
    vec2 nearest = vec2(0.0);
    float nearestDist = 100.0;

    for (int i = 0; i < 9; i++) {
        if (i >= blobCount) break;

        float fi = float(i);
        float phase = fi * 2.399;

        // Blob positions: circular orbits with varied speeds
        vec2 blobPos = vec2(
            sin(t * (0.3 + fi * 0.1) + phase) * (0.4 + fi * 0.08),
            cos(t * (0.25 + fi * 0.12) + phase * 1.3) * (0.3 + fi * 0.07)
        );

        // Bass makes blobs expand outward
        blobPos *= 1.0 + u_bass * 0.3;

        float blobRadius = 0.15 + sin(t * 0.5 + fi) * 0.03;
        float d = length(uv - blobPos);

        // Metaball contribution: inverse square
        field += (blobRadius * blobRadius) / (d * d + 0.001);

        if (d < nearestDist) {
            nearestDist = d;
            nearest = blobPos;
        }
    }

    // Threshold and edge
    float threshold = 1.0;
    float edge = smoothstep(threshold - 0.1 * smoothK, threshold + 0.02, field);

    // Compute pseudo-normal from field gradient (for lighting)
    vec2 eps = vec2(0.005, 0.0);
    float fieldDx = 0.0;
    float fieldDy = 0.0;
    for (int i = 0; i < 9; i++) {
        if (i >= blobCount) break;
        float fi = float(i);
        float phase = fi * 2.399;
        vec2 bp = vec2(
            sin(t * (0.3 + fi * 0.1) + phase) * (0.4 + fi * 0.08),
            cos(t * (0.25 + fi * 0.12) + phase * 1.3) * (0.3 + fi * 0.07)
        ) * (1.0 + u_bass * 0.3);
        float r = 0.15 + sin(t * 0.5 + fi) * 0.03;
        float r2 = r * r;
        float dx = length(uv + eps.xy - bp);
        float dy = length(uv + eps.yx - bp);
        float d0 = length(uv - bp);
        fieldDx += r2 / (dx * dx + 0.001) - r2 / (d0 * d0 + 0.001);
        fieldDy += r2 / (dy * dy + 0.001) - r2 / (d0 * d0 + 0.001);
    }
    vec2 grad = vec2(fieldDx, fieldDy) / eps.x;
    vec3 normal = normalize(vec3(grad, 1.0));

    // Lighting
    vec3 lightDir = normalize(vec3(0.5, 0.8, 1.0));
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    vec3 halfDir = normalize(lightDir + viewDir);

    float diff = max(dot(normal, lightDir), 0.0);
    float spec = pow(max(dot(normal, halfDir), 0.0), 64.0);

    // Fresnel
    float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);

    // Environment reflection simulation
    vec3 reflDir = reflect(-viewDir, normal);
    float envAngle = atan(reflDir.y, reflDir.x);
    float envGrad = reflDir.y * 0.5 + 0.5;

    vec3 envColor = palette(
        envAngle / 6.28 + t * 0.05,
        vec3(0.5), vec3(0.5),
        vec3(1.0, 0.7, 0.4),
        vec3(0.0, 0.15, 0.20)
    );

    // Metal color
    float tintAmount = u_param4;
    vec3 metalBase = mix(vec3(0.8, 0.82, 0.85), u_color1, tintAmount * 0.5);

    // Compose metal surface
    vec3 metalColor = metalBase * (diff * 0.4 + 0.3);
    metalColor += spec * 2.0 * vec3(1.0);
    metalColor = mix(metalColor, envColor * metalBase, fresnel * reflectivity);

    // Subtle colored reflections from palette
    metalColor += fresnel * u_color2 * 0.15 * reflectivity;

    // Combine with background
    vec3 col = mix(u_bg, metalColor, edge);

    // Rim glow at metaball edges
    float rimGlow = smoothstep(threshold + 0.1, threshold - 0.05, field) *
                    smoothstep(threshold - 0.3, threshold - 0.05, field);
    col += rimGlow * u_color3 * 0.4;

    // Energy brightens specular
    col += edge * u_energy * 0.2 * spec * u_color1;

    // Mid shifts environment map hue
    envColor = mix(envColor, envColor.gbr, u_mid * 0.3);

    col *= u_intensity;
    gl_FragColor = vec4(col, 1.0);
}
`,
  created: now,
  modified: now,
};

// ---------------------------------------------------------------------------
// 10. SACRED GEOMETRY
// ---------------------------------------------------------------------------
const sacred_geometry: ShaderPreset = {
  id: 'sacred_geometry',
  name: 'Sacred Geometry',
  description:
    'Rotating sacred geometry patterns with flower-of-life and overlapping ' +
    'circles. Bloom and glow on thin lines. Multiple layers at different ' +
    'scales. Meditative and transcendent.',
  tags: ['sacred', 'geometry', 'circles', 'bloom', 'meditative', 'mandala'],
  params: {
    param1: 'Complexity',
    param2: 'Line Width',
    param3: 'Bloom Intensity',
    param4: 'Layer Count',
  },
  code: `
float glow(float d, float radius, float intensity) {
    return intensity / (abs(d) / radius + 1.0);
}

mat2 rotate2d(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
}

// Distance to a circle ring
float sdRing(vec2 p, vec2 center, float radius) {
    return abs(length(p - center) - radius);
}

// Distance to a line segment
float sdLine(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}

void main() {
    vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution) / u_resolution.y;
    float t = u_time * u_speed;

    float complexity = 1.0 + u_param1 * 4.0;
    float lineWidth = 0.002 + u_param2 * 0.008;
    float bloomIntensity = 0.3 + u_param3 * 1.2;
    int layerCount = 1 + int(u_param4 * 3.0);

    vec3 col = u_bg;

    for (int layer = 0; layer < 4; layer++) {
        if (layer >= layerCount) break;

        float layerScale = 1.0 - float(layer) * 0.25;
        float layerAlpha = 1.0 - float(layer) * 0.2;
        float layerRotation = t * 0.1 * (1.0 + float(layer) * 0.3) *
                              (mod(float(layer), 2.0) < 0.5 ? 1.0 : -1.0);

        vec2 p = rotate2d(layerRotation) * uv / layerScale;

        float d = 1000.0;

        // Central circle
        float centralRadius = 0.3;
        d = min(d, sdRing(p, vec2(0.0), centralRadius));

        // Flower of Life: 6 circles around center
        int petalCount = int(6.0 * complexity);
        petalCount = min(petalCount, 24);
        for (int i = 0; i < 24; i++) {
            if (i >= petalCount) break;
            float angle = float(i) * 6.28318 / float(petalCount);
            vec2 center = vec2(cos(angle), sin(angle)) * centralRadius;
            d = min(d, sdRing(p, center, centralRadius));
        }

        // Second ring of circles (complexity > 2)
        if (complexity > 2.0) {
            int outerCount = min(int(12.0 * (complexity - 1.0)), 24);
            for (int i = 0; i < 24; i++) {
                if (i >= outerCount) break;
                float angle = float(i) * 6.28318 / float(outerCount) + 0.1;
                vec2 center = vec2(cos(angle), sin(angle)) * centralRadius * 2.0;
                d = min(d, sdRing(p, center, centralRadius));
            }
        }

        // Hexagonal star lines (complexity > 1.5)
        if (complexity > 1.5) {
            for (int i = 0; i < 6; i++) {
                float angle = float(i) * 6.28318 / 6.0 + t * 0.03;
                vec2 dir = vec2(cos(angle), sin(angle));
                d = min(d, sdLine(p, -dir * centralRadius * 3.0, dir * centralRadius * 3.0));
            }
        }

        // Outer bounding circle
        d = min(d, sdRing(p, vec2(0.0), centralRadius * 3.0));

        // Inner small circle
        d = min(d, sdRing(p, vec2(0.0), centralRadius * 0.15));

        // Triangle (Metatron's cube hint at high complexity)
        if (complexity > 3.0) {
            for (int i = 0; i < 3; i++) {
                float a1 = float(i) * 6.28318 / 3.0 + t * 0.02;
                float a2 = float(i + 1) * 6.28318 / 3.0 + t * 0.02;
                vec2 v1 = vec2(cos(a1), sin(a1)) * centralRadius * 2.5;
                vec2 v2 = vec2(cos(a2), sin(a2)) * centralRadius * 2.5;
                d = min(d, sdLine(p, v1, v2));
            }
            // Inverted triangle
            for (int i = 0; i < 3; i++) {
                float a1 = float(i) * 6.28318 / 3.0 + 3.14159 / 3.0 + t * 0.02;
                float a2 = float(i + 1) * 6.28318 / 3.0 + 3.14159 / 3.0 + t * 0.02;
                vec2 v1 = vec2(cos(a1), sin(a1)) * centralRadius * 2.5;
                vec2 v2 = vec2(cos(a2), sin(a2)) * centralRadius * 2.5;
                d = min(d, sdLine(p, v1, v2));
            }
        }

        // Render lines with glow
        float line = smoothstep(lineWidth, 0.0, d);
        float glowLine = glow(d, lineWidth * 8.0, bloomIntensity * 0.04);

        // Bass modulates glow
        glowLine *= 1.0 + u_bass * 0.5;

        // Color per layer
        vec3 layerColor;
        if (layer == 0) layerColor = u_color1;
        else if (layer == 1) layerColor = u_color2;
        else if (layer == 2) layerColor = u_color3;
        else layerColor = mix(u_color1, u_color3, 0.5);

        col += (line * 0.8 + glowLine) * layerColor * layerAlpha;
    }

    // Bloom: boost bright areas
    float brightness = max(col.r, max(col.g, col.b));
    float bloomFactor = smoothstep(0.4, 1.0, brightness) * bloomIntensity * 0.3;
    col += col * bloomFactor;

    // Energy adds overall luminosity
    col += u_energy * 0.05 * u_color1;

    // Mid shifts between warm and cool
    col = mix(col, col * vec3(0.8, 0.9, 1.2), u_mid * 0.3);

    // High frequency adds fine sparkle at intersection points
    float sparkle = smoothstep(0.8, 1.0, brightness) * u_high * 0.5;
    col += sparkle * vec3(1.0);

    // Vignette
    vec2 uv01 = gl_FragCoord.xy / u_resolution;
    vec2 vq = uv01;
    vq *= 1.0 - vq;
    float vig = smoothstep(0.0, 0.25, pow(vq.x * vq.y, 0.35));
    col *= vig;

    col *= u_intensity;
    gl_FragColor = vec4(col, 1.0);
}
`,
  created: now,
  modified: now,
};

// ---------------------------------------------------------------------------
// Export all presets
// ---------------------------------------------------------------------------

export const EXAMPLE_PRESETS: ShaderPreset[] = [
  void_pulse,
  fractal_zoom,
  tunnel_warp,
  neon_grid,
  organic_flow,
  crystal_sdf,
  particle_field,
  glitch_storm,
  liquid_metal,
  sacred_geometry,
];
