import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import { jwtSecret } from '../config/security.js';

// Verify JWT token from headers
export const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    /^Bearer\s+\S+$/.test(req.headers.authorization)
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, jwtSecret(), { algorithms: ['HS256'] });
      
      const [rows] = await pool.query('SELECT id, name, email, phone, role, status,age,gender FROM users WHERE id = ?', [decoded.id]);
      
      if (rows.length === 0) {
        return res.status(401).json({ success: false, message: 'User no longer exists' });
      }

      req.user = rows[0];

      if (req.user.status === 'Suspended') {
        return res.status(403).json({ success: false, message: 'Your account is suspended.' });
      }

      next();
    } catch (error) {
      if (['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(error.name)) return res.status(401).json({ success: false, message: 'Not authorized, invalid or expired token' });
      return res.status(503).json({ success: false, message: 'Authentication service unavailable. Check the database connection.' });
    }
  } else {
    return res.status(401).json({ success: false, message: 'Not authorized, no token provided' });
  }
};

// Grant access to specific roles
export const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Role (${req.user?.role || 'Guest'}) is not permitted to perform this action.`,
      });
    }
    next();
  };
};
