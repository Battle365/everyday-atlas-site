import {clock,slots,localDate,validateAppointment,scheduleStats,demoAppointments,parseScheduleStorage,assertAppointmentUnchanged} from './schedule-data.mjs';
import {csv} from './data.mjs';
const KEY='atlas-clinic-schedule-v1',SETTINGS='atlas-clinic-company-v1';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function initSchedule(){
  const $=id=>document.getElementById(id);let settings={enabled:false,company:'Your clinic',A:'Schedule A',B:'Schedule B'},appointments=[],selected=null,showDemo=new URLSearchParams(location.search).get('schedule')==='preview',storageAvailable=true;
  const readAppointments=()=>parseScheduleStorage(localStorage.getItem(KEY)||'[]');
  try{settings={...settings,...JSON.parse(localStorage.getItem(SETTINGS)||'{}')};appointments=readAppointments();}catch{storageAvailable=false;}
  $('schedule-date').value=localDate();$('schedule-enabled').checked=!!settings.enabled;
  $('company-name').value=settings.company;$('lane-a-name').value=settings.A;$('lane-b-name').value=settings.B;
  const notice=s=>{$('schedule-message').textContent=s;};
  const currentEntries=()=>showDemo?demoAppointments($('schedule-date').value):appointments;
  const persist=next=>{if(!storageAvailable)throw Error('Browser storage is unavailable. Enable storage before saving appointments.');localStorage.setItem(KEY,JSON.stringify(next));appointments=next;};
  function render(){
    const enabled=!!settings.enabled;$('schedule-body').hidden=!enabled&&!showDemo;$('schedule-off').hidden=enabled||showDemo;
    $('schedule-company').textContent=settings.company;$('schedule-preview-label').hidden=!showDemo;
    $('schedule-demo').textContent=showDemo?'Return to my schedule':'Preview sample layout';
    const day=$('schedule-date').value||localDate(),data=currentEntries(),summary=scheduleStats(data,day);
    $('schedule-counts').textContent=`${summary.booked} booked · ${summary.available} available · ${summary.blocked} blocked · ${summary.completed} completed`;
    $('schedule-head-a').textContent=settings.A;$('schedule-head-b').textContent=settings.B;
    $('schedule-rows').innerHTML=slots().map(slot=>`<tr><th scope="row"><span>${clock(slot.start)}</span><small>to ${clock(slot.end)}</small></th>${['A','B'].map(lane=>{
      const entry=data.find(a=>a.day===day&&a.lane===lane&&a.start===slot.start);
      return `<td><button type="button" class="schedule-slot ${entry?'slot-'+entry.status.toLowerCase():'slot-open'}" data-lane="${lane}" data-start="${slot.start}" aria-label="${esc(settings[lane])}, ${clock(slot.start)} to ${clock(slot.end)}, ${entry?esc((entry.patientRef||entry.visit)+', '+entry.status):'available'}"><strong>${entry?esc(entry.patientRef||entry.visit):'+ Available'}</strong><span>${entry?esc(entry.status==='Blocked'?'Blocked':entry.visit+' · '+entry.status):'30-minute appointment'}</span></button></td>`;
    }).join('')}</tr>`).join('');
    $('schedule-storage-note').textContent=showDemo?'Fictional patient references · preview changes are not saved.':'Appointments and company settings are saved in this browser. Use patient reference IDs. Shared team access requires a connected backend.';
  }
  $('schedule-enabled').onchange=()=>{const next={...settings,enabled:$('schedule-enabled').checked};try{localStorage.setItem(SETTINGS,JSON.stringify(next));settings=next;showDemo=false;notice(settings.enabled?'A/B scheduling enabled for this browser.':'Scheduling is off. Saved appointments are retained.');render();}catch{ $('schedule-enabled').checked=settings.enabled;notice('Browser storage is unavailable; scheduling settings could not be saved.');}};
  $('schedule-settings').onsubmit=e=>{e.preventDefault();const next={...settings,company:$('company-name').value.trim()||'Your clinic',A:$('lane-a-name').value.trim()||'Schedule A',B:$('lane-b-name').value.trim()||'Schedule B'};try{localStorage.setItem(SETTINGS,JSON.stringify(next));settings=next;render();notice('Company labels saved on this device.');}catch{notice('Could not save company labels.');}};
  $('schedule-date').onchange=()=>{if(!$('schedule-date').value)$('schedule-date').value=localDate();render();};
  $('schedule-today').onclick=()=>{$('schedule-date').value=localDate();render();};
  $('schedule-demo').onclick=()=>{showDemo=!showDemo;render();notice(showDemo?'Sample layout only. Your saved appointments are unchanged.':'Showing your saved schedule.');};
  $('schedule-rows').onclick=e=>{const button=e.target.closest('[data-lane]');if(!button)return;
    if(showDemo){notice('This is the sample layout. Select “Return to my schedule” to add or edit appointments.');return;}
    try{appointments=readAppointments();}catch{notice('Could not read saved appointments.');return;}
    const day=$('schedule-date').value,lane=button.dataset.lane,start=Number(button.dataset.start),entry=appointments.find(a=>a.day===day&&a.lane===lane&&a.start===start);
    selected={day,lane,start,id:entry?.id||'',original:entry?structuredClone(entry):null};$('appointment-title').textContent=entry?'Edit appointment slot':'Book appointment slot';$('appointment-slot-label').textContent=`${day} · ${settings[lane]} · ${clock(start)}–${clock(start+30)}`;
    $('patient-reference').value=entry?.patientRef||'';$('visit-label').value=entry?.visit||'';$('appointment-status').value=entry?.status||'Scheduled';$('appointment-error').textContent='';$('clear-appointment').hidden=!entry;syncBlocked();$('appointment-dialog').showModal();
  };
  function syncBlocked(){const blocked=$('appointment-status').value==='Blocked';$('patient-reference').required=!blocked;$('patient-reference').disabled=blocked;$('visit-label').placeholder=blocked?'Lunch / meeting / unavailable':'New visit / follow-up';}
  $('appointment-status').onchange=syncBlocked;$('cancel-appointment').onclick=()=>$('appointment-dialog').close();
  $('appointment-form').onsubmit=e=>{e.preventDefault();if(!selected)return;try{
    const latest=readAppointments(),existing=latest.find(a=>a.id===selected.id);
    assertAppointmentUnchanged(selected.original,latest);
    const {original,...slot}=selected;const entry=validateAppointment({...slot,id:selected.id||crypto.randomUUID(),patientRef:$('patient-reference').value,visit:$('visit-label').value,status:$('appointment-status').value},latest,selected.id);
    persist([...latest.filter(a=>a.id!==selected.id),entry]);$('appointment-dialog').close();render();notice('Appointment slot saved.');
  }catch(error){$('appointment-error').textContent=error.message;}};
  $('clear-appointment').onclick=()=>{if(!selected?.id||!confirm('Clear this appointment slot from this browser?'))return;try{const latest=readAppointments();assertAppointmentUnchanged(selected.original,latest);persist(latest.filter(a=>a.id!==selected.id));$('appointment-dialog').close();render();notice('Appointment slot cleared.');}catch(error){$('appointment-error').textContent=error.message;}};
  $('export-schedule').onclick=()=>{const day=$('schedule-date').value,rows=currentEntries().filter(a=>a.day===day).sort((a,b)=>a.start-b.start||a.lane.localeCompare(b.lane)).map(a=>({Company:settings.company,Date:a.day,Schedule:settings[a.lane],Start:clock(a.start),End:clock(a.end),'Patient reference':a.patientRef,Visit:a.visit,Status:a.status}));const columns=['Company','Date','Schedule','Start','End','Patient reference','Visit','Status'];const url=URL.createObjectURL(new Blob([csv(columns,rows)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`${showDemo?'demo-':''}clinic-schedule-${day}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  window.addEventListener('storage',e=>{if(e.key===KEY||e.key===SETTINGS){try{appointments=readAppointments();settings={...settings,...JSON.parse(localStorage.getItem(SETTINGS)||'{}')};$('schedule-enabled').checked=!!settings.enabled;render();notice('Schedule refreshed from another browser tab.');}catch{notice('Could not refresh the schedule.');}}});
  if(!storageAvailable)notice('Browser storage is unavailable. Saved scheduling data could not be loaded.');
  render();
}
