const blank={name:'',email:'',phone:'',location:'',linkedin:'',website:'',autoSubmit:false,domains:[]};
chrome.storage.local.get(['profile','automation'],({profile,automation})=>{
  const p={...blank,...profile}; const a={autoSubmit:false,domains:[],...automation};
  for(const [k,v] of Object.entries(p)){const el=document.querySelector(`[name="${k}"]`);if(el)el.value=v||'';}
  document.querySelector('[name="autoSubmit"]').checked=Boolean(a.autoSubmit);
  document.querySelector('[name="domains"]').value=(a.domains||[]).join('\n');
});
document.querySelector('#profile-form').addEventListener('submit',async e=>{
  e.preventDefault();const fd=new FormData(e.currentTarget);const p=Object.fromEntries(fd);const automation={autoSubmit:fd.has('autoSubmit'),domains:String(fd.get('domains')||'').split(/[\n,]/).map(x=>x.trim().toLowerCase()).filter(x=>/^(?!-)[a-z0-9.-]+\.[a-z]{2,}$/.test(x))};delete p.autoSubmit;delete p.domains;
  await chrome.storage.local.set({profile:p,automation});document.querySelector('#saved').textContent='Saved locally.';
});
