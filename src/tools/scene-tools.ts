// === 3D Scene Composition MCP Tools ===
// Generates GLSL code from high-level scene descriptions using SDF primitives

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// ---------------------------------------------------------------------------
// GLSL template fragments
// ---------------------------------------------------------------------------

const SDF_PRIMITIVES: Record<string, string> = {
  sphere: `float sdSphere(vec3 p, float r) { return length(p) - r; }`,
  box: `float sdBox(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }`,
  torus: `float sdTorus(vec3 p, vec2 t) { vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }`,
  cylinder: `float sdCylinder(vec3 p, float h, float r) { vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h); return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)); }`,
  plane: `float sdPlane(vec3 p, vec3 n, float h) { return dot(p, n) + h; }`,
  octahedron: `float sdOctahedron(vec3 p, float s) { p = abs(p); float m = p.x + p.y + p.z - s; vec3 q; if (3.0*p.x < m) q = p.xyz; else if (3.0*p.y < m) q = p.yzx; else if (3.0*p.z < m) q = p.zxy; else return m*0.57735027; float k = clamp(0.5*(q.z - q.y + s), 0.0, s); return length(vec3(q.x, q.y - s + k, q.z - k)); }`,
};

const STYLE_TEMPLATES: Record<string, { lighting: string; postfx: string }> = {
  minimal: {
    lighting: `
vec3 calcLighting(vec3 p, vec3 n, vec3 rd) {
  vec3 lig = normalize(vec3(0.6, 0.7, -0.5));
  float dif = clamp(dot(n, lig), 0.0, 1.0);
  float amb = 0.5 + 0.5 * n.y;
  return u_color1 * dif + u_bg * amb * 0.3;
}`,
    postfx: `col = pow(col, vec3(0.4545));`,
  },
  neon: {
    lighting: `
vec3 calcLighting(vec3 p, vec3 n, vec3 rd) {
  float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
  float dif = clamp(dot(n, normalize(vec3(1,1,-1))), 0.0, 1.0);
  return mix(u_color1, u_color2, rim) * (dif * 0.8 + 0.2) + u_color3 * rim * 2.0;
}`,
    postfx: `col += col * col * 0.5; col = pow(col, vec3(0.4545));`,
  },
  organic: {
    lighting: `
vec3 calcLighting(vec3 p, vec3 n, vec3 rd) {
  vec3 lig = normalize(vec3(sin(u_time*0.3), 0.8, cos(u_time*0.2)));
  float dif = clamp(dot(n, lig), 0.0, 1.0);
  float sss = clamp(dot(n, -lig) + 0.5, 0.0, 1.0);
  float ao = 0.5 + 0.5 * n.y;
  return u_color1 * dif + u_color2 * sss * 0.5 + u_bg * ao * 0.2;
}`,
    postfx: `col *= 1.0 - 0.3*length(uv); col = pow(col, vec3(0.4545));`,
  },
  dark: {
    lighting: `
vec3 calcLighting(vec3 p, vec3 n, vec3 rd) {
  vec3 lig = normalize(vec3(0.3, 0.9, -0.4));
  float dif = pow(clamp(dot(n, lig), 0.0, 1.0), 2.0);
  float spec = pow(max(dot(reflect(-lig, n), -rd), 0.0), 32.0);
  return u_color1 * dif * 0.6 + vec3(spec) * 0.4;
}`,
    postfx: `col *= 0.7; col = pow(col, vec3(0.4545));`,
  },
};

// ---------------------------------------------------------------------------
// Scene building state
// ---------------------------------------------------------------------------

interface SceneElement {
  primitive: string;
  position: [number, number, number];
  scale: number;
  params: number[];
  operation: 'union' | 'subtract' | 'intersect' | 'smooth_union';
  smoothK: number;
  animate: boolean;
}

interface SceneState {
  style: string;
  elements: SceneElement[];
  cameraDistance: number;
  cameraHeight: number;
  cameraOrbit: boolean;
  orbitSpeed: number;
  fov: number;
  lightDirection: [number, number, number];
  customLighting: string | null;
  customPostfx: string | null;
}

// Current scene being composed
let currentScene: SceneState = {
  style: 'minimal',
  elements: [],
  cameraDistance: 5.0,
  cameraHeight: 1.5,
  cameraOrbit: true,
  orbitSpeed: 0.3,
  fov: 1.0,
  lightDirection: [0.6, 0.7, -0.5],
  customLighting: null,
  customPostfx: null,
};

// ---------------------------------------------------------------------------
// GLSL code generation
// ---------------------------------------------------------------------------

function generateSceneGLSL(scene: SceneState): string {
  const style = STYLE_TEMPLATES[scene.style] ?? STYLE_TEMPLATES.minimal;
  const usedPrimitives = new Set(scene.elements.map((e) => e.primitive));

  // Collect SDF functions
  const sdfFunctions = Array.from(usedPrimitives)
    .map((p) => SDF_PRIMITIVES[p] ?? '')
    .filter(Boolean)
    .join('\n');

  // Smooth min for smooth unions
  const smoothMin = scene.elements.some((e) => e.operation === 'smooth_union')
    ? `float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5*(b-a)/k, 0.0, 1.0); return mix(b, a, h) - k*h*(1.0-h); }`
    : '';

  // Build the scene SDF
  let sdfBody = '  float d = 1e10;\n';
  for (let i = 0; i < scene.elements.length; i++) {
    const el = scene.elements[i];
    const pos = el.animate
      ? `vec3(${el.position[0]} + sin(u_time*0.5)*0.5, ${el.position[1]} + sin(u_time*0.7)*0.3, ${el.position[2]})`
      : `vec3(${el.position[0]}, ${el.position[1]}, ${el.position[2]})`;

    let sdfCall: string;
    switch (el.primitive) {
      case 'sphere':
        sdfCall = `sdSphere(p - ${pos}, ${el.scale.toFixed(3)})`;
        break;
      case 'box':
        sdfCall = `sdBox(p - ${pos}, vec3(${el.scale.toFixed(3)}))`;
        break;
      case 'torus':
        sdfCall = `sdTorus(p - ${pos}, vec2(${el.scale.toFixed(3)}, ${(el.scale * 0.3).toFixed(3)}))`;
        break;
      case 'cylinder':
        sdfCall = `sdCylinder(p - ${pos}, ${el.scale.toFixed(3)}, ${(el.scale * 0.5).toFixed(3)})`;
        break;
      case 'plane':
        sdfCall = `sdPlane(p, vec3(0,1,0), ${el.position[1].toFixed(3)})`;
        break;
      case 'octahedron':
        sdfCall = `sdOctahedron(p - ${pos}, ${el.scale.toFixed(3)})`;
        break;
      default:
        sdfCall = `sdSphere(p - ${pos}, ${el.scale.toFixed(3)})`;
    }

    const varName = `d${i}`;
    sdfBody += `  float ${varName} = ${sdfCall};\n`;

    switch (el.operation) {
      case 'union':
        sdfBody += `  d = min(d, ${varName});\n`;
        break;
      case 'subtract':
        sdfBody += `  d = max(d, -${varName});\n`;
        break;
      case 'intersect':
        sdfBody += i === 0 ? `  d = ${varName};\n` : `  d = max(d, ${varName});\n`;
        break;
      case 'smooth_union':
        sdfBody += `  d = smin(d, ${varName}, ${el.smoothK.toFixed(3)});\n`;
        break;
    }
  }
  sdfBody += '  return d;';

  // Camera
  const cameraCode = scene.cameraOrbit
    ? `
  float angle = u_time * ${scene.orbitSpeed.toFixed(2)};
  vec3 ro = vec3(cos(angle) * ${scene.cameraDistance.toFixed(1)}, ${scene.cameraHeight.toFixed(1)}, sin(angle) * ${scene.cameraDistance.toFixed(1)});`
    : `
  vec3 ro = vec3(0.0, ${scene.cameraHeight.toFixed(1)}, ${scene.cameraDistance.toFixed(1)});`;

  const lighting = scene.customLighting ?? style.lighting;
  const postfx = scene.customPostfx ?? style.postfx;

  return `// Generated by shade-conductor scene composer
${sdfFunctions}
${smoothMin}

float map(vec3 p) {
${sdfBody}
}

vec3 calcNormal(vec3 p) {
  vec2 e = vec2(0.001, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)
  ));
}
${lighting}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
${cameraCode}
  vec3 ta = vec3(0.0, 0.0, 0.0);
  vec3 ww = normalize(ta - ro);
  vec3 uu = normalize(cross(ww, vec3(0,1,0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(uv.x * uu + uv.y * vv + ${scene.fov.toFixed(1)} * ww);

  vec3 col = u_bg;
  float t = 0.0;
  for (int i = 0; i < 128; i++) {
    vec3 p = ro + rd * t;
    float d = map(p);
    if (d < 0.001) {
      vec3 n = calcNormal(p);
      col = calcLighting(p, n, rd);
      break;
    }
    t += d;
    if (t > 50.0) break;
  }

  ${postfx}
  gl_FragColor = vec4(col, 1.0);
}
`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mcpText(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function mcpError(message: string) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
    isError: true as const,
  };
}

// ---------------------------------------------------------------------------
// Register tools
// ---------------------------------------------------------------------------

export function registerSceneTools(server: McpServer): void {
  // --- scene_create ---
  server.tool(
    'scene_create',
    'Create a new 3D scene from a style template. Resets the scene and generates initial GLSL code. Available styles: minimal, neon, organic, dark.',
    {
      style: z.enum(['minimal', 'neon', 'organic', 'dark']).default('minimal')
        .describe('Visual style template'),
      camera_distance: z.number().min(1).max(50).default(5).describe('Camera distance from origin'),
      camera_height: z.number().default(1.5).describe('Camera Y position'),
      camera_orbit: z.boolean().default(true).describe('Enable camera orbit animation'),
      orbit_speed: z.number().default(0.3).describe('Orbit speed multiplier'),
      fov: z.number().min(0.1).max(5).default(1.0).describe('Field of view (lower = more telephoto)'),
    },
    async (args) => {
      currentScene = {
        style: args.style,
        elements: [],
        cameraDistance: args.camera_distance,
        cameraHeight: args.camera_height,
        cameraOrbit: args.camera_orbit,
        orbitSpeed: args.orbit_speed,
        fov: args.fov,
        lightDirection: [0.6, 0.7, -0.5],
        customLighting: null,
        customPostfx: null,
      };

      // Add a default sphere so the scene isn't empty
      currentScene.elements.push({
        primitive: 'sphere',
        position: [0, 0, 0],
        scale: 1.0,
        params: [],
        operation: 'union',
        smoothK: 0.5,
        animate: false,
      });

      const code = generateSceneGLSL(currentScene);

      return mcpText({
        status: 'scene_created',
        style: args.style,
        elements: currentScene.elements.length,
        code,
      });
    }
  );

  // --- scene_add_element ---
  server.tool(
    'scene_add_element',
    'Add an SDF primitive to the current scene. Available primitives: sphere, box, torus, cylinder, plane, octahedron.',
    {
      primitive: z.enum(['sphere', 'box', 'torus', 'cylinder', 'plane', 'octahedron'])
        .describe('SDF primitive type'),
      position: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0])
        .describe('Position [x, y, z]'),
      scale: z.number().min(0.01).max(100).default(1.0)
        .describe('Scale factor'),
      operation: z.enum(['union', 'subtract', 'intersect', 'smooth_union']).default('union')
        .describe('CSG operation to combine with existing scene'),
      smoothK: z.number().min(0).max(5).default(0.5)
        .describe('Smooth union blend factor (only for smooth_union)'),
      animate: z.boolean().default(false)
        .describe('Add subtle position animation'),
    },
    async (args) => {
      currentScene.elements.push({
        primitive: args.primitive,
        position: args.position,
        scale: args.scale,
        params: [],
        operation: args.operation,
        smoothK: args.smoothK,
        animate: args.animate,
      });

      const code = generateSceneGLSL(currentScene);

      return mcpText({
        status: 'element_added',
        primitive: args.primitive,
        totalElements: currentScene.elements.length,
        code,
      });
    }
  );

  // --- scene_set_camera ---
  server.tool(
    'scene_set_camera',
    'Modify camera settings for the current scene.',
    {
      distance: z.number().min(1).max(50).optional().describe('Camera distance'),
      height: z.number().optional().describe('Camera height'),
      orbit: z.boolean().optional().describe('Enable/disable orbit'),
      orbit_speed: z.number().optional().describe('Orbit speed'),
      fov: z.number().min(0.1).max(5).optional().describe('Field of view'),
    },
    async (args) => {
      if (args.distance !== undefined) currentScene.cameraDistance = args.distance;
      if (args.height !== undefined) currentScene.cameraHeight = args.height;
      if (args.orbit !== undefined) currentScene.cameraOrbit = args.orbit;
      if (args.orbit_speed !== undefined) currentScene.orbitSpeed = args.orbit_speed;
      if (args.fov !== undefined) currentScene.fov = args.fov;

      const code = generateSceneGLSL(currentScene);

      return mcpText({
        status: 'camera_updated',
        camera: {
          distance: currentScene.cameraDistance,
          height: currentScene.cameraHeight,
          orbit: currentScene.cameraOrbit,
          orbitSpeed: currentScene.orbitSpeed,
          fov: currentScene.fov,
        },
        code,
      });
    }
  );

  // --- scene_set_lighting ---
  server.tool(
    'scene_set_lighting',
    'Set custom lighting GLSL code for the current scene. The function signature must be: vec3 calcLighting(vec3 p, vec3 n, vec3 rd)',
    {
      code: z.string().optional()
        .describe('Custom lighting function GLSL. Set to empty string to reset to style default.'),
      light_direction: z.tuple([z.number(), z.number(), z.number()]).optional()
        .describe('Light direction vector [x, y, z]'),
    },
    async (args) => {
      if (args.code !== undefined) {
        currentScene.customLighting = args.code || null;
      }
      if (args.light_direction) {
        currentScene.lightDirection = args.light_direction;
      }

      const code = generateSceneGLSL(currentScene);

      return mcpText({
        status: 'lighting_updated',
        hasCustomLighting: currentScene.customLighting !== null,
        code,
      });
    }
  );

  // --- scene_set_postfx ---
  server.tool(
    'scene_set_postfx',
    'Add post-processing effects to the scene. Provide GLSL code that operates on the "col" vec3 variable after lighting.',
    {
      code: z.string()
        .describe('Post-processing GLSL code. Available variables: col (vec3), uv (vec2). Example: "col = pow(col, vec3(0.4545));"'),
    },
    async (args) => {
      currentScene.customPostfx = args.code || null;

      const code = generateSceneGLSL(currentScene);

      return mcpText({
        status: 'postfx_updated',
        code,
      });
    }
  );
}
