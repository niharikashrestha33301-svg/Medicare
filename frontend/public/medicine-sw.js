'use strict';
// No fetch handler: never cache authenticated pages, health records, or API responses.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch {}
  // Always use a generic notification; no medicine/dosage is exposed on a lock screen.
  event.waitUntil((async () => {
    await self.registration.showNotification('MediCare medicine reminder', {
    body: payload.kind === 'test' ? 'Browser reminders are connected to MediCare on this device.' : payload.kind === 'refill' ? 'A medicine supply is running low. Sign in to review your refill alert.' : 'It is time to check your medicine schedule. Sign in to view your prescribed instructions.',
    tag: typeof payload.tag === 'string' ? payload.tag.slice(0, 100) : 'medicare-medicine',
    icon: new URL('./medicine-icon.svg', self.location.href).href, data: { url: new URL('./medicines.html', self.location.href).href }, renotify: false
    });
    // A provider acceptance is not a browser display receipt. Report only after
    // showNotification resolves; this still does not prove a person saw the banner.
    const receipt=payload.receipt;
    if (!receipt || typeof receipt.id!=='string' || !/^[a-f0-9-]{36}$/i.test(receipt.id) || typeof receipt.token!=='string' || !/^[a-f0-9]{64}$/.test(receipt.token)) return;
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const clientState=!windows.length?'no_windows':windows.some(client=>client.visibilityState==='visible')?'visible':'hidden';
    const here=new URL(self.location.href);
    const staticPreview=['localhost','127.0.0.1','[::1]'].includes(here.hostname)&&['5500','5501'].includes(here.port);
    const base=staticPreview?'http://localhost:5000':here.origin;
    try {
      const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),10000);
      try { const response=await fetch(base+'/api/medicine-reminders/receipt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:receipt.id,token:receipt.token,clientState}),signal:controller.signal}); if(response.ok) for(const client of windows) client.postMessage?.({type:'medicare:medicine-receipt'}); }
      finally {clearTimeout(timer);}
    } catch { /* Without a receipt the UI stays unverified. Never fabricate one. */ }
  })());
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const target = new URL('./medicines.html', self.location.href).href;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) if (client.url === target && 'focus' in client) return client.focus();
    return self.clients.openWindow(target);
  })());
});
