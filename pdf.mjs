import {date,number,normalize} from './data.mjs';

// Reconstruct visual lines without sending document bytes to a service.
export function textLines(items){
  const lines=[];
  for(const item of items){
    if(!item.str?.trim()||!item.transform)continue;
    const x=item.transform[4],y=item.transform[5],height=Math.abs(item.transform[3])||10;
    let line=lines.find(l=>Math.abs(l.y-y)<=Math.min(3,height*.3));
    if(!line){line={y,items:[]};lines.push(line);}
    line.items.push({text:item.str.trim(),x,width:item.width||0,height});
  }
  return lines.sort((a,b)=>b.y-a.y).map(line=>{
    const pieces=line.items.sort((a,b)=>a.x-b.x),cells=[];
    for(const p of pieces){const previous=cells.at(-1);if(previous&&p.x-previous.end<Math.max(12,p.height*1.2)){previous.text+=' '+p.text;previous.end=p.x+p.width;}else cells.push({text:p.text,x:p.x,end:p.x+p.width});}
    return {text:cells.map(c=>c.text).join('  '),cells};
  });
}

export function lineFacts(text){
  const iso=text.match(/\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/),us=text.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/);
  const money=text.match(/\(?[-+]?[$€£¥]\s*\d[\d,]*(?:\.\d{2})?\)?/g)||text.match(/(?<![\d./-])\(?-?\b\d[\d,]*\.\d{2}\b\)?(?![\d./])/g)||[];
  const status=/\b(unpaid|not(?: yet)? paid|outstanding|past due)\b/i.test(text)?'Unpaid':/\b(paid|payment received)\b/i.test(text)?'Paid':/\b(not(?: yet)? (?:done|completed|submitted)|incomplete)\b/i.test(text)?'Pending':/\b(done|completed|submitted)\b/i.test(text)?'Done':/\b(in progress|pending|to do)\b/i.test(text)?'Pending':'';
  return {Amount:money.length===1?number(money[0]):'',Date:date(iso?.[0]||us?.[0])||'',Status:status};
}

export function pagesToDataset(pages){
  // Only use table mode when a recognizable header is followed by aligned rows.
  const candidateHeaders=/\b(description|item|amount|cost|price|date|status|category|task|chore|subject|assignment|quantity|qty|total|owner|name)\b/i;
  let header,rows=[];
  for(const page of pages){
    for(let i=0;i<page.lines.length;i++){
      const line=page.lines[i];
      if(!header&&line.cells.length>=2&&line.cells.length<=20&&line.cells.some(c=>candidateHeaders.test(c.text))&&line.cells.every(c=>number(c.text)===null&&!date(c.text))){
        const next=page.lines[i+1];
        if(next?.cells.length===line.cells.length&&next.cells.every((c,j)=>Math.abs(c.x-line.cells[j].x)<24)){header=line.cells;continue;}
      }
      if(!header||line.cells.length!==header.length||!line.cells.every((c,j)=>Math.abs(c.x-header[j].x)<24))continue;
      if(line.cells.every((c,j)=>c.text.toLowerCase()===header[j].text.toLowerCase()))continue;
      rows.push([...line.cells.map(c=>c.text),`Page ${page.number}`]);
    }
  }
  const missing=pages.filter(p=>!p.lines.length).map(p=>p.number);
  if(header&&rows.length){return {...normalize([[...header.map(c=>c.text),'Source page'],...rows]),mode:'table',missingPages:missing};}
  const records=pages.flatMap(p=>p.lines.map(l=>({Page:`Page ${p.number}`,Text:l.text,...lineFacts(l.text)})));
  if(!records.length)throw Error('This PDF has no selectable text. It may be a scan or photo. Run OCR in a PDF tool, save a searchable PDF, and drop it here again.');
  if(records.length>50000)throw Error('Please split PDFs into 50,000 text lines or fewer.');
  return {columns:['Page','Text','Amount','Date','Status'],rows:records,mode:'lines',missingPages:missing};
}

export async function extractPdf(file,onProgress=()=>{},library){
  const pdfjs=library||await import('./vendor/pdfjs/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.mjs',import.meta.url).href;
  const loading=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,cMapUrl:new URL('./vendor/pdfjs/cmaps/',import.meta.url).href,cMapPacked:true,standardFontDataUrl:new URL('./vendor/pdfjs/standard_fonts/',import.meta.url).href,wasmUrl:new URL('./vendor/pdfjs/wasm/',import.meta.url).href});
  let document;
  try{
    document=await loading.promise;
    if(document.numPages>150)throw Error('Please split PDFs into 150 pages or fewer.');
    const pages=[];let count=0;
    for(let n=1;n<=document.numPages;n++){
      onProgress(`Reading ${file.name} · page ${n} of ${document.numPages}…`);
      const page=await document.getPage(n),content=await page.getTextContent();
      const lines=textLines(content.items);count+=lines.length;
      if(count>50000)throw Error('Please split PDFs into 50,000 text lines or fewer.');
      pages.push({number:n,lines});page.cleanup();
    }
    const result=pagesToDataset(pages);
    return {...result,pdf:{pageCount:pages.length,text:pages.map(p=>`Page ${p.number}\n${p.lines.map(l=>l.text).join('\n')}`).join('\n\n'),mode:result.mode,missingPages:result.missingPages},sourceBlob:file};
  }catch(e){
    if(e.name==='PasswordException')throw Error('This PDF is password-protected. Save an unlocked copy and import it again.');
    if(e.name==='InvalidPDFException')throw Error('This file could not be read as a PDF. Try exporting a fresh PDF copy.');
    throw e;
  }finally{await loading.destroy();}
}
