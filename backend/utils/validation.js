export const badRequest = message => Object.assign(new Error(message), { status: 400 });
export function string(value, field, max = 255, required = true) {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw badRequest(`Enter a valid ${field} (maximum ${max} characters).`);
  return value.trim();
}
export function id(value, field = 'ID') {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw badRequest(`Invalid ${field}.`);
  return Number(value);
}
export function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw badRequest('Enter a valid date.');
  return value;
}
export function slot(value) {
  const match = typeof value === 'string' && value.trim().match(/^(0?[1-9]|1[0-2]):([0-5]\d)\s*(AM|PM)$/i);
  if (!match) throw badRequest('Use a time such as 09:00 AM.');
  return `${match[1].padStart(2, '0')}:${match[2]} ${match[3].toUpperCase()}`;
}
export function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: process.env.APP_TIMEZONE || 'Asia/Kathmandu', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
export function fail(res, error) {
  console.error(error.code || error.message);
  const conflict = error.code === 'ER_DUP_ENTRY';
  return res.status(error.status || (conflict ? 409 : 500)).json({ success: false, message: error.status ? error.message : conflict ? 'This record already exists.' : 'The database request could not be completed. Please retry.' });
}
