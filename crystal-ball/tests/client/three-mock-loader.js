// three-mock-loader.js — Node.js ESM loader hook that intercepts
// `import * as THREE from 'three'` and returns a lightweight mock.
// Usage: node --loader ./tests/client/three-mock-loader.js --test ...

export function resolve(specifier, context, nextResolve) {
  if (specifier === 'three' || specifier.startsWith('three/')) {
    return {
      shortCircuit: true,
      url: new URL('./three-mock.js', import.meta.url).href,
    };
  }
  return nextResolve(specifier, context);
}
