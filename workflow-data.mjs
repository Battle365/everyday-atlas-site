// Pure workflow rules. Production authorization and revisions must also be enforced by the server.
export class WorkflowConflict extends Error { constructor(message){super(message);this.name='WorkflowConflict';this.code='conflict';} }
function text(value,label,max=120){if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw Error(`${label} is required and must be ${max} characters or fewer.`);return value.trim();}
export function validateDefinition(input){
  if(!input||!Array.isArray(input.steps)||!input.steps.length||input.steps.length>30)throw Error('A workflow needs 1–30 steps.');
  const id=text(input.id,'Workflow ID'),companyId=text(input.companyId,'Company ID'),name=text(input.name,'Workflow name',80);
  if(!Number.isSafeInteger(input.revision)||input.revision<1)throw Error('Workflow revision must be a positive integer.');
  const seen=new Set();const steps=input.steps.map(step=>{const id=text(step?.id,'Step ID');if(seen.has(id))throw Error('Step IDs must be unique.');seen.add(id);if(!['task','approval'].includes(step.type))throw Error('Choose task or approval for each step.');return {id,title:text(step.title,'Step title',120),role:text(step.role,'Responsible role',80),type:step.type};});
  return {id,companyId,name,revision:input.revision,steps};
}
export function createInstance(definition,{id,title,startedBy},now=new Date().toISOString()){
  const snapshot=validateDefinition(definition);if(!Number.isFinite(Date.parse(now)))throw Error('Invalid workflow start time.');
  return {id:text(id,'Work item ID'),companyId:snapshot.companyId,definitionId:snapshot.id,definition:snapshot,title:text(title,'Work item title'),revision:1,status:'Active',stepIndex:0,history:[{action:'started',userId:text(startedBy,'Started by'),at:now}],receipts:[]};
}
export function parseWorkflowStorage(raw){
  if(typeof raw!=='string'||raw.length>2*1024*1024)throw Error('Saved workflow data exceeds the local preview limit.');
  let data;try{data=JSON.parse(raw);}catch{throw Error('Saved workflows contain invalid JSON.');}
  if(!data||!Array.isArray(data.definitions)||!Array.isArray(data.instances))throw Error('Saved workflows must contain definitions and work items.');
  const definitions=data.definitions.map(validateDefinition),seenDefinitions=new Set(),seenInstances=new Set();
  for(const definition of definitions){const key=JSON.stringify([definition.companyId,definition.id]);if(seenDefinitions.has(key))throw Error('Saved workflow definitions have duplicate IDs.');seenDefinitions.add(key);}
  for(const item of data.instances){
    if(!item||typeof item!=='object')throw Error('Saved work item is invalid.');
    text(item.id,'Work item ID');text(item.title,'Work item title');const definition=validateDefinition(item.definition);
    if(item.companyId!==definition.companyId||item.definitionId!==definition.id)throw Error('Saved work item company or definition does not match.');
    const key=JSON.stringify([item.companyId,item.id]);if(seenInstances.has(key))throw Error('Saved work items have duplicate IDs.');seenInstances.add(key);
    if(!Number.isInteger(item.stepIndex)||item.stepIndex<0||item.stepIndex>definition.steps.length||!['Active','Completed','Rejected'].includes(item.status))throw Error('Saved workflow state is invalid.');
    if(item.status==='Completed'&&item.stepIndex!==definition.steps.length||item.status!=='Completed'&&item.stepIndex>=definition.steps.length)throw Error('Saved workflow step does not match its status.');
    if(!Array.isArray(item.history)||!Array.isArray(item.receipts)||item.history.length!==item.revision||item.receipts.length!==item.revision-1||item.revision<1||item.revision>definition.steps.length+1)throw Error('Saved workflow revision history is invalid.');
  }
  return {definitions,instances:data.instances};
}
export function transition(instance,{action,actor,expectedRevision,requestId},now=new Date().toISOString()){
  if(!instance||actor?.companyId!==instance.companyId)throw Error('This work item belongs to another company.');
  const userId=text(actor.userId,'Acting user'),operation=text(requestId,'Request ID');
  const prior=instance.receipts?.find(r=>r.id===operation);
  if(prior){if(prior.action!==action||prior.userId!==userId||prior.expectedRevision!==expectedRevision)throw Error('Request ID was already used for a different action or revision.');return instance;}
  if(instance.revision!==expectedRevision)throw new WorkflowConflict('This workflow changed. Refresh it before retrying.');
  if(instance.status!=='Active')throw Error('This workflow is already finished.');
  const step=instance.definition.steps[instance.stepIndex];
  if(!step||!Array.isArray(actor.roles)||!actor.roles.includes(step.role))throw Error('The current step requires its responsible role.');
  if(step.type==='task'&&action!=='complete'||step.type==='approval'&&!['approve','reject'].includes(action))throw Error('This action does not match the current workflow step.');
  if(!Number.isFinite(Date.parse(now)))throw Error('Invalid workflow action time.');
  const next=structuredClone(instance);next.revision++;next.history.push({action,stepId:step.id,userId,role:step.role,at:now});next.receipts.push({id:operation,action,userId,expectedRevision});
  if(action==='reject')next.status='Rejected';
  else{next.stepIndex++;if(next.stepIndex===next.definition.steps.length)next.status='Completed';}
  return next;
}
export function workflowTemplate(companyId,id='vendor-approval'){
  return validateDefinition({id,companyId,name:'Vendor invoice review',revision:1,steps:[{id:'prepare',title:'Prepare invoice and receipt',role:'Clinic assistant',type:'task'},{id:'review',title:'Review expense',role:'Office manager',type:'approval'},{id:'pay',title:'Record payment',role:'Finance',type:'task'}]});
}
