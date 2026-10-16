const formatters = new Map();
export const utcSQL = value => new Date(value).toISOString().slice(0, 19).replace('T', ' ');
export const utcDate = value => new Date(String(value).replace(' ', 'T') + 'Z');
export function localParts(value, timezone) {
  if (!formatters.has(timezone)) formatters.set(timezone, new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }));
  const parts = Object.fromEntries(formatters.get(timezone).formatToParts(new Date(value)).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}
export function addDays(day, days) { return new Date(Date.parse(day + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10); }
export function zonedUTC(day, time, timezone) {
  const desired = Date.parse(`${day}T${time}:00Z`);
  let guess = desired;
  for (let i = 0; i < 4; i++) {
    const parts = localParts(guess, timezone);
    const delta = desired - Date.parse(`${parts.date}T${parts.time}:00Z`);
    if (delta === 0) return new Date(guess);
    guess += delta;
  }
  // A nonexistent local clock time during a DST jump has no occurrence.
  return null;
}
export const planSelect = `SELECT id, patient_id, prescription_id, name, dosage, instructions, timings, timezone,
  DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date, DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date,
  stock, units_per_dose, refill_at, active, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at FROM medicine_plans`;
export function normalizePlan(row) { return { ...row, timings: typeof row.timings === 'string' ? JSON.parse(row.timings) : row.timings, stock: Number(row.stock), units_per_dose: Number(row.units_per_dose), refill_at: Number(row.refill_at), active: !!row.active }; }
export async function materialize(connection, rawPlan, fromDay, throughDay) {
  const plan = normalizePlan(rawPlan);
  if (!plan.active) return;
  let day = fromDay > plan.start_date ? fromDay : plan.start_date;
  const end = throughDay < plan.end_date ? throughDay : plan.end_date;
  if ((Date.parse(end) - Date.parse(day)) / 86400000 > 93) throw new Error('Calendar window is too large');
  for (; day <= end; day = addDays(day, 1)) for (const time of plan.timings) {
    const due = zonedUTC(day, time, plan.timezone);
    if (!due || due < utcDate(plan.created_at)) continue;
    await connection.query(`INSERT INTO medicine_events (patient_id, plan_id, due_at, local_date, local_time, name, dosage, units)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE
      name = IF(status = 'Cancelled' AND due_at > UTC_TIMESTAMP(), VALUES(name), name),
      dosage = IF(status = 'Cancelled' AND due_at > UTC_TIMESTAMP(), VALUES(dosage), dosage),
      units = IF(status = 'Cancelled' AND due_at > UTC_TIMESTAMP(), VALUES(units), units),
      due_at = IF(status = 'Cancelled' AND due_at > UTC_TIMESTAMP(), VALUES(due_at), due_at),
      status = IF(status = 'Cancelled' AND due_at > UTC_TIMESTAMP(), 'Pending', status)`,
    [plan.patient_id, plan.id, utcSQL(due), day, time, plan.name, plan.dosage, plan.units_per_dose]);
  }
}
