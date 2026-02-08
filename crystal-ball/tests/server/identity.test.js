// tests/server/identity.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { colorFromName, hslToHex } from '../../server/relay/identity.js';

describe('identity', () => {
  describe('colorFromName', () => {
    it('should return a hex color string', () => {
      const color = colorFromName('Alice');
      assert.match(color, /^#[0-9a-f]{6}$/);
    });

    it('should return same color for same name', () => {
      assert.equal(colorFromName('Bob'), colorFromName('Bob'));
    });

    it('should return different colors for different names', () => {
      assert.notEqual(colorFromName('Alice'), colorFromName('Bob'));
    });
  });

  describe('hslToHex', () => {
    it('should convert black', () => {
      assert.equal(hslToHex(0, 0, 0), '#000000');
    });

    it('should convert white', () => {
      assert.equal(hslToHex(0, 0, 100), '#ffffff');
    });

    it('should return valid hex for arbitrary input', () => {
      const result = hslToHex(120, 50, 50);
      assert.match(result, /^#[0-9a-f]{6}$/);
    });
  });
});
