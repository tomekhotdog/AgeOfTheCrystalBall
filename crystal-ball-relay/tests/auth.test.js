// tests/auth.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tokenAuth } from '../server/auth.js';

// Minimal req/res/next mocks
function mockReq(headers = {}) {
  return { headers };
}

function mockRes() {
  const res = {
    _status: null,
    _body: null,
    status(code) { res._status = code; return res; },
    json(body) { res._body = body; },
  };
  return res;
}

describe('tokenAuth', () => {
  it('should skip auth when no token is configured', (t, done) => {
    const middleware = tokenAuth(null);
    const req = mockReq();
    const res = mockRes();
    middleware(req, res, () => {
      // next() was called -- auth passed
      done();
    });
  });

  it('should reject when Authorization header is missing', () => {
    const middleware = tokenAuth('secret');
    const req = mockReq();
    const res = mockRes();
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res._status, 401);
  });

  it('should reject when token is wrong', () => {
    const middleware = tokenAuth('secret');
    const req = mockReq({ authorization: 'Bearer wrong' });
    const res = mockRes();
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res._status, 403);
  });

  it('should pass when token is correct', (t, done) => {
    const middleware = tokenAuth('secret');
    const req = mockReq({ authorization: 'Bearer secret' });
    const res = mockRes();
    middleware(req, res, () => {
      done();
    });
  });
});
