(() => {
  const formatter = new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2
  });
  globalThis.MedicareCurrency = Object.freeze({
    code: 'INR', defaultConsultationFee: 499,
    formatINR: amount => formatter.format(Number(amount) || 0)
  });
  // Upgrade local demo data once, before the standalone pages read it.
  if (typeof localStorage !== 'undefined') {
    try {
      if (localStorage.getItem('medicare_currency_version') !== 'INR-1') {
        const convert = value => {
          if (!value || typeof value !== 'object') return value;
          if (Array.isArray(value)) return value.map(convert);
          const result = { ...value };
          for (const key of Object.keys(result)) {
            if (['fee', 'consultationFee'].includes(key)) { result[key] = 499; result.currency = 'INR'; }
            else if (result[key] && typeof result[key] === 'object') result[key] = convert(result[key]);
          }
          return result;
        };
        for (const key of ['medicare_doctors', 'medicare_active_doctor', 'medicare_appointments']) {
          const saved = localStorage.getItem(key);
          if (saved) localStorage.setItem(key, JSON.stringify(convert(JSON.parse(saved))));
        }
        localStorage.setItem('medicare_currency_version', 'INR-1');
      }
    } catch { /* Storage can be disabled in browser previews. */ }
  }
})();
