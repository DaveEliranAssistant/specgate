export function assessFit(input={}){
 const reasons=[];
 if(input.framework!=='literal')reasons.push('Use JavaScript ESM with literal app routes. Router mounts, TypeScript and other frameworks need unsupported-coverage review.');
 if(input.committed!=='yes')reasons.push('Commit the intended source first. Uncommitted and untracked files are not scanned.');
 if(!['22','24'].includes(input.node))reasons.push('Use qualified Node 22 or 24, plus Git and npm.');
 if(!['linux','macos'].includes(input.platform))reasons.push('Use Linux or macOS. Windows is not qualified.');
 return {ready:reasons.length===0,reasons};
}
if(typeof document!=='undefined'){
 const fitButton=document.getElementById('check-fit');
 fitButton.hidden=false;
 fitButton.addEventListener('click',()=>{
  const input=Object.fromEntries(['framework','committed','node','platform'].map(id=>[id,document.getElementById(id).value]));
  const result=assessFit(input),panel=document.getElementById('fit-result');
  panel.replaceChildren();const title=document.createElement('strong');title.textContent=result.ready?'Good fit for a guided pilot—not release approval.':'Needs a scope review before scanning.';panel.append(title);
  const list=document.createElement('ul');
  for(const reason of result.ready?['Next: install the published npm package, or obtain a private archive and trusted checksum from the person coordinating your pilot.']:result.reasons){const item=document.createElement('li');item.textContent=reason;list.append(item);}
  panel.append(list);panel.dataset.state=result.ready?'ready':'review';
 });
 const data=JSON.parse(document.getElementById('recordings').textContent);
 function showExample(id){
  const example=data.examples.find(item=>item.id===id);
  document.getElementById('example-state').textContent=example.exitCode===0?'DECLARED SUBSET ANALYZED':'REVIEW REQUIRED';
  document.getElementById('example-state').dataset.state=example.exitCode===0?'ready':'review';
  const descriptions={scan:'The scanner found GET /health in committed source. Exit 0 covers the declared subset; it is not a compatibility guarantee.',change:'The response literal changed from true to false. Existing check reports source-changed, not a proven consumer break. Exit 1 means human review.',unsupported:'An async handler cannot be resolved by this release candidate. Coverage is incomplete. Exit 1 means review—not PASS.'};
  document.getElementById('example-explanation').textContent=descriptions[id];
  document.getElementById('example-source').textContent=example.source;
  document.getElementById('example-report').textContent=JSON.stringify(example.report,null,2);
  document.getElementById('example-provenance').textContent=`Actual CLI ${data.toolVersion} · exit ${example.exitCode} · synthetic commit ${example.sourceCommit} · source SHA-256 ${example.sourceSha256}`;
  for(const button of document.querySelectorAll('[data-example]'))button.setAttribute('aria-pressed',String(button.dataset.example===id));
 }
 for(const button of document.querySelectorAll('[data-example]')){button.hidden=false;button.addEventListener('click',()=>showExample(button.dataset.example));}
 showExample('scan');
 const waitlist=document.getElementById('waitlist-form'),waitlistStatus=document.getElementById('waitlist-status'),waitlistError=document.getElementById('waitlist-error');
 const unavailable='The waitlist is temporarily unavailable.';
 function showWaitlistFields(fields={},message=''){
  for(const name of ['email','consent']){const error=document.getElementById(`waitlist-${name}-error`),input=document.getElementById(`waitlist-${name}`);error.textContent=fields[name]??'';error.hidden=!fields[name];if(fields[name])input.setAttribute('aria-invalid','true');else input.removeAttribute('aria-invalid');}
  waitlistError.textContent=message;waitlistError.hidden=!message;if(message)waitlistError.focus();
 }
 function closeWaitlist(message){waitlist.hidden=true;waitlistStatus.textContent=message;waitlistStatus.hidden=false;waitlistStatus.focus();}
 fetch('/api/waitlist').then(async response=>{const body=await response.json();if(response.ok&&body.available===true){waitlist.hidden=false;waitlistStatus.hidden=true;}}).catch(()=>{});
 waitlist.addEventListener('submit',async event=>{
  event.preventDefault();
  const submit=document.getElementById('waitlist-submit');submit.disabled=true;
  try{
   const response=await fetch('/api/waitlist',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:waitlist.elements.email.value,consent:waitlist.elements.consent.checked,company_website:waitlist.elements.company_website.value})});
   const body=await response.json().catch(()=>({}));
   if(response.ok)closeWaitlist(body.message||'You are on the waitlist.');
   else if(response.status===503)closeWaitlist(unavailable);
   else showWaitlistFields(body.fields,body.message||'Check the form and try again.');
  }catch{closeWaitlist(unavailable);}
  finally{submit.disabled=false;}
 });
 document.getElementById('copy-command').hidden=false;
 document.getElementById('copy-command').addEventListener('click',async()=>{
  const code=document.getElementById('scan-command'),status=document.getElementById('copy-status');
  try{await navigator.clipboard.writeText(code.textContent);status.textContent='Copied. Review the required settings before running.';}
  catch{const selection=window.getSelection(),range=document.createRange();range.selectNodeContents(code);selection.removeAllRanges();selection.addRange(range);status.textContent='Clipboard unavailable. Command selected; copy it manually.';}
 });
}
