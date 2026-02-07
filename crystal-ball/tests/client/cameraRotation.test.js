// cameraRotation.test.js — Unit tests for the camera rotation pure helper functions.
//
// The helpers under test (getOrientationOffset, wrapOrientation, orientationName)
// are pure logic with no THREE.js dependency, so they can be imported directly.
//
// The CameraRotation class uses a camera object but does not import THREE,
// so we can test it with a simple mock camera.
//
//   node --loader ./tests/client/three-mock-loader.js --test tests/client/cameraRotation.test.js
//
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getOrientationOffset,
  wrapOrientation,
  orientationName,
} from '../../public/js/cameraRotation.js';

// ---------------------------------------------------------------------------
// getOrientationOffset
// ---------------------------------------------------------------------------

describe('getOrientationOffset', () => {
  it('returns { x: 10, y: 10, z: 10 } for index 0 (NE)', () => {
    const o = getOrientationOffset(0);
    assert.equal(o.x, 10);
    assert.equal(o.y, 10);
    assert.equal(o.z, 10);
  });

  it('returns { x: 10, y: 10, z: -10 } for index 1 (SE)', () => {
    const o = getOrientationOffset(1);
    assert.equal(o.x, 10);
    assert.equal(o.y, 10);
    assert.equal(o.z, -10);
  });

  it('returns { x: -10, y: 10, z: -10 } for index 2 (SW)', () => {
    const o = getOrientationOffset(2);
    assert.equal(o.x, -10);
    assert.equal(o.y, 10);
    assert.equal(o.z, -10);
  });

  it('returns { x: -10, y: 10, z: 10 } for index 3 (NW)', () => {
    const o = getOrientationOffset(3);
    assert.equal(o.x, -10);
    assert.equal(o.y, 10);
    assert.equal(o.z, 10);
  });

  it('all offsets have y = 10', () => {
    for (let i = 0; i < 4; i++) {
      assert.equal(getOrientationOffset(i).y, 10);
    }
  });

  it('returns a copy (mutating the result does not affect future calls)', () => {
    const a = getOrientationOffset(0);
    a.x = 999;
    const b = getOrientationOffset(0);
    assert.equal(b.x, 10);
  });
});

// ---------------------------------------------------------------------------
// wrapOrientation
// ---------------------------------------------------------------------------

describe('wrapOrientation', () => {
  it('wraps 0 to 0', () => {
    assert.equal(wrapOrientation(0), 0);
  });

  it('wraps 3 to 3', () => {
    assert.equal(wrapOrientation(3), 3);
  });

  it('wraps 4 to 0', () => {
    assert.equal(wrapOrientation(4), 0);
  });

  it('wraps -1 to 3', () => {
    assert.equal(wrapOrientation(-1), 3);
  });

  it('wraps 5 to 1', () => {
    assert.equal(wrapOrientation(5), 1);
  });

  it('wraps -2 to 2', () => {
    assert.equal(wrapOrientation(-2), 2);
  });

  it('wraps 100 to 0', () => {
    assert.equal(wrapOrientation(100), 0);
  });
});

// ---------------------------------------------------------------------------
// orientationName
// ---------------------------------------------------------------------------

describe('orientationName', () => {
  it('returns "NE" for index 0', () => {
    assert.equal(orientationName(0), 'NE');
  });

  it('returns "SE" for index 1', () => {
    assert.equal(orientationName(1), 'SE');
  });

  it('returns "SW" for index 2', () => {
    assert.equal(orientationName(2), 'SW');
  });

  it('returns "NW" for index 3', () => {
    assert.equal(orientationName(3), 'NW');
  });

  it('wraps negative indices: -1 => "NW"', () => {
    assert.equal(orientationName(-1), 'NW');
  });

  it('wraps overflow indices: 4 => "NE"', () => {
    assert.equal(orientationName(4), 'NE');
  });
});
