// three-mock.js — Minimal THREE mock for testing modules that import 'three'.
// Stubs only the types actually used by tested modules.

class Color {
  constructor(hex) {
    if (typeof hex === 'string') {
      const h = hex.replace('#', '');
      this.r = parseInt(h.substring(0, 2), 16) / 255;
      this.g = parseInt(h.substring(2, 4), 16) / 255;
      this.b = parseInt(h.substring(4, 6), 16) / 255;
    } else if (typeof hex === 'number') {
      this.r = ((hex >> 16) & 0xFF) / 255;
      this.g = ((hex >> 8) & 0xFF) / 255;
      this.b = (hex & 0xFF) / 255;
    } else {
      this.r = 0; this.g = 0; this.b = 0;
    }
  }
  copy(c) { this.r = c.r; this.g = c.g; this.b = c.b; return this; }
  set(hex) { Object.assign(this, new Color(hex)); return this; }
  getHex() { return ((this.r * 255) << 16) | ((this.g * 255) << 8) | (this.b * 255); }
  lerpColors(a, b, t) {
    this.r = a.r + (b.r - a.r) * t;
    this.g = a.g + (b.g - a.g) * t;
    this.b = a.b + (b.b - a.b) * t;
    return this;
  }
}

class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
}

class Euler {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
}

class ScaleVector extends Vector3 {
  constructor() { super(1, 1, 1); }
  setScalar(s) { this.x = s; this.y = s; this.z = s; return this; }
  setY(y) { this.y = y; return this; }
}

class Object3D {
  constructor() {
    this.children = [];
    this.position = new Vector3();
    this.rotation = new Euler();
    this.scale = new ScaleVector();
    this.userData = {};
    this.name = '';
    this.visible = true;
    this.parent = null;
    this.uuid = Math.random().toString(36).slice(2);
  }
  add(child) { this.children.push(child); child.parent = this; }
  remove(child) {
    const idx = this.children.indexOf(child);
    if (idx >= 0) this.children.splice(idx, 1);
    child.parent = null;
  }
  getObjectByName(name) {
    if (this.name === name) return this;
    for (const c of this.children) {
      const found = c.getObjectByName ? c.getObjectByName(name) : null;
      if (found) return found;
    }
    return null;
  }
  traverse(cb) {
    cb(this);
    for (const c of this.children) {
      if (c.traverse) c.traverse(cb);
      else cb(c);
    }
  }
}

class Group extends Object3D {
  constructor() { super(); this.isGroup = true; }
}

class Scene extends Object3D {}

class BufferGeometry {
  constructor() { this.disposed = false; }
  dispose() { this.disposed = true; }
  clone() { return new BufferGeometry(); }
  applyMatrix4() {}
}

class BoxGeometry extends BufferGeometry {}
class SphereGeometry extends BufferGeometry {}
class CylinderGeometry extends BufferGeometry {}
class ConeGeometry extends BufferGeometry {}
class PlaneGeometry extends BufferGeometry {
  constructor() {
    super();
    this.attributes = { position: { count: 0, getX: () => 0, getY: () => 0, getZ: () => 0, setZ: () => {} } };
  }
}
class TorusGeometry extends BufferGeometry {}

class Material {
  constructor(opts = {}) {
    this.color = opts.color !== undefined ? new Color(opts.color) : new Color(0);
    this.emissive = opts.emissive !== undefined ? new Color(opts.emissive) : undefined;
    this.emissiveIntensity = opts.emissiveIntensity || 0;
    this.transparent = opts.transparent || false;
    this.opacity = opts.opacity !== undefined ? opts.opacity : 1.0;
    this.side = opts.side || 0;
    this.disposed = false;
  }
  dispose() { this.disposed = true; }
}

class MeshLambertMaterial extends Material {}
class ShaderMaterial extends Material {
  constructor(opts = {}) {
    super(opts);
    this.uniforms = opts.uniforms || {};
    this.vertexShader = opts.vertexShader || '';
    this.fragmentShader = opts.fragmentShader || '';
  }
}

class Mesh extends Object3D {
  constructor(geometry, material) {
    super();
    this.geometry = geometry || new BufferGeometry();
    this.material = material || new Material();
    this.isMesh = true;
    this.castShadow = false;
    this.receiveShadow = false;
  }
}

const DoubleSide = 2;

// CSS2DObject mock
class CSS2DObject extends Object3D {
  constructor(element) {
    super();
    this.element = element;
    this.isCSS2DObject = true;
  }
}

export {
  Color, Vector3, Euler, Object3D, Group, Scene,
  BufferGeometry, BoxGeometry, SphereGeometry, CylinderGeometry,
  ConeGeometry, PlaneGeometry, TorusGeometry,
  Material, MeshLambertMaterial, ShaderMaterial, Mesh,
  DoubleSide, CSS2DObject,
};
export default {
  Color, Vector3, Euler, Object3D, Group, Scene,
  BufferGeometry, BoxGeometry, SphereGeometry, CylinderGeometry,
  ConeGeometry, PlaneGeometry, TorusGeometry,
  Material, MeshLambertMaterial, ShaderMaterial, Mesh,
  DoubleSide, CSS2DObject,
};
