const windows = new Map();
const duration = 15 * 60 * 1000;
export function loginLimiter(req, res, next) {
  const now = Date.now(), key = req.ip;
  for (const [ip, entry] of windows) if (entry.expires <= now) windows.delete(ip);
  const entry = windows.get(key) || { count: 0, expires: now + duration };
  entry.count++; windows.set(key, entry);
  if (entry.count > 100) { res.set('Retry-After', String(Math.ceil((entry.expires - now) / 1000))); return res.status(429).json({ success: false, message: 'Too many sign-in attempts. Please retry later.' }); }
  next();
}
