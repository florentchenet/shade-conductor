// === shade-conductor: GLSL Utility Function Library ===
// Full implementations ready to copy-paste into shaders.
// Served as MCP resource at shader://glsl-library

export const GLSL_LIBRARY = `
// ============================================================================
// GLSL UTILITY LIBRARY — shade-conductor
// Copy-paste any functions you need into your shader code.
// ============================================================================


// ============================================================================
// NOISE FUNCTIONS
// ============================================================================

// --- Simple 2D hash ---
// Returns a pseudo-random float in [0, 1) from a 2D input.
float hash(vec2 p) {
    p = fract(p * vec2(443.8975, 397.2973));
    p += dot(p, p.yx + 19.19);
    return fract(p.x * p.y);
}

// --- 2D to 2D hash ---
// Returns a pseudo-random vec2 in [0, 1) from a 2D input.
vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)),
             dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453123);
}

// --- Value noise with smooth interpolation ---
// Smooth 2D noise using bilinear interpolation of hash values.
// Returns values in approximately [0, 1].
float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);

    // Quintic Hermite interpolation for smoother results
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);

    float a = hash(i + vec2(0.0, 0.0));
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    return mix(mix(a, b, u.x),
               mix(c, d, u.x), u.y);
}

// --- Fractal Brownian Motion ---
// Layers multiple octaves of noise for natural-looking turbulence.
// Use const int for WebGL1 loop compatibility.
// Typical usage: fbm(uv * 3.0, 5)
float fbm(vec2 p, const int octaves) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    float total = 0.0;

    for (int i = 0; i < octaves; i++) {
        value += amplitude * noise(p * frequency);
        total += amplitude;
        frequency *= 2.0;
        amplitude *= 0.5;
        p += vec2(5.3, 1.7); // domain shift to reduce axis-aligned artifacts
    }

    return value / total;
}

// --- Voronoi / Cellular Noise ---
// Returns the distance to the nearest random feature point in a grid.
// Useful for organic cell patterns, cracked surfaces, crystal structures.
float voronoi(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);

    float minDist = 1.0;

    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 neighbor = vec2(float(x), float(y));
            vec2 point = hash2(i + neighbor);
            vec2 diff = neighbor + point - f;
            float dist = length(diff);
            minDist = min(minDist, dist);
        }
    }

    return minDist;
}


// ============================================================================
// SDF PRIMITIVES
// All return signed distance: negative = inside, positive = outside.
// ============================================================================

// --- Sphere ---
// p: sample point, r: radius
float sdSphere(vec3 p, float r) {
    return length(p) - r;
}

// --- Box ---
// p: sample point, b: half-extents (width/2, height/2, depth/2)
float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

// --- Torus ---
// p: sample point, t.x: major radius, t.y: minor radius (tube thickness)
float sdTorus(vec3 p, vec2 t) {
    vec2 q = vec2(length(p.xz) - t.x, p.y);
    return length(q) - t.y;
}

// --- Cylinder ---
// p: sample point, h: half-height, r: radius
float sdCylinder(vec3 p, float h, float r) {
    vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

// --- Octahedron (exact) ---
// p: sample point, s: size
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

// --- Plane ---
// p: sample point, n: normal (must be normalized), h: offset along normal
float sdPlane(vec3 p, vec3 n, float h) {
    return dot(p, n) + h;
}


// ============================================================================
// SDF OPERATIONS
// Combine distance fields to create complex shapes.
// ============================================================================

// --- Union: closest surface wins ---
float opUnion(float d1, float d2) {
    return min(d1, d2);
}

// --- Subtraction: carve d2 out of d1 ---
float opSubtract(float d1, float d2) {
    return max(d1, -d2);
}

// --- Intersection: only where both overlap ---
float opIntersect(float d1, float d2) {
    return max(d1, d2);
}

// --- Smooth Union: blend two surfaces with smooth transition ---
// k: smoothness factor (0.1 = subtle blend, 0.5 = very smooth merge)
float opSmoothUnion(float d1, float d2, float k) {
    float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
    return mix(d2, d1, h) - k * h * (1.0 - h);
}


// ============================================================================
// RAYMARCHING
// ============================================================================

// --- Raymarch function ---
// Assumes you have defined: float map(vec3 p) returning the scene SDF.
// ro: ray origin, rd: ray direction (normalized)
// Returns the total distance marched, or -1.0 if no hit.
//
// Usage:
//   float t = raymarch(ro, rd);
//   if (t > 0.0) {
//       vec3 p = ro + rd * t;
//       vec3 n = getNormal(p);
//       // shade...
//   }
float raymarch(vec3 ro, vec3 rd) {
    float t = 0.0;
    for (int i = 0; i < 128; i++) {
        vec3 p = ro + rd * t;
        float d = map(p);
        if (d < 0.001) return t;
        if (t > 100.0) break;
        t += d;
    }
    return -1.0;
}

// --- Surface normal via central differences ---
// Requires: float map(vec3 p)
vec3 getNormal(vec3 p) {
    vec2 e = vec2(0.001, 0.0);
    return normalize(vec3(
        map(p + e.xyy) - map(p - e.xyy),
        map(p + e.yxy) - map(p - e.yxy),
        map(p + e.yyx) - map(p - e.yyx)
    ));
}


// ============================================================================
// COLOR UTILITIES
// ============================================================================

// --- Inigo Quilez cosine palette ---
// Creates smooth, cyclic color gradients with 4 vec3 parameters.
// t: input value (typically 0-1, but wraps naturally)
// a: bias (base color), b: amplitude, c: frequency, d: phase
//
// Common palettes (a, b, c, d):
//   Rainbow:    (0.5,0.5,0.5), (0.5,0.5,0.5), (1.0,1.0,1.0), (0.0,0.33,0.67)
//   Fire:       (0.5,0.5,0.5), (0.5,0.5,0.5), (1.0,1.0,0.5), (0.0,0.10,0.20)
//   Cool:       (0.5,0.5,0.5), (0.5,0.5,0.5), (1.0,0.7,0.4), (0.0,0.15,0.20)
//   Neon:       (0.5,0.5,0.5), (0.5,0.5,0.5), (2.0,1.0,0.0), (0.5,0.20,0.25)
vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
    return a + b * cos(6.28318530718 * (c * t + d));
}

// --- HSV to RGB ---
// h: hue (0-1), s: saturation (0-1), v: value/brightness (0-1)
vec3 hsv2rgb(vec3 c) {
    vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
    return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

// --- RGB to HSV ---
vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}


// ============================================================================
// COORDINATE TRANSFORMS
// ============================================================================

// --- 2D rotation matrix ---
// a: angle in radians
mat2 rotate2d(float a) {
    float s = sin(a);
    float c = cos(a);
    return mat2(c, -s, s, c);
}

// --- 3D rotation around X axis ---
mat3 rotateX(float a) {
    float s = sin(a);
    float c = cos(a);
    return mat3(1.0, 0.0, 0.0,
                0.0,   c,  -s,
                0.0,   s,   c);
}

// --- 3D rotation around Y axis ---
mat3 rotateY(float a) {
    float s = sin(a);
    float c = cos(a);
    return mat3(  c, 0.0,   s,
                0.0, 1.0, 0.0,
                 -s, 0.0,   c);
}

// --- 3D rotation around Z axis ---
mat3 rotateZ(float a) {
    float s = sin(a);
    float c = cos(a);
    return mat3(c, -s, 0.0,
                s,  c, 0.0,
                0.0, 0.0, 1.0);
}

// --- Cartesian to Polar ---
// Returns vec2(radius, angle). Angle in radians [-PI, PI].
vec2 polar(vec2 p) {
    return vec2(length(p), atan(p.y, p.x));
}


// ============================================================================
// EFFECTS
// ============================================================================

// --- Glow ---
// Soft falloff around a distance field edge. Good for neon-style rendering.
// d: signed distance, radius: glow extent, intensity: brightness
float glow(float d, float radius, float intensity) {
    return intensity / (abs(d) / radius + 1.0);
}

// --- Bloom (single-pass approximation) ---
// Simulates bloom by boosting bright areas with soft falloff.
// col: input color, threshold: brightness above which bloom kicks in,
// intensity: bloom strength
vec3 bloom(vec3 col, float threshold, float intensity) {
    float brightness = max(col.r, max(col.g, col.b));
    float softBrightness = smoothstep(threshold, threshold + 0.5, brightness);
    return col + col * softBrightness * intensity;
}

// --- Chromatic Aberration ---
// Samples a texture at offset positions for R, G, B channels.
// Requires a texture (use u_prevFrame in WebGL2, or apply to computed color).
// uv: texture coordinate, direction: aberration direction (e.g., normalize(uv - 0.5)),
// amount: pixel offset strength
//
// For computed colors (no texture), use this pattern instead:
//   vec3 chromaticAberration(vec2 uv, float amount) {
//       vec3 col;
//       col.r = yourColorFunction(uv + vec2(amount, 0.0)).r;
//       col.g = yourColorFunction(uv).g;
//       col.b = yourColorFunction(uv - vec2(amount, 0.0)).b;
//       return col;
//   }

// --- Vignette ---
// Darkens edges of the screen for a cinematic look.
// uv: normalized coordinates (0-1), intensity: how dark edges get (0.5 = subtle),
// smoothness: falloff width
float vignette(vec2 uv, float intensity, float smoothness) {
    vec2 q = uv;
    q *= 1.0 - q;
    float vig = q.x * q.y;
    return smoothstep(0.0, smoothness, pow(vig, intensity));
}

// --- Scanlines ---
// CRT-style horizontal scanlines.
// uv: screen coordinates (use gl_FragCoord.y or uv * resolution.y),
// density: lines per screen height, brightness: how visible (0 = full black lines)
float scanlines(float y, float density, float brightness) {
    return brightness + (1.0 - brightness) * (0.5 + 0.5 * sin(y * density * 3.14159265));
}
`;
