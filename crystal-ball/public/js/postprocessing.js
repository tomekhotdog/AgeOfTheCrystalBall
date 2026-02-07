/**
 * postprocessing.js
 *
 * Post-processing pipeline for the Crystal Ball scene.
 * Built for Three.js r160 (ES module imports via import maps).
 *
 * Provides:
 *   - HDR bloom  (UnrealBloomPass)
 *   - Vignette   (custom ShaderPass)
 *
 * Usage:
 *   import { setupPostProcessing, onResize } from './postprocessing.js';
 *
 *   const { composer, bloomPass } = setupPostProcessing(renderer, scene, camera);
 *
 *   // Render loop — replaces renderer.render(scene, camera)
 *   composer.render();
 *
 *   // On window resize
 *   onResize(composer, window.innerWidth, window.innerHeight);
 *
 *   // Dynamically adjust bloom (e.g. increase at night)
 *   bloomPass.strength = 0.8;
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// ---------------------------------------------------------------------------
// Custom vignette shader
// ---------------------------------------------------------------------------

const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    offset: { value: 0.95 },
    darkness: { value: 1.2 },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float offset;
    uniform float darkness;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - vec2(0.5)) * vec2(offset);
      float vig = clamp(1.0 - dot(uv, uv), 0.0, 1.0);
      texel.rgb *= mix(1.0, vig, darkness);
      gl_FragColor = texel;
    }
  `,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the post-processing pipeline and return handles the caller needs.
 *
 * @param {THREE.WebGLRenderer} renderer - The WebGL renderer.
 * @param {THREE.Scene}         scene    - The scene to render.
 * @param {THREE.Camera}        camera   - The active camera.
 * @returns {{ composer: EffectComposer, bloomPass: UnrealBloomPass }}
 */
export function setupPostProcessing(renderer, scene, camera) {
  // --- Effect composer (manages the pass chain) --------------------------
  const composer = new EffectComposer(renderer);

  // --- Pass 1: standard scene render -------------------------------------
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // --- Pass 2: HDR bloom -------------------------------------------------
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.5,  // strength  — moderate glow; caller can raise for night scenes
    0.4,  // radius    — spread of the bloom kernel
    0.85  // threshold — only pixels brighter than this value bloom
  );
  composer.addPass(bloomPass);

  // --- Pass 3: vignette --------------------------------------------------
  const vignettePass = new ShaderPass(VignetteShader);
  composer.addPass(vignettePass);

  return { composer, bloomPass };
}

/**
 * Resize the post-processing pipeline to match the new viewport.
 *
 * Call this inside your window resize handler, right after updating the
 * renderer size and camera aspect ratio.
 *
 * @param {EffectComposer} composer - The effect composer to resize.
 * @param {number}         width    - New viewport width in pixels.
 * @param {number}         height   - New viewport height in pixels.
 */
export function onResize(composer, width, height) {
  composer.setSize(width, height);
}
