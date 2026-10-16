(() => {
  if (customElements.get('medicare-assistant')) return;
  const medicalIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3v2M12 3v2M5 4H4v5a5 5 0 0 0 10 0V4h-1"/><path d="M9 14v2a5 5 0 0 0 10 0v-2"/><circle cx="19" cy="11" r="3"/></svg>';
  const assetBase = new URL('.', document.currentScript.src);
  const local = location.protocol === 'file:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const apiBase = local ? 'http://localhost:5000/api' : '/api';
  const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  class MedicalAssistant extends HTMLElement {
    constructor() {
      super(); this.attachShadow({ mode: 'open' });
      this.messages = []; this.result = null; this.busy = false; this.config = {}; this.generation = 0;
    }
    connectedCallback() {
      this.shadowRoot.innerHTML = `<link rel="stylesheet" href="${new URL('medical-assistant.css', assetBase)}">
        <div class="launcher-shell"><button class="launcher" aria-label="Find the right specialist with automated care guidance" aria-expanded="false"><span class="launcher-banner"><span class="medical-icon" aria-hidden="true">${medicalIcon}</span><span class="launcher-copy"><strong>Your care, a little clearer.</strong><small>Find the right specialist.</small></span><span class="launcher-arrow" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></span></span></button></div>
        <section class="panel" role="dialog" aria-modal="false" aria-label="MediCare medical assistant" hidden>
          <header class="header"><span class="medical-icon" aria-hidden="true">${medicalIcon}</span><div><h2>Specialist guidance</h2><p>Automated care navigation &middot; not a clinician</p></div><button class="close" aria-label="Close assistant">×</button></header>
          <div class="status"><span class="dot"></span><strong class="mode">Connecting…</strong><span>Private by default</span></div>
          <div class="scroll"><div class="welcome"><span class="eyebrow">LET’S FIND YOUR NEXT STEP</span><h3>How have you<br>been feeling?</h3><p>Tell me about a symptom or a change in your health. I’ll ask a few questions and help you explore suitable doctors.</p>
          <div class="chips"><button class="chip">Skin or itching</button><button class="chip">Digestive changes</button><button class="chip">Stress or mood</button><button class="chip">Joint or back pain</button></div>
          <div class="note">This is an automated care-navigation service. Care navigation only—not a diagnosis or prescription. For chest pain, difficulty breathing, sudden weakness, severe bleeding, or other emergencies, contact local emergency services immediately. <a href="https://www.nhs.uk/symptoms/chest-pain/" target="_blank" rel="noopener noreferrer">Warning signs</a></div></div>
          <div class="messages" role="log" aria-label="Conversation" aria-live="polite"></div><div class="results"></div><div class="extras"></div><div class="error" role="alert" hidden></div></div>
          <footer class="composer"><label class="privacy"><input class="ai-consent" type="checkbox" disabled><span class="ai-label">Checking AI availability…</span></label>
          <form class="input-row"><label class="sr-only" for="symptom-message">Describe your symptoms</label><textarea id="symptom-message" rows="2" maxlength="2000" placeholder="Describe what has changed…" required></textarea><button class="send" type="submit" aria-label="Send message">↑</button></form>
          <div class="bottom-actions"><button class="link reset">New conversation</button><button class="link save">Save with consent</button><button class="link history">Saved chats</button></div></footer>
        </section>`;
      this.$('.launcher').onclick = () => this.open();
      this.$('.close').onclick = () => this.close();
      this.$('.reset').onclick = () => this.reset();
      this.$('.save').onclick = () => this.saveDialog();
      this.$('.history').onclick = () => this.showHistory();
      this.$('form.input-row').onsubmit = event => { event.preventDefault(); this.send(); };
      this.$('textarea').onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); this.send(); } };
      this.$('.panel').onkeydown = event => { if (event.key === 'Escape') this.close(); };
      for (const chip of this.shadowRoot.querySelectorAll('.chip')) chip.onclick = () => { this.$('textarea').value = chip.textContent; this.$('textarea').focus(); };
      this.$('.ai-consent').onchange = () => this.updateMode();
      this.request('/assistant/config').then(config => {
        this.config = config; this.$('.ai-consent').disabled = !config.aiConfigured;
        this.$('.ai-label').textContent = config.aiConfigured ? 'Use AI analysis: sends this chat to OpenAI. Avoid personal identifiers.' : 'Guided mode • AI is not configured. Messages stay with the MediCare server.';
        this.updateMode();
      }).catch(() => { this.$('.mode').textContent = 'Offline'; this.$('.ai-label').textContent = 'Start the MediCare API to use the assistant.'; });
    }
    $(selector) { return this.shadowRoot.querySelector(selector); }
    session() {
      try {
        const token = JSON.parse(localStorage.getItem('mc_token')) || localStorage.getItem('medicare_token');
        const user = JSON.parse(localStorage.getItem('mc_user'));
        return token ? { token, user } : null;
      } catch { return null; }
    }
    async request(path, options = {}) {
      const token = this.session()?.token;
      let response;
      try { response = await fetch(apiBase + path, { ...options, signal: AbortSignal.timeout(25000), headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } }); }
      catch { throw new Error('The service could not be reached. Please retry. For urgent symptoms, contact a clinician directly.'); }
      const data = await response.json().catch(() => { throw new Error('The service returned an unexpected response. Please retry.'); });
      if (!response.ok || !data.success) throw new Error(data.message || 'The request could not be completed.');
      return data;
    }
    node(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
    open() { this.$('.launcher-shell').hidden = true; this.$('.panel').hidden = false; this.$('.launcher').hidden = true; this.$('.launcher').setAttribute('aria-expanded', 'true'); this.$('textarea').focus(); }
    close() { this.$('.launcher-shell').hidden = false; this.$('.panel').hidden = true; this.$('.launcher').hidden = false; this.$('.launcher').setAttribute('aria-expanded', 'false'); this.$('.launcher').focus(); }
    updateMode() { this.$('.mode').textContent = this.$('.ai-consent').checked && this.config.aiConfigured ? 'AI-assisted navigation' : 'Guided symptom navigation'; }
    error(message = '') { this.$('.error').textContent = message; this.$('.error').hidden = !message; }
    setBusy(value) { this.busy = value; this.$('.send').disabled = value || Boolean(this.result?.emergency); this.$('textarea').disabled = value || Boolean(this.result?.emergency); this.$('.save').disabled = value; }
    scroll() { const element = this.$('.scroll'); element.scrollTop = element.scrollHeight; }
    renderMessages() {
      const log = this.$('.messages'); log.replaceChildren();
      for (const message of this.messages) {
        const row = this.node('div', 'message ' + message.role);
        row.append(this.node('div', 'who', message.role === 'user' ? 'YOU' : 'MEDICARE ASSISTANT'), this.node('div', 'bubble', message.content)); log.append(row);
      }
      this.$('.welcome').hidden = this.messages.length > 0;
    }
    async send() {
      const content = this.$('textarea').value.trim();
      if (!content || this.busy || this.result?.emergency) return;
      if (this.messages.length >= 18) { this.error('This conversation is full. Save it if you wish, then start a new conversation.'); return; }
      if (content.length > 2000) { this.error('Please use 2,000 characters or fewer.'); return; }
      const generation = this.generation;
      this.error(); this.$('.extras').replaceChildren(); this.$('.results').replaceChildren();
      this.messages.push({ role: 'user', content }); this.renderMessages(); this.$('textarea').value = ''; this.setBusy(true);
      const typing = this.node('div', 'typing', 'Considering your next step…'); this.$('.messages').append(typing); this.scroll();
      try {
        const result = await this.request('/assistant/chat', { method: 'POST', body: JSON.stringify({ messages: this.messages, aiConsent: this.$('.ai-consent').checked }) });
        if (generation !== this.generation) return;
        this.result = result; this.messages.push({ role: 'assistant', content: result.reply }); this.renderMessages();
        if (result.mode === 'guided-fallback') this.$('.mode').textContent = 'AI unavailable • guided fallback';
        else if (result.mode === 'safety') this.$('.mode').textContent = 'Emergency safety guidance';
        if (result.emergency) {
          const alert = this.node('div', 'emergency'); alert.setAttribute('role', 'alert');
          alert.append(this.node('strong', '', 'Seek immediate medical attention'), this.node('div', '', 'Call your local emergency service now or go to the nearest emergency department. Routine bookings are paused for this conversation.'));
          this.$('.results').append(alert);
        } else this.renderDoctors(result);
      } catch (error) { if (generation === this.generation) { this.messages.pop(); this.$('textarea').value = content; this.renderMessages(); this.error(error.message); } }
      finally { if (generation === this.generation) { typing.remove(); this.setBusy(false); this.scroll(); } }
    }
    renderDoctors(result) {
      const area = this.$('.results'); area.replaceChildren();
      if (!result.specialty) return;
      area.append(this.node('div', 'results-title', 'Explore ' + result.specialty), this.node('div', 'results-note', 'Profiles come from the MediCare database. Demo profiles are for testing; credentials are not independently verified. Select a date to check actual slots.'));
      if (!result.doctors.length) { area.append(this.node('div', 'note', 'No matching doctors are available in the directory. Contact a local clinician or explore the doctor directory.')); return; }
      for (const doctor of result.doctors) {
        const card = this.node('article', 'doctor'), top = this.node('div', 'doctor-top'), info = this.node('div');
        const image = this.node('img'); image.alt = doctor.name; image.loading = 'lazy';
        image.src = doctor.image?.startsWith('/images/') ? new URL('images/' + doctor.image.slice(8), assetBase) : /^https:\/\//.test(doctor.image || '') ? doctor.image : new URL('images/doctor-placeholder.svg', assetBase);
        image.onerror = () => { image.onerror = null; image.src = new URL('images/doctor-placeholder.svg', assetBase); };
        info.append(this.node('span', 'spec', doctor.specialization), this.node('h4', '', doctor.name), this.node('p', '', doctor.qualifications), this.node('p', '', (doctor.experience || 'Experience not listed') + ' · ' + doctor.hospital));
        if (doctor.demo) info.append(this.node('span', 'badge', 'Demo profile'));
        top.append(image, info); card.append(top);
        const bottom = this.node('div', 'doctor-bottom'), price = this.node('div'); price.append(this.node('div', 'price', currency.format(doctor.consultationFee)), this.node('p', '', doctor.availableSlots.length ? 'Check date-specific slots' : 'No slots listed'));
        const book = this.node('button', 'book', 'Choose appointment'); book.type = 'button'; book.disabled = !doctor.availableSlots.length; book.onclick = () => this.booking(doctor);
        bottom.append(price, book); card.append(bottom); area.append(card);
      }
    }
    async booking(doctor) {
      if (this.result?.emergency) return;
      this.error(); const area = this.$('.extras'); area.replaceChildren();
      const form = this.node('form', 'booking'); form.append(this.node('h3', '', 'Book with ' + doctor.name), this.node('p', '', 'Bookings use your signed-in patient profile. Chat messages are not attached to the appointment.'));
      if (!this.session()) {
        form.append(this.node('p', '', 'Sign in as a patient to book without leaving this conversation. Your password is only sent to the MediCare sign-in API.'));
        const email = this.node('input'); email.type = 'email'; email.required = true; email.autocomplete = 'username'; email.id = 'assistant-login-email';
        const password = this.node('input'); password.type = 'password'; password.required = true; password.autocomplete = 'current-password'; password.id = 'assistant-login-password';
        const emailLabel = this.node('label', '', 'Patient email'); emailLabel.htmlFor = email.id;
        const passwordLabel = this.node('label', '', 'Password'); passwordLabel.htmlFor = password.id;
        const signIn = this.node('button', 'primary', 'Sign in to continue'); signIn.type = 'submit';
        form.append(emailLabel, email, passwordLabel, password, signIn); area.append(form);
        form.onsubmit = async event => {
          event.preventDefault(); signIn.disabled = true; this.error();
          try {
            const data = await this.request('/auth/login', { method: 'POST', body: JSON.stringify({ email: email.value, password: password.value }) });
            if (data.user.role !== 'patient') throw new Error('Use a patient account to book this appointment.');
            localStorage.setItem('mc_token', JSON.stringify(data.token)); localStorage.setItem('mc_user', JSON.stringify(data.user)); localStorage.setItem('medicare_token', data.token);
            password.value = '';
            window.dispatchEvent(new CustomEvent('medicare:auth-changed', { detail: { user: data.user } }));
            await this.booking(doctor);
          } catch (error) { this.error(error.message); signIn.disabled = false; }
        };
        this.scroll(); return;
      }
      form.append(this.node('p', '', 'Consultation: ' + currency.format(doctor.consultationFee)));
      const date = this.node('input'); date.type = 'date'; date.name = 'date'; date.min = today(); date.value = today(); date.required = true;
      const maxDate = new Date(Date.now() + 89 * 86400000); date.max = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(maxDate);
      const dateId = 'assistant-booking-date'; date.id = dateId; const dateLabel = this.node('label', '', 'Appointment date (India time)'); dateLabel.htmlFor = dateId;
      const slot = this.node('select'); slot.name = 'slot'; slot.required = true; slot.id = 'assistant-booking-slot'; const slotLabel = this.node('label', '', 'Available time'); slotLabel.htmlFor = slot.id;
      const confirm = this.node('button', 'primary', 'Confirm appointment'); confirm.type = 'submit'; confirm.disabled = true;
      form.append(dateLabel, date, slotLabel, slot, confirm); area.append(form);
      let sequence = 0;
      const loadSlots = async () => {
        const current = ++sequence; const selectedDate = date.value; confirm.disabled = true; slot.replaceChildren(this.node('option', '', 'Checking availability…'));
        try {
          const data = await this.request('/assistant/availability?doctorId=' + doctor.id + '&date=' + encodeURIComponent(selectedDate));
          if (current !== sequence || !form.isConnected) return;
          slot.replaceChildren();
          if (!data.slots.length) { const option = this.node('option', '', 'No slots—choose another date'); option.value = ''; slot.append(option); }
          else for (const time of data.slots) { const option = this.node('option', '', time); option.value = time; slot.append(option); }
          confirm.disabled = !data.slots.length;
        } catch (error) { if (current === sequence) { slot.replaceChildren(); this.error(error.message); } }
      };
      date.onchange = loadSlots; await loadSlots();
      form.onsubmit = async event => {
        event.preventDefault(); if (this.result?.emergency) return; confirm.disabled = true; this.error();
        try {
          const data = await this.request('/assistant/book', { method: 'POST', body: JSON.stringify({ doctorId: doctor.id, date: date.value, slot: slot.value }) });
          const success = this.node('div', 'success', `Appointment confirmed: ${data.appointmentCode}\n${doctor.name}\n${data.date} at ${data.slot} (India time)\n${currency.format(data.amount)} · INR\nYou can find this booking in Appointments.`); success.setAttribute('role', 'status'); area.replaceChildren(success);
          window.dispatchEvent(new CustomEvent('medicare:appointment-booked', { detail: data }));
        } catch (error) { this.error(error.message); await loadSlots(); }
        this.scroll();
      };
      this.scroll();
    }
    reset() {
      this.generation++; this.messages = []; this.result = null; this.renderMessages(); this.$('.results').replaceChildren(); this.$('.extras').replaceChildren(); this.error(); this.setBusy(false); this.updateMode(); this.$('textarea').value = ''; this.$('textarea').focus();
    }
    saveDialog() {
      this.error(); const area = this.$('.extras'); area.replaceChildren();
      if (!this.messages.some(message => message.role === 'user')) { this.error('Start a conversation before saving.'); return; }
      if (!this.session()) { this.error('Please sign in as a patient to save a chat. Nothing has been saved.'); return; }
      if (!this.config.historyAvailable) { this.error('Encrypted history is not configured. Your chat has not been saved.'); return; }
      const box = this.node('div', 'booking'); box.append(this.node('h3', '', 'Your choice to save'));
      const label = this.node('label', 'privacy'), consent = this.node('input'); consent.type = 'checkbox';
      label.append(consent, this.node('span', '', 'I consent to storing this conversation encrypted in my MediCare account for up to 30 days. I can delete it in Saved chats.'));
      const save = this.node('button', 'primary', 'Save this conversation'); save.disabled = true; consent.onchange = () => { save.disabled = !consent.checked; }; box.append(label, save); area.append(box);
      save.onclick = async () => {
        save.disabled = true;
        try { await this.request('/assistant/history', { method: 'POST', body: JSON.stringify({ messages: this.messages, consent: consent.checked }) }); area.replaceChildren(this.node('div', 'success', 'Conversation saved with your consent. It expires in 30 days.')); }
        catch (error) { this.error(error.message); save.disabled = !consent.checked; }
      }; this.scroll();
    }
    async showHistory() {
      this.error(); const area = this.$('.extras'); area.replaceChildren();
      if (!this.session()) { this.error('Please sign in as a patient to view your saved chats.'); return; }
      try {
        const data = await this.request('/assistant/history'); area.append(this.node('div', 'results-title', 'Your saved conversations'));
        if (!data.conversations.length) area.append(this.node('p', 'note', 'No saved chats. Conversations are only stored when you explicitly save them.'));
        for (const conversation of data.conversations) {
          const card = this.node('div', 'saved'); card.append(this.node('time', '', new Date(conversation.createdAt).toLocaleDateString('en-IN')));
          const preview = this.node('p', '', conversation.messages.find(message => message.role === 'user')?.content || 'Saved conversation'); card.append(preview);
          const details = this.node('details'); details.append(this.node('summary', '', 'Read conversation'));
          for (const message of conversation.messages) details.append(this.node('p', '', (message.role === 'user' ? 'You: ' : 'Assistant: ') + message.content));
          const remove = this.node('button', 'secondary', 'Delete saved chat'); remove.onclick = async () => { remove.disabled = true; try { await this.request('/assistant/history/' + conversation.id, { method: 'DELETE' }); card.remove(); } catch (error) { this.error(error.message); remove.disabled = false; } };
          card.append(details, remove); area.append(card);
        }
      } catch (error) { this.error(error.message); }
      this.scroll();
    }
  }
  customElements.define('medicare-assistant', MedicalAssistant);
  if (!document.querySelector('medicare-assistant')) document.body.append(document.createElement('medicare-assistant'));
})();
