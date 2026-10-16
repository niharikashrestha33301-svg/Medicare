(() => {
  const $=id=>document.getElementById(id),api=MedicareAPI;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const notice=(text='',error=false)=>{$('notice').textContent=text;$('notice').classList.toggle('error',error);};
  const json=(method,body)=>({method,body:JSON.stringify(body)});
  async function download(path){const token=api.session()?.token;if(!token)throw new Error('Sign in first.');const r=await fetch(api.base+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('Document unavailable or access denied.');const url=URL.createObjectURL(await r.blob()),link=document.createElement('a');link.href=url;link.download='prescription';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  function gate(roles){const session=api.session(),allowed=session&&roles.includes(session.user.role);$('auth').hidden=!!allowed;$('account').hidden=!allowed;$('signout').hidden=!session;$('identity').textContent=session?session.user.name:'';if(session&&!allowed)notice('Use a '+roles.join(' or ')+' account for this page.',true);return !!allowed;}
  $('login').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,button=form.querySelector('button');button.disabled=true;try{await api.authenticate(form,'login');form.reset();notice();window.dispatchEvent(new Event('care-session'));}catch(error){notice(error.message,true);}finally{button.disabled=false;}};
  $('signout').onclick=()=>{window.dispatchEvent(new Event('care-leave'));['mc_token','mc_user','medicare_token'].forEach(key=>localStorage.removeItem(key));window.dispatchEvent(new Event('care-session'));notice('Signed out.');};
  window.addEventListener('storage',event=>{if(['mc_token','mc_user',null].includes(event.key)){window.dispatchEvent(new Event('care-leave'));window.dispatchEvent(new Event('care-session'));}});
  window.Care={$,api,esc,notice,json,gate,download,money:value=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(value/100),empty:text=>'<div class="empty">'+esc(text)+'</div>'};
})();
