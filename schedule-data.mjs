import {date} from './data.mjs';
export const SHIFT_START=480,SHIFT_END=990,SLOT_MINUTES=30;
export const appointmentStatuses=['Scheduled','Arrived','Completed','Blocked'];
export function clock(minutes){const h=Math.floor(minutes/60);return `${h%12||12}:${String(minutes%60).padStart(2,'0')} ${h<12?'AM':'PM'}`;}
export function slots(){return Array.from({length:(SHIFT_END-SHIFT_START)/SLOT_MINUTES},(_,i)=>({start:SHIFT_START+i*SLOT_MINUTES,end:SHIFT_START+(i+1)*SLOT_MINUTES}));}
export function localDate(now=new Date()){return [now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');}
export function appointmentKey(day,lane,start){return `${day}|${lane}|${start}`;}
export function parseScheduleStorage(raw){
  let entries;try{entries=JSON.parse(raw||'[]');}catch{throw Error('Saved schedule contains invalid JSON. Export or restore your browser data.');}
  if(!Array.isArray(entries))throw Error('Saved schedule must contain an appointment array.');
  const ids=new Set(),keys=new Set();
  return entries.map(entry=>{
    const normalized=validateAppointment(entry);
    if(typeof entry.id!=='string'||!entry.id.trim()||entry.id.length>120)throw Error('Saved appointment ID is invalid.');
    const key=appointmentKey(entry.day,entry.lane,entry.start);
    if(ids.has(entry.id)||keys.has(key))throw Error('Saved schedule contains duplicate appointment IDs or slots.');
    if(entry.end!==undefined&&entry.end!==normalized.end)throw Error('Saved appointment end time is invalid.');
    ids.add(entry.id);keys.add(key);return normalized;
  });
}
export function assertAppointmentUnchanged(original,entries){
  if(!original)return;
  const current=entries.find(entry=>entry.id===original.id),fields=['id','day','lane','start','end','patientRef','visit','status'];
  if(!current||fields.some(field=>current[field]!==original[field]))throw Error('This appointment changed in another tab. Close and reopen the slot.');
}
export function validateAppointment(entry,appointments=[],editingId=''){
  if(!entry||typeof entry.day!=='string'||date(entry.day)!==entry.day)throw Error('Choose a valid appointment date.');
  if(!['A','B'].includes(entry.lane))throw Error('Choose schedule A or B.');
  if(!Number.isInteger(entry.start)||entry.start<SHIFT_START||entry.start>=SHIFT_END||(entry.start-SHIFT_START)%SLOT_MINUTES)throw Error('Choose a 30-minute slot between 8:00 AM and 4:30 PM.');
  if(!appointmentStatuses.includes(entry.status))throw Error('Choose a valid appointment status.');
  const patientRef=String(entry.patientRef??'').trim(),visit=String(entry.visit??'').trim();
  if(entry.status!=='Blocked'&&!patientRef)throw Error('Enter a patient reference ID.');
  if(patientRef.length>40||visit.length>80)throw Error('Keep patient references under 40 characters and visit labels under 80.');
  if(appointments.some(a=>a.id!==editingId&&a.day===entry.day&&a.lane===entry.lane&&a.start===entry.start))throw Error('That schedule slot is already occupied. Choose another slot.');
  return {...entry,patientRef:entry.status==='Blocked'?'':patientRef,visit:visit|| (entry.status==='Blocked'?'Unavailable':'Appointment'),end:entry.start+SLOT_MINUTES};
}
export function scheduleStats(appointments,day){const dayEntries=appointments.filter(a=>a.day===day);const blocked=dayEntries.filter(a=>a.status==='Blocked').length,booked=dayEntries.length-blocked;return {booked,blocked,available:slots().length*2-dayEntries.length,arrived:dayEntries.filter(a=>a.status==='Arrived').length,completed:dayEntries.filter(a=>a.status==='Completed').length};}
export function demoAppointments(day){return [{lane:'A',start:480,patientRef:'DEMO-101',visit:'New visit',status:'Scheduled'},{lane:'B',start:480,patientRef:'DEMO-201',visit:'Follow-up',status:'Arrived'},{lane:'A',start:540,patientRef:'DEMO-102',visit:'Follow-up',status:'Completed'},{lane:'B',start:600,patientRef:'DEMO-202',visit:'Consultation',status:'Scheduled'},...['A','B'].flatMap(lane=>[720,750].map(start=>({lane,start,patientRef:'',visit:'Lunch break',status:'Blocked'}))),{lane:'A',start:840,patientRef:'DEMO-103',visit:'Follow-up',status:'Scheduled'},{lane:'B',start:960,patientRef:'DEMO-203',visit:'New visit',status:'Scheduled'}].map(a=>({...a,id:`demo-${a.lane}-${a.start}`,day,end:a.start+SLOT_MINUTES,demo:true}));}
