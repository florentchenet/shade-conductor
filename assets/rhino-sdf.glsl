// =============================================================================
// Rhinoceros SDF for Realtime Raymarching
// =============================================================================
// Approximates a rhinoceros (the animal) using smooth-unioned SDF primitives.
// Designed for use in shade-conductor shaders.
//
// Usage:
//   float d = sdRhino(p, dance);
//   where p is the world-space sample point and dance is 0.0-1.0 animation.
//
// References:
//   - Inigo Quilez SDF primitives: https://iquilezles.org/articles/distfunctions/
//   - Smooth minimum: https://iquilezles.org/articles/smin/
// =============================================================================

// ---------------------------------------------------------------------------
// SDF Primitives (from iq)
// ---------------------------------------------------------------------------

float sdSphere(vec3 p, float r) {
    return length(p) - r;
}

float sdEllipsoid(vec3 p, vec3 r) {
    float k0 = length(p / r);
    float k1 = length(p / (r * r));
    return k0 * (k0 - 1.0) / k1;
}

float sdCappedCylinder(vec3 p, float r, float h) {
    vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float sdCappedCone(vec3 p, float h, float r1, float r2) {
    vec2 q = vec2(length(p.xz), p.y);
    vec2 k1 = vec2(r2, h);
    vec2 k2 = vec2(r2 - r1, 2.0 * h);
    vec2 ca = vec2(q.x - min(q.x, (q.y < 0.0) ? r1 : r2), abs(q.y) - h);
    vec2 cb = q - k1 + k2 * clamp(dot(k1 - q, k2) / dot(k2, k2), 0.0, 1.0);
    float s = (cb.x < 0.0 && ca.y < 0.0) ? -1.0 : 1.0;
    return s * sqrt(min(dot(ca, ca), dot(cb, cb)));
}

float sdRoundCone(vec3 p, float r1, float r2, float h) {
    float b = (r1 - r2) / h;
    float a = sqrt(1.0 - b * b);
    vec2 q = vec2(length(p.xz), p.y);
    float k = dot(q, vec2(-b, a));
    if (k < 0.0) return length(q) - r1;
    if (k > a * h) return length(q - vec2(0.0, h)) - r2;
    return dot(q, vec2(a, b)) - r1;
}

// ---------------------------------------------------------------------------
// Smooth boolean operators
// ---------------------------------------------------------------------------

// Quadratic polynomial smooth min (fast, good quality)
float smin(float a, float b, float k) {
    k *= 4.0;
    float h = max(k - abs(a - b), 0.0) / k;
    return min(a, b) - h * h * k * 0.25;
}

// Smooth subtraction
float smax(float a, float b, float k) {
    return -smin(-a, -b, k);
}

// ---------------------------------------------------------------------------
// Rotation helpers
// ---------------------------------------------------------------------------

mat2 rot2(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

vec3 rotX(vec3 p, float a) {
    p.yz *= rot2(a);
    return p;
}

vec3 rotY(vec3 p, float a) {
    p.xz *= rot2(a);
    return p;
}

vec3 rotZ(vec3 p, float a) {
    p.xy *= rot2(a);
    return p;
}

// ---------------------------------------------------------------------------
// Rhinoceros SDF
// ---------------------------------------------------------------------------
// Anatomy reference (approximate proportions, scaled to ~2.0 units long):
//   - Body: large barrel, center of mass
//   - Head: box-ish with sloped snout
//   - Horn(s): front horn large, second smaller behind
//   - Legs: 4 thick tapered cylinders
//   - Tail: thin tapered cylinder
//   - Ears: two small cones
//
// The `dance` parameter (0.0 to 1.0) drives:
//   - Leg stepping animation (alternating pairs)
//   - Head bobbing
//   - Tail swishing
//   - Subtle body bounce

float sdRhino(vec3 p, float dance) {
    // Animation curves from dance parameter
    float legPhase   = dance * 6.2831853;  // full cycle
    float headBob    = sin(legPhase) * 0.06;
    float tailSwish  = sin(legPhase * 1.5) * 0.15;
    float bodyBounce = abs(sin(legPhase)) * 0.03;

    // Leg stepping: front-left/back-right vs front-right/back-left
    float legLift1 = max(sin(legPhase), 0.0) * 0.12;         // FL, BR
    float legSwing1 = sin(legPhase) * 0.15;
    float legLift2 = max(sin(legPhase + 3.14159), 0.0) * 0.12; // FR, BL
    float legSwing2 = sin(legPhase + 3.14159) * 0.15;

    // Center the rhino: body center at origin, standing on y=0
    vec3 q = p;
    q.y -= 0.75 + bodyBounce;  // raise so feet touch ground

    float d = 1e10;

    // === BODY (main barrel) ===
    // Large ellipsoid, slightly flattened top-to-bottom
    float body = sdEllipsoid(q, vec3(0.9, 0.55, 0.5));
    d = body;

    // Rear hump / shoulder mass (rhinos are front-heavy)
    float shoulder = sdEllipsoid(q - vec3(-0.15, 0.15, 0.0), vec3(0.65, 0.45, 0.48));
    d = smin(d, shoulder, 0.3);

    // Belly underside (slight droop)
    float belly = sdEllipsoid(q - vec3(0.1, -0.2, 0.0), vec3(0.6, 0.35, 0.42));
    d = smin(d, belly, 0.25);

    // === HEAD ===
    vec3 hp = q - vec3(0.95, 0.1 + headBob, 0.0);
    hp = rotZ(hp, -0.15);  // slight downward angle

    // Main head block
    float head = sdEllipsoid(hp, vec3(0.45, 0.3, 0.32));
    d = smin(d, head, 0.2);

    // Snout / muzzle (elongated, narrower)
    vec3 sp = hp - vec3(0.35, -0.08, 0.0);
    sp = rotZ(sp, -0.1);
    float snout = sdEllipsoid(sp, vec3(0.25, 0.18, 0.22));
    d = smin(d, snout, 0.15);

    // Mouth area (wider at the front)
    vec3 mp = hp - vec3(0.5, -0.15, 0.0);
    float mouth = sdEllipsoid(mp, vec3(0.15, 0.1, 0.2));
    d = smin(d, mouth, 0.1);

    // === HORNS ===
    // Main horn (front, large)
    vec3 h1p = hp - vec3(0.3, 0.2, 0.0);
    h1p = rotZ(h1p, 0.3);  // tilted forward
    float horn1 = sdCappedCone(h1p, 0.25, 0.08, 0.015);
    d = smin(d, horn1, 0.05);

    // Second horn (smaller, behind the first)
    vec3 h2p = hp - vec3(0.1, 0.22, 0.0);
    h2p = rotZ(h2p, 0.2);
    float horn2 = sdCappedCone(h2p, 0.12, 0.055, 0.02);
    d = smin(d, horn2, 0.04);

    // === EARS ===
    // Small cones on top of head, angled outward
    for (float side = -1.0; side <= 1.0; side += 2.0) {
        vec3 ep = hp - vec3(-0.15, 0.25, side * 0.2);
        ep = rotZ(ep, -0.3);
        ep = rotX(ep, side * 0.4);
        float ear = sdCappedCone(ep, 0.08, 0.04, 0.01);
        d = smin(d, ear, 0.06);
    }

    // === LEGS ===
    // Rhinos have thick, column-like legs
    float legRadius = 0.12;
    float legHeight = 0.35;

    // Front-left leg
    {
        vec3 lp = q - vec3(0.45, -0.45 + legLift1, -0.28);
        lp.z += legSwing1 * 0.3;  // swing forward/back
        float leg = sdCappedCylinder(lp, legRadius, legHeight);
        // Foot (wider at bottom)
        vec3 fp = lp - vec3(0.0, -legHeight, 0.0);
        float foot = sdCappedCylinder(fp, legRadius * 1.3, 0.04);
        leg = smin(leg, foot, 0.05);
        d = smin(d, leg, 0.15);
    }

    // Front-right leg
    {
        vec3 lp = q - vec3(0.45, -0.45 + legLift2, 0.28);
        lp.z += legSwing2 * 0.3;
        float leg = sdCappedCylinder(lp, legRadius, legHeight);
        vec3 fp = lp - vec3(0.0, -legHeight, 0.0);
        float foot = sdCappedCylinder(fp, legRadius * 1.3, 0.04);
        leg = smin(leg, foot, 0.05);
        d = smin(d, leg, 0.15);
    }

    // Back-left leg
    {
        vec3 lp = q - vec3(-0.55, -0.45 + legLift2, -0.28);
        lp.z += legSwing2 * 0.3;
        float leg = sdCappedCylinder(lp, legRadius * 1.05, legHeight);
        vec3 fp = lp - vec3(0.0, -legHeight, 0.0);
        float foot = sdCappedCylinder(fp, legRadius * 1.3, 0.04);
        leg = smin(leg, foot, 0.05);
        d = smin(d, leg, 0.15);
    }

    // Back-right leg
    {
        vec3 lp = q - vec3(-0.55, -0.45 + legLift1, 0.28);
        lp.z += legSwing1 * 0.3;
        float leg = sdCappedCylinder(lp, legRadius * 1.05, legHeight);
        vec3 fp = lp - vec3(0.0, -legHeight, 0.0);
        float foot = sdCappedCylinder(fp, legRadius * 1.3, 0.04);
        leg = smin(leg, foot, 0.05);
        d = smin(d, leg, 0.15);
    }

    // === TAIL ===
    vec3 tp = q - vec3(-0.9, 0.1, 0.0);
    tp = rotZ(tp, 0.5);           // angled downward
    tp = rotY(tp, tailSwish);     // swish side to side
    float tail = sdRoundCone(tp, 0.06, 0.02, 0.3);
    d = smin(d, tail, 0.1);

    // === SKIN FOLDS (subtle detail) ===
    // Rhinos have characteristic wrinkles/folds at the shoulders and haunches.
    // We approximate with slight subtractive grooves.
    float fold1 = sdEllipsoid(q - vec3(0.3, 0.0, 0.0), vec3(0.02, 0.5, 0.55));
    d = smax(d, -fold1, 0.04);

    float fold2 = sdEllipsoid(q - vec3(-0.35, 0.0, 0.0), vec3(0.02, 0.45, 0.52));
    d = smax(d, -fold2, 0.04);

    return d;
}

// ---------------------------------------------------------------------------
// Normal estimation (for lighting in the shader that uses this)
// ---------------------------------------------------------------------------

vec3 calcRhinoNormal(vec3 p, float dance) {
    const float h = 0.001;
    const vec2 k = vec2(1.0, -1.0);
    return normalize(
        k.xyy * sdRhino(p + k.xyy * h, dance) +
        k.yyx * sdRhino(p + k.yyx * h, dance) +
        k.yxy * sdRhino(p + k.yxy * h, dance) +
        k.xxx * sdRhino(p + k.xxx * h, dance)
    );
}

// ---------------------------------------------------------------------------
// Example scene function (for standalone testing on Shadertoy etc.)
// Uncomment and adapt for your renderer.
// ---------------------------------------------------------------------------
/*
float map(vec3 p) {
    float ground = p.y;
    float rhino = sdRhino(p, fract(iTime * 0.25));
    return min(ground, rhino);
}
*/
