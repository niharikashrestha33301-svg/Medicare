(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let position = null, generation = 0, hospitals = [], page = 1, locationTimer = null;
  const pageSize = 9;
  const mapsUrl = (mode, fields) => {
    const url = new URL(`https://www.google.com/maps/${mode}/`);
    url.searchParams.set('api', '1');
    for (const [key, value] of Object.entries(fields)) if (value) url.searchParams.set(key, value);
    return url.href;
  };
  const origin = () => position ? `${position.latitude.toFixed(6)},${position.longitude.toFixed(6)}` : '';
  const nearbyUrl = () => mapsUrl('search', { query: position ? 'hospitals near ' + origin() : 'hospitals near me' });
  function notice(text, error = false) { $('notice').textContent = text; $('notice').classList.toggle('error', error); }
  function updateLocationLinks() {
    $('nearby-link').href = nearbyUrl(); $('map-link').href = nearbyUrl();
    $('ambulance-link').href = mapsUrl('search', { query: position ? 'ambulance services near ' + origin() : 'ambulance services near me' });
    $('clear-location').hidden = !position;
    $('route-origin').textContent = position ? 'Your permitted GPS location' : 'Choose your starting point in Google Maps';
    if (!$('route-link').hidden) prepareRoute();
  }
  function clearLocation() {
    clearTimeout(locationTimer); locationTimer = null; $('clear-location').textContent = 'Clear location';
    generation++; position = null; $('locate').disabled = false; $('locate').textContent = 'Use my location';
    $('location-status').textContent = 'Location cleared. You can search manually or use Google Maps.';
    updateLocationLinks();
  }
  $('clear-location').onclick = clearLocation;
  $('locate').onclick = () => {
    if (!window.isSecureContext) { $('location-status').textContent = 'GPS requires HTTPS or localhost. Use the city search or open Google Maps instead.'; return; }
    if (!navigator.geolocation) { $('location-status').textContent = 'GPS is not supported by this browser. Search by city instead.'; return; }
    const current = ++generation;
    clearTimeout(locationTimer);
    $('clear-location').hidden = false; $('clear-location').textContent = 'Cancel location request';
    locationTimer = setTimeout(() => {
      if(current !== generation)return;
      clearLocation(); $('location-status').textContent = 'Location request timed out. Close or answer the browser prompt, then retry, or search by city.';
    },15000);
    $('locate').disabled = true; $('locate').textContent = 'Requesting location…';
    $('location-status').textContent = 'Allow location in your browser to search around you. You can decline and search manually.';
    // Browser permission is requested only after this explicit user action.
    navigator.geolocation.getCurrentPosition(result => {
      if (current !== generation) return;
      clearTimeout(locationTimer); locationTimer = null; $('clear-location').textContent = 'Clear location';
      const { latitude, longitude, accuracy } = result.coords;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) { clearLocation(); $('location-status').textContent = 'The browser returned an invalid location. Search by city instead.'; $('locate').textContent = 'Try location again'; return; }
      position = { latitude, longitude, accuracy, measuredAt:new Date(result.timestamp || Date.now()).toISOString() };
      $('location-status').textContent = `Location ready${Number.isFinite(accuracy) ? ' · reported accuracy ' + Math.round(accuracy) + ' m' : ''}. Open Google Maps to find nearby hospitals.`;
      $('locate').disabled = false; $('locate').textContent = 'Refresh location';
      updateLocationLinks();
    }, error => {
      if (current !== generation) return;
      clearTimeout(locationTimer); locationTimer = null; $('clear-location').textContent = 'Clear location';
      position = null; updateLocationLinks();
      $('location-status').textContent = error.code === 1 ? 'Location permission denied. Search by city or open Google Maps instead.' : error.code === 3 ? 'Location request timed out. Retry or search by city.' : 'Your location is unavailable. Search by city or open Google Maps instead.';
      $('locate').disabled = false; $('locate').textContent = 'Try location again';
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 });
  };
  $('area-form').onsubmit = e => {
    e.preventDefault(); const area = $('area').value.trim();
    if (!area || area.length > 180) { notice('Enter a city, locality, or postcode.', true); return; }
    const href = mapsUrl('search', { query: 'hospitals near ' + area });
    $('area-link').href = href; $('area-link').hidden = false; $('map-link').href = href;
    $('area-ambulance-link').href = mapsUrl('search', { query: 'ambulance services near ' + area }); $('area-ambulance-link').hidden = false;
    $('area-link').textContent = `Open hospitals near ${area} in Google Maps ↗`;
    notice('Search prepared. Open Google Maps to view current hospital listings and published contact numbers.');
  };
  function prepareRoute() {
    const destination = $('destination').value.trim();
    if (!destination || destination.length > 500) { notice('Enter a hospital name or address, up to 500 characters.', true); return false; }
    const mode = $('travel-mode').value;
    const travelmode = ['driving', 'walking', 'transit'].includes(mode) ? mode : 'driving';
    $('route-link').href = mapsUrl('dir', { origin: origin(), destination, travelmode });
    $('route-link').hidden = false;
    return true;
  }
  $('destination').maxLength = 500;
  $('route-form').onsubmit = e => { e.preventDefault(); if (prepareRoute()) notice('Route prepared. Open Google Maps to review the route and starting point.'); };
  $('destination').oninput = () => { $('route-link').hidden = true; };
  $('travel-mode').onchange = () => { if (!$('route-link').hidden) prepareRoute(); };
  const phone = value => {
    const digits = String(value || '').replace(/[^0-9+]/g, '');
    return /^\+?\d{7,15}$/.test(digits) ? digits : '';
  };
  function renderHospitals() {
    const query = $('hospital-filter').value.trim().toLowerCase();
    const filtered = hospitals.filter(h => `${h.name || ''} ${h.city || ''}`.toLowerCase().includes(query));
    const total = Math.ceil(filtered.length / pageSize); page = Math.max(1, Math.min(page, total || 1));
    $('hospital-list').innerHTML = filtered.slice((page - 1) * pageSize, page * pageSize).map(h => `<article class="hospital-card"><h3>${esc(h.name)}</h3><p>${esc(h.address)}${h.city ? ', ' + esc(h.city) : ''}</p><p class="service">${esc(h.emergency || 'Emergency service details not recorded')}</p>${phone(h.phone) ? `<a class="contact" href="tel:${phone(h.phone)}">☎ ${esc(h.phone)}</a>` : '<span class="muted small">No valid contact number recorded</span>'}<div class="actions"><button class="secondary" type="button" data-directions="${esc(h.id)}">Prepare directions →</button><a class="secondary" href="${esc(mapsUrl('search', { query: [h.name, h.address, h.city].filter(Boolean).join(', ') }))}" target="_blank" rel="noopener noreferrer">View in Maps ↗</a></div></article>`).join('');
    $('directory-status').textContent = filtered.length ? `${filtered.length} stored hospital${filtered.length === 1 ? '' : 's'}${query ? ' matching your search' : ''}.` : hospitals.length ? 'No hospitals match your search. Try another name or city.' : 'No hospital contacts are stored. Use Google Maps to search nearby hospitals.';
    $('page-label').textContent = total ? `Page ${page} of ${total}` : '';
    $('previous').hidden = page <= 1; $('next').hidden = page >= total;
  }
  $('hospital-filter').oninput = () => { page = 1; renderHospitals(); };
  $('previous').onclick = () => { page--; renderHospitals(); };
  $('next').onclick = () => { page++; renderHospitals(); };
  $('hospital-list').onclick = e => {
    const button = e.target.closest('[data-directions]'); if (!button) return;
    const hospital = hospitals.find(h => String(h.id) === button.dataset.directions); if (!hospital) return;
    $('destination').value = [hospital.name, hospital.address, hospital.city].filter(Boolean).join(', ').slice(0, 500);
    if (prepareRoute()) { $('route-link').scrollIntoView?.({ block: 'center' }); $('route-link').focus(); notice('Hospital selected. Open directions in Google Maps to see routes.'); }
  };
  async function loadDirectory() {
    $('retry').hidden = true; $('directory-status').textContent = 'Loading the hospital directory…';
    try { const data = await MedicareAPI.request('/emergency'); hospitals = Array.isArray(data.hospitals) ? data.hospitals : []; renderHospitals(); }
    catch { $('directory-status').textContent = 'MediCare’s hospital directory is unavailable. Emergency calls, Google Maps searches, and directions still work.'; $('retry').hidden = false; }
  }
  let trackedRequest=null, requestOwner=null, trackingBusy=false, requestBusy=false;
  const ambulanceRequest=(path='',options)=>MedicareAPI.request('/ambulance'+path,options);
  async function refreshRequests(){
    const session=MedicareAPI.session();if(!session||session.user.role!=='patient'){$('request-status').textContent='Sign in with your patient account to request or track an ambulance.';$('my-emergency-requests').replaceChildren();$('ambulance-tracking-detail').replaceChildren();trackedRequest=null;return;}
    const token=session.token;if(requestOwner!==token){requestOwner=token;trackedRequest=null;$('ambulance-tracking-detail').replaceChildren();}
    try{const data=await ambulanceRequest('/requests');if(MedicareAPI.session()?.token!==token)return;$('my-emergency-requests').innerHTML=data.requests.map(r=>`<article class="hospital-card"><h3>${esc(r.vehicle?.registration||r.registration)}</h3><p>${esc(r.organization)} | ${esc(r.status)}</p><p>Reference: ${esc(r.id)}</p><div class="actions"><button type="button" class="secondary" data-track-request="${esc(r.id)}">Track Ambulance</button>${['Requested','Accepted','En route','Arrived'].includes(r.status)?`<button type="button" class="secondary" data-cancel-request="${esc(r.id)}">Cancel request</button>`:''}</div></article>`).join('')||'<p>No emergency requests saved.</p>';if(trackedRequest)await trackAmbulance(trackedRequest);}catch(e){$('request-status').textContent=e.message;}
  }
  async function trackAmbulance(requestId){if(trackingBusy)return;trackingBusy=true;const token=MedicareAPI.session()?.token;try{const {request:r}=await ambulanceRequest('/requests/'+requestId);if(MedicareAPI.session()?.token!==token)return;trackedRequest=requestId;const detail=$('ambulance-tracking-detail');detail.replaceChildren();const title=document.createElement('h3');title.textContent=r.vehicle.registration+' | '+r.status;detail.append(title);const text=document.createElement('p');text.textContent=r.message+(r.distanceKm!==null?' | Straight-line distance: '+r.distanceKm+' km':'')+' | ETA unavailable';detail.append(text);if(r.trackingAvailable&&r.position){const point=r.position,link=document.createElement('a');link.href=mapsUrl('search',{query:point.latitude+','+point.longitude});link.target='_blank';link.rel='noopener noreferrer';link.className='map-link';link.textContent='View latest ambulance location in Google Maps';detail.append(link);if(r.pickup){const route=document.createElement('a');route.href=mapsUrl('dir',{origin:point.latitude+','+point.longitude,destination:r.pickup.latitude+','+r.pickup.longitude,travelmode:'driving'});route.target='_blank';route.rel='noopener noreferrer';route.className='map-link';route.textContent='View road route in Google Maps';detail.append(route);}const timestamp=document.createElement('small');timestamp.textContent='GPS updated: '+new Date(point.updatedAt).toLocaleString();detail.append(timestamp);}if(phone(r.driverPhone)){const call=document.createElement('a');call.href='tel:'+phone(r.driverPhone);call.textContent='Call assigned provider';call.className='map-link';detail.append(call);}}catch(e){$('ambulance-tracking-detail').textContent=e.message;trackedRequest=null;}finally{trackingBusy=false;}}
  $('ambulance-request-form').onsubmit=async e=>{e.preventDefault();if(requestBusy)return;const session=MedicareAPI.session();if(!session||session.user.role!=='patient'){notice('Sign in with your patient account first.',true);return;}if(!position){notice('Choose Use my location and allow GPS before requesting an ambulance.',true);$('locate').focus();return;}requestBusy=true;const button=e.currentTarget.querySelector('[type=submit]');button.disabled=true;const token=session.token;try{const data=await ambulanceRequest('/requests',{method:'POST',body:JSON.stringify({...position,phone:$('request-phone').value,shareLocation:$('share-pickup').checked})});if(MedicareAPI.session()?.token!==token)return;$('request-status').textContent=data.request.message;trackedRequest=data.request.id;await refreshRequests();}catch(e){$('request-status').textContent=e.message;notice(e.message,true);}finally{requestBusy=false;button.disabled=false;}};
  $('track-ambulance').onclick=refreshRequests;
  $('my-emergency-requests').onclick=async e=>{const button=e.target.closest('[data-track-request],[data-cancel-request]');if(!button)return;button.disabled=true;try{if(button.dataset.trackRequest)await trackAmbulance(button.dataset.trackRequest);else{await ambulanceRequest('/requests/'+button.dataset.cancelRequest+'/cancel',{method:'PUT',body:'{}'});$('request-status').textContent='Emergency request cancelled. Location access is closed.';await refreshRequests();}}catch(e){notice(e.message,true);}finally{button.disabled=false;}};
  window.addEventListener('storage',e=>{if(['mc_user','mc_token',null].includes(e.key)){requestOwner=null;trackedRequest=null;$('my-emergency-requests').replaceChildren();$('ambulance-tracking-detail').replaceChildren();}});
  setInterval(()=>{if(trackedRequest&&!document.hidden)refreshRequests();},10000);
  ambulanceRequest('/status').then(data=>{if(data.tracking.available){$('fleet-status').textContent='Authorized fleet connected. Track your assigned ambulance below.';$('fleet-message').textContent='Location access is private to an accepted emergency request.';$('fleet-provider').textContent=data.tracking.provider;}}).catch(()=>{});
  $('retry').onclick = loadDirectory;
  window.addEventListener('pagehide', clearLocation);
  if (navigator.permissions?.query) navigator.permissions.query({ name: 'geolocation' }).then(permission => { permission.onchange = () => { if (permission.state === 'denied') clearLocation(); }; }).catch(() => {});
  // No Maps/Places request, GPS acquisition, tracking polling, or coordinate persistence on load.
  updateLocationLinks(); loadDirectory();
})();
