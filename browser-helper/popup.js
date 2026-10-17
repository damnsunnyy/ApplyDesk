const TRACKER='https://damnsunnyy.github.io/ApplyDesk/';
const DEFAULT={name:'',email:'',phone:'',location:'',linkedin:'',website:''};
async function getProfile(){const d=await chrome.storage.local.get('profile');return {...DEFAULT,...d.profile};}
async function currentTab(){const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.id)throw Error('No active tab found.');return tab;}
const say=(s)=>document.querySelector('#message').textContent=s;
document.querySelector('#capture').addEventListener('click',async()=>{try{const tab=await currentTab();const [{result}]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>({url:location.href,title:document.title,text:(document.querySelector('main')?.innerText||document.body?.innerText||'').slice(0,18000)})});if(!result?.text)throw Error('No page text could be read.');const data=JSON.stringify(result);const encoded=btoa(unescape(encodeURIComponent(data)));await chrome.tabs.create({url:TRACKER+'#capture='+encoded});say('Job page captured. Review the text in Apply Desk.');}catch(e){say(e.message||'Could not capture this page.');}});
document.querySelector('#log-email').addEventListener('click',async()=>{try{const tab=await currentTab();const [{result}]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>({url:location.href,title:document.querySelector('h2.hP')?.innerText||document.title,from:document.querySelector('[email]')?.getAttribute('email')||'',text:(document.querySelector('[role="main"]')?.innerText||document.querySelector('main')?.innerText||document.body?.innerText||'').slice(0,6000)})});if(!result?.text)throw Error('No message text found. Open one email first.');const data=JSON.stringify(result);const encoded=btoa(unescape(encodeURIComponent(data)));await chrome.tabs.create({url:TRACKER+'#email='+encoded});say('Message captured. Review its suggested application update.');}catch(e){say(e.message||'Could not capture this message.');}});
document.querySelector('#fill').addEventListener('click',async()=>{try{
 const tab=await currentTab();const {profile,automation={}}=await chrome.storage.local.get(['profile','automation']);const p={...DEFAULT,...profile};
 const [{result}]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:(p,automation)=>{
  const norm=s=>(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const risky=/work authorization|authorized to work|visa sponsorship|sponsorship|salary expectation|expected salary|gender|race|ethnicity|disability|veteran|criminal|conviction|legally|under penalty|assessment|consent|terms and conditions|agree to|background check|date of birth|nationality|citizenship|eeoc|equal opportunity/;
  const visible=el=>!!(el.offsetWidth||el.offsetHeight||el.getClientRects().length);
  const labelFor=el=>{const label=[...(el.labels||[])].map(x=>x.innerText).join(' ')||el.closest('label')?.innerText||'';return `${label} ${el.name} ${el.id} ${el.getAttribute('aria-label')} ${el.placeholder} ${el.autocomplete}`;};
  const submitSelector='button[type="submit"],input[type="submit"],button:not([type])';
  const forms=[...document.forms].filter(f=>visible(f)&&f.querySelector(submitSelector));
  const appContext=/application|apply for|apply to|careers|job opening|position|candidate/i.test(`${document.title} ${document.querySelector('h1,h2')?.innerText||''}`);
  const appForms=forms.filter(f=>{const fields=[...f.querySelectorAll('input,textarea,select')].map(el=>`${el.name} ${el.id} ${el.placeholder} ${el.getAttribute('aria-label')}`).join(' ');const applicationFields=/application|applicant|candidate|resume|cv\b|cover letter|first name|last name|linkedin|phone/i.test(norm(fields));return /apply now|submit application|send application|apply for/i.test(f.innerText||'')||(appContext&&applicationFields);});
  const form=appForms.length===1?appForms[0]:forms.length===1?forms[0]:null;
  if(!form)return {filled:0,submitted:false,missing:[],reason:'Could not identify one application form on this page.'};
  const controls=[...form.querySelectorAll('input:not([type="hidden"]):not([type="password"]),textarea,select')].filter(el=>visible(el)||el.required);
  let filled=0;const missing=[];const recognized=[];
  const fields=controls.filter(el=>el.type!=='radio');
  for(const el of fields){
   if(el.disabled||el.readOnly||el.type==='file')continue;
   const key=norm(labelFor(el));
   if(risky.test(key)){if(el.required&&!el.checkValidity())missing.push('sensitive or declaration question');continue;}
   const companyOrOrg=/company|employer|organization|organisation|recruiter|hiring manager/.test(key);
   let value='';
   if(!companyOrOrg&&/first name/.test(key))value=(p.name||'').trim().split(/\s+/)[0]||'';
   else if(!companyOrOrg&&/last name|family name|surname/.test(key))value=(p.name||'').trim().split(/\s+/).slice(1).join(' ');
   else if(!companyOrOrg&&/(full name|your name|legal name|^name\b)/.test(key))value=p.name||'';
   else if(!companyOrOrg&&/linkedin|linked in/.test(key))value=p.linkedin||'';
   else if(!companyOrOrg&&/portfolio|personal website|personal url/.test(key))value=p.website||'';
   else if(!companyOrOrg&&/city|location|address/.test(key))value=p.location||'';
   else if(!companyOrOrg&&(el.type==='email'||/e mail|email address/.test(key)))value=p.email||'';
   else if(!companyOrOrg&&(el.type==='tel'||/phone|mobile|telephone|contact number/.test(key)))value=p.phone||'';
   if(value&&!el.value){
    if(el instanceof HTMLSelectElement){const option=[...el.options].find(o=>norm(o.value)===norm(value)||norm(o.text)===norm(value));if(option)el.value=option.value;else value='';}
    else {const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value')?.set?.call(el,value);}
    if(value){el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));filled++;}
   }
   if(value)recognized.push(el);
   if(el.required&&!el.checkValidity())missing.push(key||'required field');
  }
  const radios=[...new Set(controls.filter(el=>el.type==='radio'&&el.name).map(el=>el.name))];
  for(const name of radios){const group=controls.filter(el=>el.type==='radio'&&el.name===name);if(group.some(el=>el.required)&&!group.some(el=>el.checked))missing.push(labelFor(group[0])||'required choice');}
  const requiredFiles=[...form.querySelectorAll('input[type="file"][required]')];if(requiredFiles.some(el=>!el.files?.length))missing.push('required résumé or file upload');
  const host=location.hostname.toLowerCase();const approved=(automation.domains||[]).some(d=>host===String(d).toLowerCase());
  const buttons=[...form.querySelectorAll(submitSelector)].filter(visible);
  const submit=buttons.find(b=>/apply now|submit application|send application|submit|send my application/i.test(b.innerText||b.value||''));
  const hasRisk=risky.test(norm(form.innerText+' '+[...form.querySelectorAll('label')].map(x=>x.innerText).join(' ')));
  const applicationSignal=appForms.length===1&&appForms[0]===form;
  const uniqueApplicationForm=appForms.length===1&&appForms[0]===form;
  if(automation.autoSubmit&&approved&&uniqueApplicationForm&&filled>0&&recognized.length>0&&!missing.length&&!hasRisk&&applicationSignal&&submit){submit.click();return {filled,submitted:true,missing:[],approved};}
  return {filled,submitted:false,missing:[...new Set(missing)],approved,reason:missing.length?'Some required answers or uploads need you.':automation.autoSubmit&&!approved?'This hostname is not approved for auto-submit.':automation.autoSubmit&&hasRisk?'This form includes a sensitive declaration; review and submit it yourself.':automation.autoSubmit&&!applicationSignal?'This page does not look clearly like a job application.':'Review the filled fields, then submit on the site.'};
 },args:[p,automation]});
 if(result.submitted)say(`Submitted on approved ${tab.url?new URL(tab.url).hostname:'site'} with ${result.filled} known fields. Check for the site's confirmation.`);
 else if(result.filled)say(`Filled ${result.filled} fields. ${result.reason||''}`);
 else say(result.reason||'No blank fields matched confidently. Check the page manually.');
}catch(e){say(e.message||'Could not fill this page.');}});
document.querySelector('#settings').addEventListener('click',()=>chrome.runtime.openOptionsPage());
