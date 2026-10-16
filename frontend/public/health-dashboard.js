(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const api = MedicareAPI;
  const endpoint = '/health-dashboard';
  const metrics = { blood_pressure: ['Blood pressure', 'mmHg', '♡'], heart_rate: ['Heart rate', 'bpm', '⌁'], weight: ['Weight', 'kg', '⚖'], blood_sugar: ['Blood sugar', 'mg/dL', '◉'] };
  let data, metric = 'blood_pressure', editorType, busy = false;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const localDay = (value = new Date()) => { const d = new Date(value); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const dayOf = value => String(value || '').slice(0, 10);
  const formatted = value => new Date(value.length === 10 ? value + 'T12:00:00' : value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const empty = (title, description) => `<div class="empty"><strong>${esc(title)}</strong>${esc(description)}</div>`;
  function message(value = '', error = false) { $('message').textContent = value; $('message').classList.toggle('error', error); }
  const request = (path = '', options) => api.request(endpoint + path, options);
  const json = (method, body) => ({ method, body: JSON.stringify(body) });
  function showAuth() { window.dispatchEvent(new Event('health-cleared')); data = undefined; $('dashboard').hidden = true; $('auth').hidden = false; $('identity').textContent = ''; $('signout').hidden = true; }
  async function load() {
    if (!api.session()) { showAuth(); return; }
    if (api.session().user.role !== 'patient') { showAuth(); message('This dashboard is for patient accounts. Sign in with a patient account.', true); return; }
    const loadingToken = api.session().token;
    try {
      const fresh = await request();
      if (api.session()?.token !== loadingToken) return;
      data = fresh;
      $('auth').hidden = true; $('dashboard').hidden = false; $('signout').hidden = false;
      $('identity').textContent = fresh.user.name;
      $('greeting').textContent = `Hello, ${fresh.user.name.split(' ')[0]}.`;
      $('today').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      render(); window.dispatchEvent(new Event('health-loaded'));
    } catch (error) {
      if (api.session()?.token !== loadingToken) return;
      if ([401, 403].includes(error.status) || /token|authorized|suspended|User no longer exists/i.test(error.message)) showAuth();
      message(error.message + ' ', true);
      if (!data && api.session()) {
        const retry = document.createElement('button'); retry.textContent = 'Retry'; retry.className = 'text-button'; retry.onclick = () => { message(); load(); }; $('message').append(retry);
      }
    }
  }
  const readings = () => data.readings.filter(r => r.metric === metric);
  function appointmentTime(a) {
    if(a.startsAt)return new Date(a.startsAt);
    const m = a.time_slot.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (!m) return new Date(a.date + 'T23:59:59');
    let hour = +m[1]; if (m[3]) hour = hour % 12 + (m[3].toUpperCase() === 'PM' ? 12 : 0);
    return new Date(`${a.date}T${String(hour).padStart(2, '0')}:${m[2]}:00`);
  }
  const appointmentItem = a => `<div class="list-item"><div><strong>${esc(a.doctor_name)}</strong><p>${esc(a.specialization)} · ${esc(a.hospital_name)}</p><small>${esc(formatted(a.date))} · ${esc(a.time_slot)} · ${esc(a.appointment_code)}</small></div><span class="badge ${a.status === 'Cancelled' ? 'neutral' : ''}">${esc(a.status)}</span></div>`;
  function render() {
    $('stats').innerHTML = Object.entries(metrics).map(([key, [name, unit, icon]]) => {
      const r = data.readings.filter(r => r.metric === key).at(-1);
      return `<article class="stat"><div class="stat-label"><span class="stat-icon" aria-hidden="true">${icon}</span>${name}</div><div class="stat-value">${r ? esc(Number(r.value)) + (key === 'blood_pressure' ? '/' + esc(Number(r.secondary_value)) : '') : '—'} <small>${unit}</small></div><div class="stat-note">${r ? 'Recorded ' + esc(formatted(r.measured_at)) : 'No readings yet · Log your first'}</div></article>`;
    }).join('');
    const now = Date.now();
    const upcoming = data.appointments.filter(a => ['Confirmed', 'Pending'].includes(a.status) && appointmentTime(a).getTime() >= now).sort((a, b) => appointmentTime(a) - appointmentTime(b));
    const ids = new Set(upcoming.map(a => a.id));
    $('upcoming').innerHTML = upcoming.map(appointmentItem).join('') || empty('Your next visit starts here', 'No upcoming appointments. Book a visit from the doctor directory.');
    $('past').innerHTML = data.appointments.filter(a => !ids.has(a.id)).reverse().map(appointmentItem).join('') || empty('No appointment history yet', 'Previous visits and cancelled appointments will appear here.');
    const meds = data.records.filter(r => r.category === 'medication');
    const taken = id => data.doses.some(d => d.medication_id === id && dayOf(d.taken_date) === localDay());
    const reminders = upcoming.filter(a => appointmentTime(a).getTime() - now <= 48 * 3600000).map(a => `<div class="list-item"><div><strong>Upcoming visit · ${esc(a.doctor_name)}</strong><p>${esc(formatted(a.date))} at ${esc(a.time_slot)}</p></div><span class="badge">Visit</span></div>`);
    for (const m of meds.filter(m => m.schedule_time && !taken(m.id) && dayOf(m.record_date) <= localDay())) reminders.push(`<div class="list-item"><div><strong>${esc(m.title)}</strong><p>Today at ${esc(m.schedule_time)} · ${esc(m.dosage)}</p></div><span class="badge">Medication</span></div>`);
    $('reminders').innerHTML = reminders.join('') || empty('You’re all caught up', 'No visits in the next 48 hours or outstanding scheduled medications today.');
    $('medication-list').innerHTML = meds.map(m => `<div class="list-item"><div><strong>${esc(m.title)}</strong><p>${esc(m.dosage)}${m.schedule_time ? ' · Daily check-in ' + esc(m.schedule_time) : ''}</p><p>${esc(m.details)}</p><small>Started ${esc(formatted(dayOf(m.record_date)))}</small></div><div class="actions"><label class="dose"><input type="checkbox" data-dose="${m.id}" ${taken(m.id) ? 'checked' : ''} ${dayOf(m.record_date) > localDay() ? 'disabled' : ''}>Taken today</label><button class="icon-button danger" data-delete="records/${m.id}" aria-label="Remove ${esc(m.title)}">×</button></div></div>`).join('') || empty('Build your daily routine', 'Add your prescribed medication and a daily reminder time.');
    for (const category of ['history', 'prescription']) $('' + category + '-list').innerHTML = data.records.filter(r => r.category === category).map(r => `<div class="list-item"><div><strong>${esc(r.title)}</strong><small>${esc(formatted(dayOf(r.record_date)))} · Patient-entered</small><p>${esc(r.details)}</p>${r.dosage ? `<p>${esc(r.dosage)}</p>` : ''}</div><button class="icon-button danger" data-delete="records/${r.id}" aria-label="Remove ${esc(r.title)}">×</button></div>`).join('') || empty(category === 'history' ? 'Your story is ready to begin' : 'No prescriptions added', category === 'history' ? 'Add conditions, allergies, procedures, or other relevant history.' : 'Save prescription details or upload the original document.');
    $('document-list').innerHTML = data.documents.map(d => `<div class="list-item"><div><strong>${esc(d.filename)}</strong><small>${esc(formatted(d.created_at))} · ${Math.ceil(d.byte_size / 1024)} KB</small></div><div class="actions"><button class="secondary" data-download="${d.id}">Download</button><button class="icon-button danger" data-delete="documents/${d.id}" aria-label="Remove ${esc(d.filename)}">×</button></div></div>`).join('') || empty('Keep your reports close', 'Upload lab reports, prescriptions, and other medical documents.');
    const summary = data.medicineReminders;
    if($('consultation-history')) $('consultation-history').innerHTML=data.consultationsError?empty('Consultation history unavailable',data.consultationsError):(data.consultations||[]).map(c=>`<div class="list-item"><div><strong>${esc(c.doctor_name)}</strong><p>${esc(c.date)} · ${esc(c.time_slot)} · ${esc(c.status)}</p><small>${c.started_at?'Doctor admitted patient to room':'Not admitted yet'}</small></div><a class="secondary" href="./consultations.html">Open video consultations</a></div>`).join('')||empty('No video consultations yet','Your private consultation rooms and appointment history will appear here.');
    if ($('smart-medicine-summary')) $('smart-medicine-summary').innerHTML = summary?.schedules ? '<p class="muted">' + esc(summary.schedules) + ' schedules ? ' + esc(summary.lowSupply) + ' refill alerts ? 30-day adherence: ' + (summary.adherence.percentage === null ? 'No doses due yet' : esc(summary.adherence.percentage) + '%') + '</p>' + summary.recentDoses.map(d => '<div class="list-item"><div><strong>' + esc(d.name) + '</strong><p>' + esc(d.dosage) + ' ? ' + esc(new Date(d.due_at).toLocaleString()) + '</p></div><span class="badge">' + esc(d.status) + '</span></div>').join('') : empty('Create your medicine routine', 'Add schedules, link prescriptions, and track each dose in Medicine Reminder.');
    $('chart-tabs').innerHTML = Object.entries(metrics).map(([key, [label]]) => `<button data-metric="${key}" aria-pressed="${metric === key}">${label}</button>`).join('');
    chart();
  }
  function chart() {
    const days = $('period').value;
    const cutoff = days === 'all' ? 0 : Date.now() - Number(days) * 86400000;
    const list = readings().filter(r => new Date(r.measured_at).getTime() >= cutoff);
    $('reading-list').innerHTML = [...readings()].reverse().map(r => `<div class="list-item"><div><strong>${esc(Number(r.value))}${metric === 'blood_pressure' ? '/' + esc(Number(r.secondary_value)) : ''} ${metrics[metric][1]}</strong><small>${esc(new Date(r.measured_at).toLocaleString())}</small></div><button class="icon-button danger" data-delete="readings/${r.id}" aria-label="Delete reading">×</button></div>`).join('') || empty('No measurements recorded', 'Use Log a reading to begin.');
    if (!list.length) { $('chart').innerHTML = empty('A clearer picture starts with one reading', 'No ' + metrics[metric][0].toLowerCase() + ' measurements in this period. Log a reading or choose a longer period.'); return; }
    const values = list.flatMap(r => metric === 'blood_pressure' ? [+r.value, +r.secondary_value] : [+r.value]);
    const min = Math.min(...values), max = Math.max(...values), pad = Math.max((max - min) * .2, 2);
    const low = Math.max(0, min - pad), high = max + pad;
    const start = new Date(list[0].measured_at).getTime(), end = new Date(list.at(-1).measured_at).getTime();
    const x = r => end === start ? 450 : 55 + (new Date(r.measured_at).getTime() - start) / (end - start) * 780;
    const y = v => 175 - (v - low) / (high - low) * 145;
    let svg = '';
    for (let i = 0; i < 4; i++) { const v = low + (high - low) * i / 3; svg += `<line x1="55" y1="${y(v)}" x2="835" y2="${y(v)}" stroke="#e8eef6"/><text x="42" y="${y(v) + 4}" text-anchor="end" fill="#7c90a6" font-size="11">${v.toFixed(0)}</text>`; }
    const series = (key, color) => `<polyline fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" points="${list.map(r => `${x(r)},${y(+r[key])}`).join(' ')}"/>` + list.map((r, i) => `<circle class="chart-point" tabindex="0" role="img" aria-label="${esc(formatted(r.measured_at))}: ${esc(r[key])} ${metrics[metric][1]}" data-point="${i}" cx="${x(r)}" cy="${y(+r[key])}" r="5" fill="${color}" stroke="white" stroke-width="2"><title>${esc(new Date(r.measured_at).toLocaleString())}: ${esc(r[key])} ${metrics[metric][1]}</title></circle>`).join('');
    svg += series('value', '#178f9b');
    if (metric === 'blood_pressure') svg += series('secondary_value', '#6383df');
    $('chart').innerHTML = `<div class="chart-tooltip" id="chart-tooltip">${metrics[metric][0]} · ${metrics[metric][1]}${metric === 'blood_pressure' ? ' · Teal: systolic / Blue: diastolic' : ''}</div><svg class="chart-svg" viewBox="0 0 880 210" role="img" aria-label="${metrics[metric][0]} over time">${svg}<text x="55" y="204" fill="#7c90a6" font-size="11">${esc(formatted(list[0].measured_at))}</text><text x="835" y="204" text-anchor="end" fill="#7c90a6" font-size="11">${esc(formatted(list.at(-1).measured_at))}</text></svg>`;
    for (const point of $('chart').querySelectorAll('[data-point]')) { const show = () => { const r = list[point.dataset.point]; $('chart-tooltip').textContent = `${new Date(r.measured_at).toLocaleString()} · ${Number(r.value)}${metric === 'blood_pressure' ? '/' + Number(r.secondary_value) : ''} ${metrics[metric][1]}`; }; point.addEventListener('pointerenter', show); point.addEventListener('focus', show); point.addEventListener('click', show); }
  }
  const field = (label, name, type = 'text', attrs = '') => `<label>${label}<input name="${name}" type="${type}" ${attrs}></label>`;
  function openEditor(type) {
    editorType = type; $('form-error').textContent = '';
    $('editor-title').textContent = { reading: 'Log a health reading', history: 'Add medical history', prescription: 'Add prescription details', medication: 'Add a medication', document: 'Upload a medical document' }[type];
    if (type === 'reading') {
      $('editor-fields').innerHTML = `<label>Measurement<select name="metric">${Object.entries(metrics).map(([k, [name, unit]]) => `<option value="${k}">${name} (${unit})</option>`).join('')}</select></label>` + field('Value / systolic (mmHg)', 'value', 'number', 'required min="0.01" max="99999" step="0.01"') + `<div id="secondary-field">${field('Diastolic (mmHg)', 'secondaryValue', 'number', 'required min="0.01" max="99999" step="0.01"')}</div>` + field('Measured at', 'measuredAt', 'datetime-local', `required value="${localDay()}T${new Date().toTimeString().slice(0, 5)}"`);
      const select = $('editor-form').elements.metric;
      select.onchange = () => { const bp = select.value === 'blood_pressure'; $('secondary-field').hidden = !bp; $('editor-form').elements.secondaryValue.required = bp; $('editor-form').elements.value.parentElement.firstChild.textContent = bp ? 'Value / systolic (mmHg)' : 'Value (' + metrics[select.value][1] + ')'; };
    } else if (type === 'document') $('editor-fields').innerHTML = field('Medical document · PDF, PNG, JPEG · maximum 2 MB', 'file', 'file', 'accept="application/pdf,image/png,image/jpeg" required');
    else $('editor-fields').innerHTML = field(type === 'medication' ? 'Medication name' : 'Title', 'title', 'text', 'required maxlength="160"') + field(type === 'medication' ? 'Start date' : 'Record date', 'recordDate', 'date', `required value="${localDay()}"`) + (type !== 'history' ? field('Prescribed dosage / instructions', 'dosage', 'text', 'maxlength="120"') : '') + (type === 'medication' ? field('Daily reminder time (optional)', 'scheduleTime', 'time') : '') + '<label>Details<textarea name="details" maxlength="5000" placeholder="Add relevant details from your own records"></textarea></label>';
    $('editor').showModal();
  }
  $('close-editor').onclick = () => $('editor').close();
  $('period').onchange = () => data && chart();
  $('editor-form').onsubmit = async e => {
    e.preventDefault(); if (busy) return; busy = true;
    const button = e.currentTarget.querySelector('[type=submit]'); button.disabled = true;
    try {
      const fields = Object.fromEntries(new FormData(e.currentTarget));
      if (editorType === 'document') {
        const file = fields.file;
        if (!file.size || file.size > 2 * 1024 * 1024) throw new Error('Choose a file no larger than 2 MB.');
        const content = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = () => reject(new Error('Could not read this file.')); reader.readAsDataURL(file); });
        await request('/documents', json('POST', { filename: file.name, mimeType: file.type, content }));
      } else if (editorType === 'reading') await request('/readings', json('POST', { ...fields, value: Number(fields.value), secondaryValue: Number(fields.secondaryValue) }));
      else await request('/records', json('POST', { ...fields, category: editorType }));
      $('editor').close(); message('Saved to your private health records.'); await load();
    } catch (error) { $('form-error').textContent = error.message; }
    finally { busy = false; button.disabled = false; }
  };
  document.addEventListener('click', async e => {
    const open = e.target.closest('[data-open]'); if (open) { openEditor(open.dataset.open); return; }
    const tab = e.target.closest('[data-metric]'); if (tab) { metric = tab.dataset.metric; render(); return; }
    const remove = e.target.closest('[data-delete]');
    const download = e.target.closest('[data-download]');
    if (!remove && !download) return;
    if (remove && !confirm('Permanently remove this item from your health records?')) return;
    const button = remove || download; button.disabled = true;
    try {
      if (remove) { await request('/' + remove.dataset.delete, { method: 'DELETE' }); message('Record removed.'); await load(); }
      else {
        const response = await fetch(api.base + endpoint + '/documents/' + download.dataset.download, { headers: { Authorization: `Bearer ${api.session()?.token}` } });
        if (!response.ok) throw new Error('Could not download this document. Please sign in again or retry.');
        const url = URL.createObjectURL(await response.blob()), link = document.createElement('a');
        link.href = url; link.download = data.documents.find(d => String(d.id) === download.dataset.download).filename; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (error) { message(error.message, true); }
    finally { button.disabled = false; }
  });
  document.addEventListener('change', async e => {
    if (!e.target.matches('[data-dose]')) return;
    const input = e.target; input.disabled = true;
    try { await request('/medications/' + input.dataset.dose + '/dose', json('PUT', { date: localDay(), taken: input.checked })); await load(); }
    catch (error) { input.checked = !input.checked; message(error.message, true); }
    finally { input.disabled = false; }
  });
  $('login').onsubmit = async e => { e.preventDefault(); const button = e.currentTarget.querySelector('button'); button.disabled = true; try { await api.authenticate(e.currentTarget, 'login', 'patient'); message(); await load(); } catch (error) { message(error.message, true); } finally { button.disabled = false; } };
  $('signout').onclick = () => { for (const key of ['mc_user', 'mc_token', 'medicare_token']) localStorage.removeItem(key); $('editor').close(); showAuth(); message('You have signed out.'); };
  window.addEventListener('storage', e => { if (['mc_token', 'mc_user', null].includes(e.key)) { $('editor').close(); showAuth(); load(); } });
  window.addEventListener('focus', () => { if (api.session()) load(); else showAuth(); });
  setInterval(() => { if (data && document.visibilityState === 'visible') load(); }, 60000);
  message(api.session() ? 'Loading your health records…' : '');
  load().then(() => { if ($('message').textContent === 'Loading your health records…') message(); });
})();
