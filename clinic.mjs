import {complete,date,number,normalize} from './data.mjs';

export function clinicKind(columns){
  const has=re=>columns.some(c=>re.test(c));
  if(has(/^(on hand|stock|quantity on hand)$/i)&&has(/^(reorder level|minimum stock|minimum)$/i))return 'supplies';
  if(has(/renewal|expiration|expiry/i))return 'renewals';
  if(has(/^(task|checklist item|action)$/i))return 'tasks';
  if(has(/^(vendor|invoice|invoice number)$/i)&&has(/^(amount|cost|total|balance)$/i))return 'bills';
  return '';
}

export function clinicMetrics(columns,rows,today){
  const kind=clinicKind(columns);if(!kind)return null;
  const field=re=>columns.find(c=>re.test(c));
  const status=field(/^(status|paid|completed|done)$/i),due=field(/due date|renewal date|expiration|expiry/i);
  const done=r=>status&&(complete(r[status])||/^(renewed|closed)$/i.test(String(r[status]).trim()));
  const addDays=n=>new Date(Date.parse(today+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
  const open=r=>status&&String(r[status]??'').trim()&&!done(r);
  const late=rows.filter(r=>open(r)&&date(r[due])&&date(r[due])<today).length;
  const soon=n=>rows.filter(r=>open(r)&&date(r[due])&&date(r[due])>=today&&date(r[due])<=addDays(n)).length;
  const finished=rows.filter(done).length;
  if(kind==='bills'){
    const amount=field(/^(amount|cost|total|balance)$/i),total=rows.reduce((n,r)=>n+(number(r[amount])??0),0);
    const unpaid=rows.filter(r=>status&&String(r[status]).trim()&&!done(r));
    return {kind,stats:[['Total billed',total,'Source currency · current view','◈'],['Unpaid amount',status?unpaid.reduce((n,r)=>n+(number(r[amount])??0),0):'—','Rows with an open payment status','↗'],['Paid invoices',finished,'Marked paid or completed','✓'],['Overdue invoices',status&&due?late:'—','Open invoices before today','◷']]};
  }
  if(kind==='supplies'){
    const stock=field(/^(on hand|stock|quantity on hand)$/i),minimum=field(/^(reorder level|minimum stock|minimum)$/i);
    const known=rows.filter(r=>number(r[stock])!==null&&number(r[minimum])!==null);
    const low=known.filter(r=>number(r[stock])<number(r[minimum])).length;
    return {kind,stats:[['Supply items',rows.length,'Items in the current view','▤'],['Below reorder level',low,'Stock is below its listed minimum','↓'],['Out of stock',rows.filter(r=>number(r[stock])!==null&&number(r[stock])<=0).length,'Items with zero or negative stock','◷'],['At or above minimum',known.length-low,`${rows.length-known.length} items have missing stock values`,'✓']]};
  }
  return {kind,stats:kind==='tasks'?[['Team tasks',rows.length,'Tasks in the current view','▤'],['Completed',finished,'Marked done or completed','✓'],['Overdue tasks',due&&status?late:'—','Open tasks before today','◷'],['Due in 7 days',due&&status?soon(7):'—','Open tasks · today through day 7','↗']]:[['Renewals tracked',rows.length,'Renewal records in this view','▤'],['Past due',due&&status?late:'—','Open renewal dates before today','◷'],['Due in 30 days',due&&status?soon(30):'—','Open renewals · next 30 days','↗'],['Renewed / completed',finished,'Marked renewed or completed','✓']]};
}

export function clinicSamples(anchor=new Date()){
  const localDay=new Date(Date.UTC(anchor.getFullYear(),anchor.getMonth(),anchor.getDate()));
  const day=n=>new Date(+localDay+n*86400000).toISOString().slice(0,10);
  const samples=[
    ['Vendor bills & receipts','bills',[['Invoice','Vendor','Category','Amount','Status','Due date'],['INV-1001','Northside Medical Supply','Clinical supplies',486.5,'Paid',day(-18)],['INV-1002','Clearview Cleaning','Facilities',325,'Unpaid',day(-4)],['INV-1003','Practice Software Co.','Software',249,'Paid',day(-12)],['INV-1004','Northside Medical Supply','Clinical supplies',172.8,'Unpaid',day(5)],['INV-1005','Office Essentials','Office supplies',84.25,'Paid',day(-2)],['INV-1006','Building Services','Facilities',210,'Unpaid',day(12)]]],
    ['Supply stock','supplies',[['Item','Category','On hand','Reorder level','Unit','Vendor','Last checked'],['Nitrile gloves','Exam room',8,12,'Boxes','Northside Medical Supply',day(-1)],['Procedure masks','Exam room',18,10,'Boxes','Northside Medical Supply',day(-1)],['Gauze pads','Treatment room',0,6,'Boxes','Northside Medical Supply',day(0)],['Surface wipes','Cleaning',9,4,'Boxes','Clearview Cleaning',day(-2)],['Cotton swabs','Treatment room',3,5,'Boxes','Northside Medical Supply',day(0)],['Printer paper','Office',12,5,'Boxes','Office Essentials',day(-3)]]],
    ['Team tasks','tasks',[['Task','Category','Owner','Status','Due date'],['Reconcile vendor invoices','Administration','Office manager','Done',day(-3)],['Restock exam rooms','Supplies','Clinic assistant','In progress',day(1)],['Confirm service appointment','Facilities','Front desk','To do',day(-1)],['Review next week staffing','Administration','Office manager','To do',day(4)],['File equipment service receipt','Facilities','Clinic assistant','Done',day(-2)],['Update supply count','Supplies','Clinic assistant','To do',day(8)]]],
    ['Renewal tracker','renewals',[['Renewal','Category','Owner','Status','Renewal date','Amount'],['Equipment service agreement','Equipment','Office manager','Pending',day(21),480],['Software subscription','Software','Office manager','Renewed',day(-7),249],['Facility maintenance agreement','Facilities','Office manager','Pending',day(-3),320],['Waste collection agreement','Facilities','Office manager','Pending',day(45),165],['Office lease review','Facilities','Practice owner','Pending',day(90),0]]]
  ];
  return samples.map(([name,kind,matrix])=>({name,kind,...normalize(matrix)}));
}
