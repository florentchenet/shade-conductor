// === shade-conductor shared types ===

export interface ShaderPreset {
  id: string;
  name: string;
  description: string;
  code: string;
  code_webgl2?: string;
  tags: string[];
  params: ParamNames;
  palette?: PaletteConfig;
  audio_bindings?: AudioBinding[];
  created: string;
  modified: string;
}

export interface ParamNames {
  param1?: string;
  param2?: string;
  param3?: string;
  param4?: string;
}

export interface PaletteConfig {
  color1: [number, number, number];
  color2: [number, number, number];
  color3: [number, number, number];
  bg: [number, number, number];
}

export interface AudioBinding {
  source: 'bass' | 'mid' | 'high' | 'energy' | 'peak' | `spectrum_${number}`;
  target: string;
  multiplier: number;
  offset: number;
  smoothing: number;
}

export interface SetlistChapter {
  name: string;
  shader: string;
  start_time: number;
  end_time: number;
  transition_in: 'cut' | 'crossfade' | 'flash';
  transition_duration: number;
  params?: Record<string, number>;
  palette?: PaletteConfig;
  audio_bindings?: AudioBinding[];
  automations?: Automation[];
}

export interface Automation {
  target: string;
  keyframes: Keyframe[];
}

export interface Keyframe {
  time: number;
  value: number;
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

export interface Setlist {
  name: string;
  track_name?: string;
  track_duration?: number;
  chapters: SetlistChapter[];
  created: string;
  modified: string;
}

export interface InputChannelMap {
  channel: number;
  label: string;
  range: [number, number];
  description: string;
}

export interface LayerState {
  layer: number;
  shader: string;
  blend: 'add' | 'multiply' | 'screen' | 'overlay' | 'difference';
  opacity: number;
}

// WebSocket message types
export type WSMessageToClient =
  | { type: 'shader_push'; code: string; id: string }
  | { type: 'shader_crossfade'; code: string; id: string; duration: number }
  | { type: 'param_set'; name: string; value: number }
  | { type: 'palette_set'; colors: { color1: [number, number, number]; color2: [number, number, number]; color3: [number, number, number]; bg: [number, number, number] } }
  | { type: 'audio_config'; config: { smoothing?: number; peakDecay?: number; gainBoost?: number } }
  | { type: 'get_state' }
  | { type: 'chapter_info'; chapter: { name: string; index: number; total: number } }
  | { type: 'ext_set'; channel: number; value: number }
  | { type: 'ext_xy_set'; channel: number; x: number; y: number }
  | { type: 'bpm_set'; bpm: number }
  | { type: 'layer_push'; layer: number; code: string; blend: 'add' | 'multiply' | 'screen' | 'overlay' | 'difference'; opacity: number }
  | { type: 'layer_opacity'; layer: number; opacity: number }
  | { type: 'layer_remove'; layer: number }
  | { type: 'capture_start'; format: 'png' | 'webm' }
  | { type: 'capture_stop' }
  | { type: 'capture_screenshot' }
  | { type: 'automation'; automations: Automation[] }
  | { type: 'shader_validate'; code: string; id: string }
  | { type: 'audio_bind'; binding: AudioBinding }
  | { type: 'audio_unbind'; target: string }
  | { type: 'perform_blackout' }
  | { type: 'perform_flash'; color?: string; duration?: number };

export type WSMessageFromClient =
  | { type: 'state'; data: RuntimeState }
  | { type: 'shader_error'; error: string; shaderId: string }
  | { type: 'audio_levels'; bass: number; mid: number; high: number; energy: number; peak: number; spectrum?: number[] }
  | { type: 'capture_complete'; filename: string; size: number }
  | { type: 'shader_validated'; id: string; success: boolean; error?: string }
  | { type: 'chapter_jump'; chapter: number }
  | { type: 'screenshot_taken'; timestamp: number }
  | { type: 'ready' };

export interface RuntimeState {
  currentShader: string;
  fps: number;
  quality: number;
  audioActive: boolean;
  audioMode: 'silent' | 'mic' | 'file';
  params: Record<string, number>;
  ext: number[];
  ext_xy: Array<{ x: number; y: number }>;
  bpm: number;
  beat: number;
  bar: number;
  layers: LayerState[];
  tier: 'A' | 'B';
}

// Standard uniform declarations for shader wrapping
export const UNIFORM_DECLARATIONS_WEBGL1 = `
precision highp float;

// Time & Space
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_quality;
uniform int u_frame;

// Audio
uniform float u_bass;
uniform float u_mid;
uniform float u_high;
uniform float u_energy;
uniform float u_peak;
uniform float u_spectrum[16];

// Color Palette
uniform vec3 u_color1;
uniform vec3 u_color2;
uniform vec3 u_color3;
uniform vec3 u_bg;

// Tweakable Params
uniform float u_param1;
uniform float u_param2;
uniform float u_param3;
uniform float u_param4;
uniform float u_intensity;
uniform float u_speed;

// Transition
uniform float u_transition;

// External Input Channels
uniform float u_ext[16];
uniform vec2 u_ext_xy[4];
uniform float u_bpm;
uniform float u_beat;
uniform float u_bar;
`;

export const UNIFORM_DECLARATIONS_WEBGL2 = `#version 300 es
precision highp float;

// Time & Space
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_quality;
uniform int u_frame;

// Audio
uniform float u_bass;
uniform float u_mid;
uniform float u_high;
uniform float u_energy;
uniform float u_peak;
uniform float u_spectrum[16];
uniform sampler2D u_fft;

// Color Palette
uniform vec3 u_color1;
uniform vec3 u_color2;
uniform vec3 u_color3;
uniform vec3 u_bg;

// Tweakable Params
uniform float u_param1;
uniform float u_param2;
uniform float u_param3;
uniform float u_param4;
uniform float u_intensity;
uniform float u_speed;

// Transition
uniform float u_transition;

// External Input Channels
uniform float u_ext[16];
uniform vec2 u_ext_xy[4];
uniform float u_bpm;
uniform float u_beat;
uniform float u_bar;

// Textures
uniform sampler2D u_prevFrame;
uniform sampler2D u_noise;

out vec4 fragColor;
`;
