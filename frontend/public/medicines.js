(() => {
  'use strict';
  const $ = id => document.getElementById(id), api = MedicareAPI, endpoint = '/medicine-reminders';
  const timezone = 'Asia/Kolkata';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dayNow = () => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const addDays = (day, amount) => new Date(Date.parse(day + 'T12:00:00Z') + amount * 86400000).toISOString().slice(0, 10);
  const dateLabel = day => new Date(day + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const empty = (title, description) => `<div class="empty"><strong>${esc(title)}</strong>${esc(description)}</div>`;
  const json = (method, body) => ({ method, body: JSON.stringify(body) });
  const request = (path = '', options) => api.request(endpoint + path, options);
  const swURL = new URL('./medicine-sw.js', location.href).href;
  let state, editId = null, refillId = null, saving = false, currentOwner = null;
  // URL fragments stay in the browser; never accept an account ID or auto-save from a link.
  let requestedDraft = null, draftOpened = false;
  try {
    const encoded = new URLSearchParams(location.hash.slice(1)).get('reminder');
    if (encoded && encoded.length <= 3000) {
      const draft = JSON.parse(encoded);
      if (typeof draft.name !== 'string' || !draft.name.trim() || draft.name.length > 160 ||
          typeof draft.dosage !== 'string' || !draft.dosage.trim() || draft.dosage.length > 120 ||
          !Array.isArray(draft.timings) || !draft.timings.length || draft.timings.length > 12 ||
          draft.timings.some(t => typeof t !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) ||
          !/^\d{4}-\d{2}-\d{2}$/.test(draft.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(draft.endDate)) throw new Error('Invalid reminder link');
      requestedDraft = {name:draft.name,dosage:draft.dosage,timings:draft.timings.join(', '),startDate:draft.startDate,endDate:draft.endDate,timezone:'Asia/Kolkata'};
      history.replaceState(null, '', location.pathname + location.search);
    }
  } catch { notice('This reminder link is invalid. Add the schedule using Add medicine.', true); }
  $('calendar-day').value = dayNow();
  $('calendar-day').min = addDays(dayNow(), -90); $('calendar-day').max = addDays(dayNow(), 90);
  function notice(text = '', error = false) { $('notice').textContent = text; $('notice').classList.toggle('error', error); }
  function showAuth() {
    state = null; currentOwner = null; $('app').hidden = true; $('auth').hidden = false; $('signout').hidden = true;
    for (const id of ['stats','dose-list','plan-list','history-list','refill-list','delivery-list','adherence-chart']) $(id).replaceChildren();
    $('plan-form').reset(); $('refill-form').reset();
  }
  async function load() {
    const session = api.session();
    if (!session || session.user.role !== 'patient') { showAuth(); if (session) notice('Use a patient account to manage medicine reminders.', true); return; }
    if (currentOwner !== null && currentOwner !== session.user.id) showAuth();
    const token = session.token;
    try {
      const fresh = await request(`?day=${encodeURIComponent($('calendar-day').value || dayNow())}&timezone=${encodeURIComponent(timezone)}`);
      if (api.session()?.token !== token) return;
      state = fresh; currentOwner = fresh.user.id; $('auth').hidden = true; $('app').hidden = false; $('signout').hidden = false;
      $('welcome').textContent = `${fresh.user.name.split(' ')[0]}, here’s your daily care companion.`;
      render(); await deviceStatus();
      if (requestedDraft && !draftOpened) {
        editPlan();
        for (const [key,value] of Object.entries(requestedDraft)) $('plan-form').elements.namedItem(key).value=value;
        draftOpened = true;
        notice('Reminder filled in for your signed-in patient account. Review the details and supply, then Save schedule. Browser notifications require Enable browser reminders.');
      }
    } catch (error) {
      if (api.session()?.token !== token) return;
      if ([401, 403].includes(error.status)) showAuth();
      notice(error.message, true);
      const retry = document.createElement('button'); retry.className = 'secondary'; retry.textContent = 'Retry'; retry.onclick = load; $('notice').append(' ', retry);
    }
  }
  const activePlans = () => state.plans.filter(p => { const today = new Intl.DateTimeFormat('en-CA', { timeZone: p.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); return p.active && p.start_date <= today && p.end_date >= today; });
  function render() {
    const day = $('calendar-day').value, doses = state.events.filter(e => e.local_date === day);
    const todayDoses = doses.filter(e => e.status === 'Taken').length;
    const low = activePlans().filter(p => p.stock <= p.refill_at);
    const percentage = state.adherence.percentage;
    $('stats').innerHTML = [ ['Active medicines', activePlans().length, 'Within your current schedule dates'], ['Taken on selected day', `${todayDoses} / ${doses.length}`, 'Record each scheduled dose'], ['30-day adherence', percentage === null ? '—' : percentage + '%', 'Taken / doses due; skipped doses included'], ['Refill alerts', low.length, 'Based on your recorded supply'] ].map(([label, value, note]) => `<article class="stat"><span class="label">${label}</span><strong>${value}</strong><small>${note}</small></article>`).join('');
    $('week').innerHTML = Array.from({ length: 7 }, (_, i) => { const date = addDays(day, i - 3); return `<button class="day" data-day="${date}" aria-pressed="${date === day}" aria-label="${esc(date)}"><span>${new Date(date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' })}</span><strong>${Number(date.slice(-2))}</strong></button>`; }).join('');
    const outstanding = state.events.filter(e => e.status === 'Pending' && new Date(e.due_at) <= new Date());
    $('due-banner').hidden = !outstanding.length; $('due-banner').textContent = outstanding.length + ' scheduled dose(s) are awaiting your status update. Follow your prescribed instructions.';
    $('calendar-note').textContent = `${dateLabel(day)} · Each medicine uses its saved timezone. Future doses cannot be marked in advance. Unrecorded doses appear as Missed after two hours; you can correct their status.`;
    $('dose-list').innerHTML = doses.map(e => {
      const plan = state.plans.find(p => p.id === e.plan_id), future = new Date(e.due_at) > new Date();
      return `<article class="dose-row"><div class="dose-time">${esc(e.local_time)}</div><div class="dose-info"><h3>${esc(e.name)}</h3><p>${esc(e.dosage)} · ${esc(plan?.timezone || '')}</p>${plan?.instructions ? `<p>${esc(plan.instructions)}</p>` : ''}<span class="badge">${esc(e.status)}</span><div class="dose-actions" role="group" aria-label="Track ${esc(e.name)} at ${esc(e.local_time)}">${['Taken','Missed','Skipped'].map(status => `<button data-dose="${e.id}" data-status="${status}" aria-pressed="${e.status === status}" ${future ? 'disabled' : ''}>${status === 'Taken' ? '✓ ' : ''}${status}</button>`).join('')}${e.status !== 'Pending' ? `<button data-dose="${e.id}" data-status="Pending">Reset</button>` : ''}</div></div></article>`;
    }).join('') || empty('A clear day ahead', 'No scheduled doses for this date. Add a medicine or choose another day.');
    $('plan-list').innerHTML = state.plans.map(p => {
      const rx = state.prescriptions.find(r => r.id === p.prescription_id);
      return `<article class="plan-row"><div><h3>${esc(p.name)}</h3><p>${esc(p.dosage)}</p><p>${p.timings.map(esc).join(' · ')} · ${esc(p.timezone)}</p><p>${esc(dateLabel(p.start_date))} – ${esc(dateLabel(p.end_date))} · ${p.active ? 'Active' : 'Paused'}</p>${rx ? `<p>Prescription: ${esc(rx.title)}</p>` : ''}<p class="${p.stock <= p.refill_at ? 'stock-low' : ''}">${p.stock} supply units remaining · ${p.units_per_dose} per dose</p></div><div class="actions"><button class="secondary" data-edit="${p.id}">Edit</button><button class="secondary" data-refill="${p.id}">Refill</button></div></article>`;
    }).join('') || empty('Your routine starts here', 'Add medicine details from your prescription. Nothing is added automatically.');
    const history = state.events.filter(e => new Date(e.due_at) <= new Date() && new Date(e.due_at) >= new Date(Date.now() - 30 * 86400000)).reverse();
    $('adherence-chart').innerHTML = `<p class="muted small">${state.adherence.taken} of ${state.adherence.scheduled} doses due marked Taken${percentage === null ? ' · no adherence data yet' : ' · ' + percentage + '%'}</p><div class="progress" role="progressbar" aria-label="30-day medication adherence" aria-valuemin="0" aria-valuemax="100" ${percentage === null ? '' : `aria-valuenow="${percentage}"`}><span style="width:${percentage || 0}%"></span></div>`;
    $('history-list').innerHTML = history.map(e => `<div class="history-row"><div><strong>${esc(e.name)}</strong><small>${esc(dateLabel(e.local_date))} · ${esc(e.local_time)} · ${esc(e.dosage)}</small></div><span class="badge">${esc(e.status)}</span></div>`).join('') || empty('Progress will grow with you', 'Your dose history and adherence appear as doses become due.');
    $('refill-list').innerHTML = low.map(p => `<div class="refill-row"><strong>${esc(p.name)}</strong><p>${p.stock} supply units remaining · alert at ${p.refill_at}</p><button class="secondary" data-refill="${p.id}">Record refill</button></div>`).join('') || empty('Supply looks covered', 'No active medicine has reached its refill threshold.');
    $('delivery-list').innerHTML = state.deliveries.length ? state.deliveries.map(d => {
      const status=d.received_at?'Browser reported display':(['Sent','Accepted'].includes(d.status)?'Accepted by delivery service; display unverified':d.status);
      const context=d.client_state==='no_windows'?'No MediCare windows were open':d.client_state==='hidden'?'Site windows were in the background':d.client_state==='visible'?'A site window was visible':'';
      const at=d.received_at||d.delivered_at||d.scheduled_for||d.attempted_at;
      return `<div class="delivery-row"><div>${esc(d.channel)} · ${esc(d.kind)}${at?'<br><small>'+esc(new Date(at).toLocaleString())+'</small>':''}${context?'<br><small>'+esc(context)+'</small>':''}</div><div>${esc(status)}${d.error_code?'<br><small>'+esc(d.error_code)+'</small>':''}${d.status==='Failed'&&d.attempts<5&&d.next_attempt?'<br><small>Retry '+esc(new Date(d.next_attempt).toLocaleString())+'</small>':''}</div></div>`;
    }).join('') : 'No notification deliveries yet. Enable a channel or run a device test. No background delivery has been verified.';
    $('email-toggle').disabled = false;
    $('email-toggle').textContent = state.notifications.emailEnabled ? 'Disable email reminders' : !state.notifications.emailConfigured ? 'Email setup instructions' : state.notifications.emailVerified ? 'Enable email reminders' : 'Verify email & enable reminders';
    $('email-status').textContent = state.notifications.emailConfigured ? state.notifications.emailEnabled ? 'Enabled for your verified account email. SMTP acceptance is recorded separately from browser delivery.' : 'Email reminders are off. Verification is required before sending reminders.' : state.notifications.emailSetup?.message || 'Email is not configured. Open setup instructions; no email reminders are being sent.';
    const lastRun = state.notifications.worker?.lastRun;
    $('worker-status').textContent = lastRun && Date.now() - Date.parse(lastRun) < 120000 ? 'Server reminder worker is running.' : 'Server reminder worker has not reported a recent check. Background delivery needs the API to remain running.';
    if (!state.notifications.pushConfigured) $('push-status').textContent = 'Browser push is not configured on the server.';
  }
  const pushSupported = () => window.isSecureContext && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  function setupHelp(text) { $('notification-setup').open=true; notice(text,true); $('notification-setup').scrollIntoView?.({block:'nearest'}); }
  function keysMatch(sub,key) {
    if (!sub?.options?.applicationServerKey) return true;
    try { const old=new Uint8Array(sub.options.applicationServerKey), current=publicKeyBytes(key); return old.length===current.length && old.every((n,i)=>n===current[i]); } catch { return false; }
  }
  function activeRegistration(reg) {
    if (reg.active?.state==='activated') return Promise.resolve(reg);
    const worker=reg.installing||reg.waiting||reg.active;
    if (!worker) return Promise.reject(new Error('Service worker did not install. Reload this page and check HTTPS.'));
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{worker.removeEventListener('statechange',check);reject(new Error('Service worker activation timed out. Reload the page and check browser support.'));},12000);
      function check(){if(worker.state==='activated'||worker.state==='redundant'){clearTimeout(timer);worker.removeEventListener('statechange',check);worker.state==='activated'?resolve(reg):reject(new Error('Service worker installation failed. Reload the page.'));}}
      worker.addEventListener('statechange',check);check();
    });
  }
  async function registration() { return navigator.serviceWorker.getRegistration(new URL('./', swURL).href); }
  async function deviceStatus() {
    const token = api.session()?.token;
    $('enable-push').disabled = false; $('disable-push').hidden = true; $('test-push').hidden = true; $('schedule-test-push').hidden=true; $('enable-push').hidden = false;
    $('enable-push').textContent='Enable browser reminders';
    $('background-status').textContent='Closed-page delivery has not been verified on this device.';
    if (!pushSupported()) { $('push-status').textContent = 'Background push needs a supported browser and HTTPS (or localhost). On iPhone/iPad, add the page to the Home Screen first.'; $('enable-push').textContent='Browser setup instructions'; return; }
    const blocked=Notification.permission==='denied';
    if (blocked) { $('push-status').textContent='Notifications are blocked. Open setup instructions to change browser permissions.'; $('enable-push').textContent='Unblock notifications: instructions'; }
    if (!state.notifications.pushConfigured) { $('push-status').textContent=state.notifications.pushSetup?.message||'The server needs Web Push setup. Open setup instructions.'; $('enable-push').textContent='Push setup instructions'; }
    try {
      const sub = await (await registration())?.pushManager.getSubscription();
      if (!state || api.session()?.token !== token) return;
      if (!sub) { if (state.notifications.pushConfigured&&!blocked) $('push-status').textContent = 'Off on this browser. Enable reminders, then verify delivery with a device test.'; return; }
      const result = await request('/push/status', json('POST', { endpoint: sub.endpoint }));
      if (api.session()?.token !== token) return;
      const matching=keysMatch(sub,state.notifications.publicKey);
      const usable=result.enabled&&matching&&state.notifications.pushConfigured&&!blocked&&Notification.permission==='granted';
      $('disable-push').hidden = !result.enabled; $('enable-push').hidden = usable;
      $('test-push').hidden = !usable; $('schedule-test-push').hidden=!usable;
      if (!matching&&state.notifications.pushConfigured&&!blocked) $('enable-push').textContent='Reconnect browser reminders';
      if (!blocked&&state.notifications.pushConfigured) $('push-status').textContent = usable ? 'Device subscription is enabled. Provider acceptance alone does not verify display; use a device test.' : !matching?'The server push key changed. Reconnect this browser subscription.':'This browser is not enabled for your current account. Enable to associate it with this account.';
      if (result.lastClosedReceipt) $('background-status').textContent='Browser reported notification display with no MediCare windows open at '+new Date(result.lastClosedReceipt).toLocaleString()+'. This does not prove a person saw the banner.';
      else if(result.lastReceived) $('background-status').textContent='Browser display reported at '+new Date(result.lastReceived).toLocaleString()+'. Closed-page delivery is still unverified.';
    } catch { $('push-status').textContent = 'Could not check this device’s reminder subscription. Try enabling it again.'; }
  }
  function publicKeyBytes(key) { const base = key.replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(base + '='.repeat((4 - base.length % 4) % 4)), c => c.charCodeAt(0)); }
  $('enable-push').onclick = async () => {
    const button = $('enable-push'); button.disabled = true;
    const token = api.session()?.token;
    try {
      if (!pushSupported()) return setupHelp('Use HTTPS or localhost in a supported browser. On iPhone/iPad, add MediCare to the Home Screen. Your medicine calendar still works.');
      if (!state.notifications.pushConfigured) return setupHelp(state.notifications.pushSetup?.message||'Ask the administrator to run setup:medicine and restart the Node API.');
      if (Notification.permission==='denied') return setupHelp('Notifications are blocked. Open this site’s browser permissions, allow notifications, then return here. Also check OS notification settings.');
      // Request permission only in this explicit click handler.
      if (Notification.permission!=='granted'&&await Notification.requestPermission() !== 'granted') throw new Error('Notification permission was not granted. Your calendar remains available.');
      const reg = await activeRegistration(await navigator.serviceWorker.register(swURL,{updateViaCache:'none'}));
      if (api.session()?.token !== token) throw new Error('Your account changed. Sign in and enable reminders again.');
      let sub=await reg.pushManager.getSubscription();
      if (sub&&!keysMatch(sub,state.notifications.publicKey)) { await sub.unsubscribe();sub=null; }
      sub=sub||await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKeyBytes(state.notifications.publicKey) });
      await request('/push', json('POST', { subscription: sub.toJSON() }));
      notice('Browser reminders enabled for your account on this device.'); await load();
    } catch (error) { notice(error.message, true); }
    finally { button.disabled = false; }
  };
  $('disable-push').onclick = async () => {
    $('disable-push').disabled = true;
    try { const sub = await (await registration())?.pushManager.getSubscription(); if (sub) { await request('/push', json('DELETE', { endpoint: sub.endpoint })); await sub.unsubscribe(); } notice('Browser reminders disabled on this device.'); await load(); }
    catch (error) { notice(error.message, true); } finally { $('disable-push').disabled = false; }
  };
  $('test-push').onclick = async () => {
    const button = $('test-push'); button.disabled = true;
    try { const sub = await (await registration())?.pushManager.getSubscription(); if (!sub) throw new Error('Enable this browser first.'); const result = await request('/push/test', json('POST', { endpoint: sub.endpoint })); notice(result.message); }
    catch (error) { notice(error.message, true); } finally { button.disabled = false; }
  };
  $('schedule-test-push').onclick=async()=>{
    const button=$('schedule-test-push');button.disabled=true;
    try {const sub=await(await registration())?.pushManager.getSubscription();if(!sub)throw new Error('Enable this device first.');const result=await request('/push/test',json('POST',{endpoint:sub.endpoint,delaySeconds:60}));notice(result.message);await load();}
    catch(error){notice(error.message,true);}finally{button.disabled=false;}
  };
  $('email-toggle').onclick = async () => {
    const button = $('email-toggle'); button.disabled = true;
    try {
      if (!state.notifications.emailConfigured&&!state.notifications.emailEnabled) return setupHelp(state.notifications.emailSetup?.message||'SMTP is not configured. Ask the administrator to add the SMTP settings, restart the API, then verify your email.');
      if (!state.notifications.emailEnabled && !state.notifications.emailVerified) { const result = await request('/verify-email', json('POST', {})); notice(result.message); }
      else { await request('/preferences', json('PUT', { emailEnabled: !state.notifications.emailEnabled })); notice('Email preference saved.'); }
      await load();
    } catch (error) { notice(error.message, true); } finally { button.disabled = false; }
  };
  function editPlan(plan = null) {
    editId = plan?.id || null;
    const form = $('plan-form'); form.reset(); $('form-error').textContent = '';
    $('editor-title').textContent = plan ? 'Edit medicine schedule' : 'Add medicine';
    $('prescription-select').innerHTML = '<option value="">No prescription linked</option>' + state.prescriptions.map(rx => `<option value="${rx.id}">${esc(rx.title)}</option>`).join('');
    const fields = { name: plan?.name || '', dosage: plan?.dosage || '', prescriptionId: plan?.prescription_id || '', timings: plan?.timings.join(', ') || '08:00', timezone: plan?.timezone || timezone, startDate: plan?.start_date || dayNow(), endDate: plan?.end_date || addDays(dayNow(), 29), stock: plan?.stock ?? 0, unitsPerDose: plan?.units_per_dose ?? 1, refillAt: plan?.refill_at ?? 5, instructions: plan?.instructions || '' };
    for (const [key, value] of Object.entries(fields)) form.elements.namedItem(key).value = value;
    form.elements.namedItem('active').checked = plan ? plan.active : true;
    form.elements.namedItem('dosage').readOnly = !!plan; $('dose-confirm-label').hidden = !plan; $('dose-confirm').checked = false;
    $('editor').showModal();
  }
  $('dose-confirm').onchange = () => { $('plan-form').elements.namedItem('dosage').readOnly = !$('dose-confirm').checked; };
  $('add-medicine').onclick = () => editPlan();
  $('close-editor').onclick = () => $('editor').close(); $('close-refill').onclick = () => $('refill-editor').close();
  $('plan-form').onsubmit = async e => {
    e.preventDefault(); if (saving) return; saving = true; const button = e.currentTarget.querySelector('[type=submit]'); button.disabled = true;
    try {
      const fields = Object.fromEntries(new FormData(e.currentTarget));
      const payload = { ...fields, active: e.currentTarget.elements.namedItem('active').checked, timings: fields.timings.split(',').map(s => s.trim()), confirmDosageChange: $('dose-confirm').checked };
      await request('/plans' + (editId ? '/' + editId : ''), json(editId ? 'PUT' : 'POST', payload));
      $('editor').close(); notice(`Medicine schedule saved securely to your signed-in account (${payload.timezone}). Use Enable browser reminders to allow notifications on this device.`); await load();
    } catch (error) { $('form-error').textContent = error.message; }
    finally { saving = false; button.disabled = false; }
  };
  $('refill-form').onsubmit = async e => { e.preventDefault(); const button = e.currentTarget.querySelector('[type=submit]'); button.disabled = true; try { await request('/plans/' + refillId + '/refill', json('POST', { amount: Number(new FormData(e.currentTarget).get('amount')) })); $('refill-editor').close(); notice('Refill recorded.'); await load(); } catch (error) { $('refill-error').textContent = error.message; } finally { button.disabled = false; } };
  document.addEventListener('click', async e => {
    const add = e.target.closest('[data-add]'); if (add) return editPlan();
    const edit = e.target.closest('[data-edit]'); if (edit) return editPlan(state.plans.find(p => p.id === Number(edit.dataset.edit)));
    const refill = e.target.closest('[data-refill]'); if (refill) { refillId = Number(refill.dataset.refill); $('refill-form').reset(); $('refill-error').textContent = ''; return $('refill-editor').showModal(); }
    const day = e.target.closest('[data-day]'); if (day) { if (day.dataset.day < $('calendar-day').min || day.dataset.day > $('calendar-day').max) return; $('calendar-day').value = day.dataset.day; return load(); }
    const dose = e.target.closest('[data-dose]'); if (dose) { dose.disabled = true; try { await request('/events/' + dose.dataset.dose, json('PUT', { status: dose.dataset.status })); notice('Dose status saved.'); await load(); } catch (error) { notice(error.message, true); } finally { dose.disabled = false; } }
  });
  $('calendar-day').onchange = () => { if (!$('calendar-day').value || !$('calendar-day').checkValidity()) $('calendar-day').value = dayNow(); load(); };
  $('previous-day').onclick = () => { const value = addDays($('calendar-day').value || dayNow(), -1); if (value >= $('calendar-day').min) { $('calendar-day').value = value; load(); } };
  $('next-day').onclick = () => { const value = addDays($('calendar-day').value || dayNow(), 1); if (value <= $('calendar-day').max) { $('calendar-day').value = value; load(); } };
  $('login').onsubmit = async e => { e.preventDefault(); const button = e.currentTarget.querySelector('button'); button.disabled = true; try { await api.authenticate(e.currentTarget, 'login', 'patient'); notice(); await load(); } catch (error) { notice(error.message, true); } finally { button.disabled = false; } };
  $('signout').onclick = () => { ['mc_token','mc_user','medicare_token'].forEach(key => localStorage.removeItem(key)); $('editor').close(); $('refill-editor').close(); showAuth(); notice('Signed out. Device reminders continue until disabled in Medicine Reminder or browser settings.'); };
  window.addEventListener('storage', e => { if (['mc_token','mc_user',null].includes(e.key)) { $('editor').close(); $('refill-editor').close(); showAuth(); load(); } });
  window.addEventListener('focus', () => load());
  navigator.serviceWorker?.addEventListener?.('message',event=>{if(event.data?.type==='medicare:medicine-receipt'&&api.session())load();});
  setInterval(() => { if (state && !document.hidden && !$('editor').open && !$('refill-editor').open) load(); }, 30000);
  load();
})();
