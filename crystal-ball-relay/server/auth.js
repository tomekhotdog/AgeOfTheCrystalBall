// server/auth.js
// Bearer token authentication middleware factory.

/**
 * Create an Express middleware that validates Bearer tokens.
 * If no expectedToken is provided, auth is skipped (open relay).
 * @param {string|null} expectedToken
 * @returns {Function} Express middleware
 */
export function tokenAuth(expectedToken) {
  return (req, res, next) => {
    if (!expectedToken) {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Missing Authorization header' });
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({ error: 'Invalid Authorization format' });
    }

    if (parts[1] !== expectedToken) {
      return res.status(403).json({ error: 'Invalid token' });
    }

    next();
  };
}
