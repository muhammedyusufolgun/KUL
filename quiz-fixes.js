/* Android question/answer reliability layer - loaded AFTER original app script.
   OCR matching coverage is not proof of semantic correctness: confirm against the source. */
(() => {
'use strict';
const el=id=>document.getElementById(id);
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const collapse=s=>String(s??'').normalize('NFKC').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
const expectedLetters=n=>n===5?['A','B','C','D','E']:['A','B','C','D'];
function strictQuestion(raw) {
  const q={...raw, options:[],letters:[],selected:null,correct:null,correctLetter:null,matchSource:null};
  const rawOptions=Array.isArray(raw.options)?raw.options:[];
  const rawLetters=Array.isArray(raw.letters)?raw.letters:[];
  const count=rawOptions.length;
  if(![4,5].includes(count))return {ok:false,reason:'Şık sayısı eksik veya fazla ('+count+'). Dört ya da beş şık gerekli.'};
  const letters=rawLetters.map(x=>collapse(x).toUpperCase());
  const values=rawOptions.map(collapse);
  const expected=expectedLetters(count);
  if(letters.join(',')!==expected.join(','))return {ok:false,reason:'Şık harfleri eksik, yinelenmiş veya sırasız.'};
  if(values.some(x=>!x))return {ok:false,reason:'Boş şık bulundu.'};
  if(new Set(values.map(x=>x.toLocaleLowerCase('tr-TR'))).size!==count)return {ok:false,reason:'Aynı şık metni birden fazla okunmuş.'};
  if(values.some(x=>/(?:^|\s)[A-E]\s*[\)\].:]\s+\S/.test(x)))return {ok:false,reason:'İç içe geçmiş şık bulundu.'};
  if(collapse(raw.text).length<4)return {ok:false,reason:'Soru metni okunamadı.'};
  q.options=values; q.letters=letters; q.text=collapse(raw.text);
  const preferred=collapse(raw.correctLetter||(
    Number.isInteger(raw.correct)?letters[raw.correct]:''
  )).toUpperCase();
  const idx=letters.indexOf(preferred);
  if(idx>=0){
    q.correct=idx;q.correctLetter=preferred;
    q.matchSource=raw.matchSource==='manual'?'manual':'auto';
  }
  return {ok:true,question:q};
}
function keyData(source) {
  const raw=String(source||'').normalize('NFKC').replace(/\r/g,'\n');
  const map=new Map(),conflicts=new Set();
  const pair=/(?:^|[\s,;|])(?:Soru\s*)?(\d{1,4})\s*(?:[.)\-:]|\s)\s*([A-E])(?=$|[\s,;|.)])/gi;
  let m;
  while((m=pair.exec(raw))!==null){
    const n=Number(m[1]),letter=m[2].toUpperCase();
    if(map.has(n)&&map.get(n)!==letter)conflicts.add(n);
    else map.set(n,letter);
  }
  for(const n of conflicts)map.delete(n);
  const sequential=raw.split(/\n/).map(collapse).filter(x=>/^[A-E][.)]?$/.test(x)).map(x=>x[0]);
  return {map,conflicts,sequential};
}
function parseReport(questionText,answerText) {
  const raw=String(questionText||'').normalize('NFKC').replace(/\r/g,'\n').replace(/\u00a0/g,' ');
  const keyMarker=/(?:^|\n)\s*(?:cevap\s*anahtar[ıi]|answer\s*key)\s*[:\-\n]/i;
  const found=keyMarker.exec(raw);
  const questionPart=found?raw.slice(0,found.index):raw;
  const inlineKey=found?raw.slice(found.index):'';
  const answerKeys=keyData(String(answerText||'')+'\n'+inlineKey);
  const lines=questionPart.split(/\n/).map(collapse).filter(Boolean);
  const blocks=[],skipped=[];
  let current=null,unreadableFragments=0;
  const push=()=>{if(current){blocks.push(current);current=null}};
  for(const line of lines){
    if(/^\d{1,4}\s*[.:\-]\s*[A-E]\s*$/i.test(line))continue;
    const qm=/^(?:(?:Soru|S)\s*[:#]?\s*)?(\d{1,4})\s*[.)\-:]\s*(.*)$/i.exec(line);
    if(qm){
      push();
      current={n:Number(qm[1]),lines:[qm[2]]};
    }else if(current){current.lines.push(line)}
    else if(/^(?:Soru|Question)\s*[:#]?\s*[^\d\s]/i.test(line))unreadableFragments++;
  }
  push();
  if(!blocks.length && questionPart.trim())unreadableFragments=Math.max(1,unreadableFragments);
  const questions=[],used=new Set(),usedNums=new Set();
  for(const block of blocks){
    const opts=[],stem=[];
    let sawOptions=false;
    for(const line of block.lines){
      // A) ... B) ... on one OCR row, or one choice per row.
      const markers=[...line.matchAll(/(?:^|[\s;|])([A-E])\s*[\)\].:]\s*/gi)];
      if(!markers.length){
        if(sawOptions && opts.length)opts[opts.length-1].text+=' '+line;
        else stem.push(line);
        continue;
      }
      const leading=line.slice(0,markers[0].index).trim();
      if(leading){
        if(sawOptions && opts.length)opts[opts.length-1].text+=' '+leading;
        else stem.push(leading);
      }
      for(let i=0;i<markers.length;i++){
        const marker=markers[i],end=i+1<markers.length?markers[i+1].index:line.length;
        opts.push({letter:marker[1].toUpperCase(),text:line.slice(marker.index+marker[0].length,end).trim()});
      }
      sawOptions=true;
    }
    const source={n:block.n,text:stem.join(' ').trim(),letters:opts.map(x=>x.letter),options:opts.map(x=>x.text)};
    if(usedNums.has(block.n)){
      skipped.push({n:block.n,reason:'Aynı soru numarası birden çok kez okundu.'});
      const previous=questions.findIndex(q=>q.n===block.n);
      if(previous>=0)questions.splice(previous,1);
      continue;
    }
    usedNums.add(block.n);
    const auto=answerKeys.map.get(block.n) || (
      answerKeys.sequential.length>=block.n ? answerKeys.sequential[block.n-1] : ''
    );
    source.correctLetter=answerKeys.conflicts.has(block.n)?null:(auto||null);
    const validated=strictQuestion(source);
    if(!validated.ok){skipped.push({n:block.n,reason:validated.reason});continue}
    const q=validated.question;
    if(used.has(block.n)){skipped.push({n:block.n,reason:'Çift soru numarası.'});continue}
    questions.push(q);used.add(block.n);
  }
  // In case a duplicate number appears after a previously accepted question.
  const blocked=new Set(skipped.filter(x=>x.reason.startsWith('Aynı soru numarası')).map(x=>x.n));
  const valid=questions.filter(q=>!blocked.has(q.n));
  if(unreadableFragments)skipped.push({n:null,reason:'Numarası okunamayan '+unreadableFragments+' soru/bölüm'});
  return {questions:valid,skipped,detected:blocks.length+unreadableFragments,auto:valid.filter(q=>q.matchSource==='auto').length};
}
normalizeQuestionChoices=function(q){
 const v=strictQuestion(q);
 return v.ok?v.question:{...q,options:[],letters:[],correct:null,correctLetter:null,selected:null,invalidReason:v.reason}
};
isMatched=function(q){return strictQuestion(q).ok && Number.isInteger(q.correct) && q.letters[q.correct]===q.correctLetter};
allAnswersMatched=function(){return data.questions.length>0 && data.questions.every(isMatched)};
parseQuestions=function(qText,aText){
 const result=parseReport(qText,aText);
 data.skippedQuestions=result.skipped;
 data.totalDetected=result.detected;
 return result.questions;
};
if(!Array.isArray(data.skippedQuestions))data.skippedQuestions=[];
data.totalDetected=data.totalDetected||0;
data.editingAnswers=false;
// Guide the user through source upload, matching report, then the save panel.
const uploadCard=el('uploadCard');
const recordCard=el('recordCard');
uploadCard.insertAdjacentElement('afterend',recordCard);
uploadCard.querySelector('h2').textContent='1. Soruları ve cevapları yükle';
recordCard.querySelector('h2').textContent='2. Test kaydı';
const summary=el('matchingSummary');
const report=document.createElement('div');report.id='matchingReport';report.className='status hidden';
summary.insertAdjacentElement('afterend',report);
const skippedBox=document.createElement('div');skippedBox.id='skippedReport';skippedBox.className='status hidden';
report.insertAdjacentElement('afterend',skippedBox);
summary.innerHTML='<b id="matchingCount"></b> <span>Şık eşleştirmeleri tamamlandı. Test kayıt ekranı açıldı.</span>';
function renderReports(){
 const total=data.questions.length;
 const auto=data.questions.filter(q=>isMatched(q)&&q.matchSource!=='manual').length;
 const manual=data.questions.filter(q=>isMatched(q)&&q.matchSource==='manual').length;
 const missing=data.questions.filter(q=>!isMatched(q)).length;
 const skipped=data.skippedQuestions||[];
 const ready=total>0 && !missing;
 summary.classList.toggle('hidden',!ready||data.running);
 if(ready){
   el('matchingCount').textContent='Eşleşme tamamlandı: '+auto+' otomatik + '+manual+' manuel = '+total+' / '+total+'.';
 }
 report.classList.toggle('hidden',!total||data.running);
 report.innerHTML='<b>Eşleşme özeti:</b> Otomatik '+auto+' | Manuel '+manual+
   ' | Tamamlanan '+(auto+manual)+' / '+total+' | Bekleyen '+missing+
   ' | Pas geçilen '+skipped.length+
   (ready?'<p><b>Tüm kabul edilen soruların cevap harfleri belirlendi.</b> Cevapların anlam bakımından doğruluğunu kaynak anahtarla karşılaştırın.</p>':'<p>Eksik cevaplar aşağıdan harf girilerek tamamlanmalıdır.</p>')+
   '<details '+(ready?'open':'')+'><summary>Geçerli sorular ve cevapların tamamı ('+total+')</summary>'+
   '<div class="mapping-roster">'+data.questions.map(q=>
     '<div class="mapping-line">Soru '+safe(q.n)+': <b>'+safe(q.correctLetter||'Bekliyor')+
     '</b> — '+safe(q.matchSource==='manual'?'Manuel':isMatched(q)?'Otomatik':'Eşleşmedi')+'</div>'
   ).join('')+'</div></details>';
 skippedBox.classList.toggle('hidden',!skipped.length||data.running);
 skippedBox.innerHTML=skipped.length?'<b>'+skipped.length+' soru/bölüm pas geçildi. Teste dahil edilmedi.</b>'+
   '<div class="mapping-roster">'+skipped.map(x=>'<div class="mapping-line">'+
   (x.n==null?'Numarası bilinmeyen bölüm':'Soru '+safe(x.n))+': '+safe(x.reason)+'</div>').join('')+'</div>':'';
 el('recordCard').classList.toggle('hidden',!ready||data.running||!!data.fromSaved);
}
updateTestControls=function(){
 const ready=allAnswersMatched();
 el('startBtn').disabled=!ready||data.running;
 el('finishBtn').disabled=!data.running;
 el('toggleAnswersBtn').disabled=!data.finished||data.running;
 el('recordEditRow').classList.toggle('hidden',!ready||data.running);
};
renderManualAnswers=function(){
 const box=el('manualAnswers');
 if(!data.questions.length||data.running){box.classList.add('hidden');renderReports();updateTestControls();return}
 const missing=data.questions.map((q,i)=>({q,i})).filter(x=>!isMatched(x.q));
 if(!missing.length){
   box.classList.add('hidden');
   renderReports();updateTestControls();
   return;
 }
 box.classList.remove('hidden');
 box.innerHTML='<b>Sadece eşleşmeyen cevaplar</b><p>Doğru şıkkın mevcut harfini yazın. Yalnızca o soruda bulunan A–D veya A–E harfleri kabul edilir; başka şık ya da metin eklenemez.</p>'+
 missing.map(({q,i})=>{
   const allowed=q.letters.join('');
   return '<div class="matching-row"><b>Soru '+safe(q.n)+': '+safe(q.text.slice(0,140))+'</b>'+
    '<p class="hint">Geçerli şık harfleri: '+safe(q.letters.join(', '))+'</p>'+
    '<div class="matching-fields"><input type="text" class="letter-input" inputmode="text" autocapitalize="characters" autocomplete="off" maxlength="1" pattern="['+safe(allowed)+']" data-letter="'+i+'" aria-label="Soru '+safe(q.n)+' doğru şık harfi" placeholder="'+safe(allowed)+'">'+
    '<button class="btn yellow" type="button" data-apply-letter="'+i+'">Eşleştir</button></div></div>'
 }).join('')+'<p>Eksik kalan: <b>'+missing.length+'</b></p>';
 box.querySelectorAll('[data-letter]').forEach(input=>{
   const q=data.questions[Number(input.dataset.letter)];
   input.addEventListener('input',()=>{
     const valid=new Set(q.letters);
     input.value=Array.from(input.value.toLocaleUpperCase('tr-TR')).find(c=>valid.has(c))||'';
   });
   input.addEventListener('keydown',e=>{
     if(e.key==='Enter'){e.preventDefault();box.querySelector('[data-apply-letter="'+input.dataset.letter+'"]').click()}
   });
 });
 box.querySelectorAll('[data-apply-letter]').forEach(button=>{
   button.onclick=()=>{
     const i=Number(button.dataset.applyLetter),q=data.questions[i];
     const letter=collapse(box.querySelector('[data-letter="'+i+'"]').value).toUpperCase();
     if(!/^[A-E]$/.test(letter)||!q.letters.includes(letter)){
       notify('Geçersiz harf. Bu soru için yalnızca '+q.letters.join(', ')+' kullanılabilir.');
       return;
     }
     q.correct=q.letters.indexOf(letter);
     q.correctLetter=letter;q.matchSource='manual';
     renderManualAnswers();renderQuestions();
     if(allAnswersMatched()){
       notify('Eşleşme tamamlandı: Otomatik ve manuel eşleşmeler birlikte listelendi. Test kayıt ekranı açıldı.');
       el('recordCard').scrollIntoView?.({behavior:'smooth',block:'start'});
     }
   }
 });
 renderReports();updateTestControls();
};
el('extractBtn').onclick=async()=>{
 if(!data.questionFiles.length){notify('Önce soru dosyası veya soru fotoğrafı ekleyin.');return}
 const qt=[],at=[];
 const btn=el('extractBtn');
 btn.disabled=true;
 try{
   const files=[...data.questionFiles.map(f=>[f,qt,'Soru']),...data.answerFiles.map(f=>[f,at,'Cevap'])];
   for(let i=0;i<files.length;i++){
     const [file,output,label]=files[i];
     notify((i+1)+'/'+files.length+' '+label+' kaynağı okunuyor: '+file.name);
     output.push(await (/^image\//.test(file.type)?ocrFile(file):extractFile(file)));
   }
   const result=parseReport(qt.join('\n'),at.join('\n'));
   clearInterval(data.timerId);
   data.questions=result.questions;
   data.skippedQuestions=result.skipped;data.totalDetected=result.detected;
   data.answersVisible=false;data.running=false;data.finished=false;
   data.currentSavedName='';data.editingAnswers=false;
   el('testName').value='';el('timer').textContent='Süre: 00:00';
   el('recordCard').classList.add('hidden');
   el('metrics').classList.add('hidden');el('chart').classList.add('hidden');
   el('toggleAnswersBtn').textContent='Cevapları Göster';
   renderQuestions();renderManualAnswers();
   const auto=result.auto;
   notify(result.questions.length?
    'Okuma tamamlandı. '+auto+' cevap otomatik eşleşti. '+(result.questions.length-auto)+' cevap manuel bekliyor. '+result.skipped.length+' soru/bölüm pas geçildi.':
    'Geçerli soru bulunamadı. Eksik/okunamayan soru ve şıklar aşağıda raporlandı.');
 }catch(error){notify('Okuma işlemi tamamlanamadı: '+error.message)}
 finally{btn.disabled=false}
};
const previousLoad=loadRecord;
loadRecord=function(i){
 if(data.running)return;
 const record=readRecords()[i];if(!record)return;
 const questions=[],skipped=Array.isArray(record.skippedQuestions)?record.skippedQuestions.map(item=>({n:item.n??null,reason:String(item.reason||'Okunamayan soru')})):[];
 for(const item of (record.questions||[])){
   const v=strictQuestion(item);
   if(v.ok)questions.push(v.question);
   else skipped.push({n:item.n||null,reason:'Kayıttaki eksik soru: '+v.reason});
 }
 data.questions=questions;data.skippedQuestions=skipped;
 data.totalDetected=questions.length+skipped.length;
 data.currentSavedName=record.name||'';
 el('testName').value=data.currentSavedName;
 data.sourceNames=record.sourceNames||[];
 data.answersVisible=false;data.running=false;data.finished=false;data.editingAnswers=false;
 clearInterval(data.timerId);
 el('timer').textContent='Süre: 00:00';
 el('recordCard').classList.remove('hidden');el('uploadCard').classList.remove('hidden');
 el('metrics').classList.add('hidden');el('chart').classList.add('hidden');
 el('toggleAnswersBtn').textContent='Cevapları Göster';
 renderQuestions();renderManualAnswers();
 notify(questions.length?'Kayıt açıldı. Test Başla ile istediğiniz kadar yeniden çözebilirsiniz.':'Bu kayıtta geçerli soru bulunamadı. Lütfen kaynağı yeniden okuyun.');
};
const previousCurrent=currentRecord;
currentRecord=function(){
 const value=previousCurrent();
 return {...value,questions:data.questions.map(q=>({...q,selected:null})),skippedQuestions:[...data.skippedQuestions],totalDetected:data.totalDetected};
};
el('startBtn').onclick=()=>{
 if(data.running||!allAnswersMatched())return;
 clearInterval(data.timerId);data.questions.forEach(q=>q.selected=null);
 data.answersVisible=false;data.running=true;data.finished=false;data.startAt=Date.now();
 el('recordCard').classList.add('hidden');el('uploadCard').classList.add('hidden');
 el('metrics').classList.add('hidden');el('chart').classList.add('hidden');
 el('timer').textContent='Süre: 00:00';el('toggleAnswersBtn').textContent='Cevapları Göster';
 data.timerId=setInterval(()=>{
   const seconds=Math.floor((Date.now()-data.startAt)/1000);
   el('timer').textContent='Süre: '+String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
 },1000);
 renderQuestions();updateTestControls();
 window.scrollTo?.({top:el('questions').offsetTop,behavior:'smooth'});
};
el('finishBtn').onclick=()=>{
 if(!data.running)return;
 data.running=false;data.finished=true;clearInterval(data.timerId);data.answersVisible=false;
 el('recordCard').classList.remove('hidden');el('uploadCard').classList.remove('hidden');
 el('toggleAnswersBtn').textContent='Cevapları Göster';
 const correct=data.questions.filter(q=>q.selected===q.correct).length;
 const wrong=data.questions.filter(q=>q.selected!==null&&q.selected!==q.correct).length;
 const unanswered=data.questions.filter(q=>q.selected===null).length;
 el('correctCount').textContent=correct;el('wrongCount').textContent=wrong;el('unanswered').textContent=unanswered;
 el('rate').textContent=Math.round(correct/data.questions.length*100)+'%';
 el('metrics').classList.remove('hidden');drawChart(correct,wrong,unanswered);el('chart').classList.remove('hidden');
 renderQuestions();renderManualAnswers();updateTestControls();
 notify('Test tamamlandı. Cevapları Göster ile doğruları ve yanlışları inceleyebilir, Test Başla ile yeniden çözebilirsiniz.');
};
el('toggleAnswersBtn').onclick=()=>{
 if(data.running||!data.finished)return;
 data.answersVisible=!data.answersVisible;
 el('toggleAnswersBtn').textContent=data.answersVisible?'Cevapları Gizle':'Cevapları Göster';
 renderQuestions();
};
// Fresh-start and saved-test navigation. Keep the persistent storage when the title is tapped.
const quickCard=document.createElement('section');
quickCard.id='quickSavedCard';quickCard.className='card quick-card hidden';
quickCard.innerHTML='<h2>Kayıtlı Testler</h2><p class="hint">Bir testi seçtiğinizde sorular ve doğru cevap eşleşmeleri hazır açılır. Ardından Test Başla düğmesine dokunun.</p><div id="quickSavedList"></div>';
el('uploadCard').insertAdjacentElement('beforebegin',quickCard);
const oldRenderSaved=renderSaved;
function renderQuickSaved(){
 const records=readRecords();
 const visible=records.length>0&&!data.running;
 quickCard.classList.toggle('hidden',!visible);
 const list=el('quickSavedList');
 list.innerHTML=records.map((record,i)=>{
  const selected=data.fromSaved&&data.currentSavedName===record.name;
  const count=Array.isArray(record.questions)?record.questions.length:0;
  return '<div class="quick-saved-row"><button type="button" class="btn open-saved'+(selected?' active':'')+'" data-quick-open="'+i+'" aria-label="'+safe(record.name)+' testini aç"><b>'+safe(record.name)+'</b><small>'+count+' soru · '+(selected?'Test hazır':'Aç ve çöz')+'</small></button>'+
    '<button type="button" class="btn quick-delete" data-quick-delete="'+i+'" aria-label="'+safe(record.name)+' kaydını sil">Sil</button></div>';
 }).join('');
 list.querySelectorAll('[data-quick-open]').forEach(button=>button.onclick=()=>{
  loadRecord(Number(button.dataset.quickOpen));
  if(allAnswersMatched())el('startBtn').scrollIntoView?.({block:'center',behavior:'smooth'});
 });
 list.querySelectorAll('[data-quick-delete]').forEach(button=>button.onclick=deleteRecord.bind(null,Number(button.dataset.quickDelete)));
}
renderSaved=function(){
 oldRenderSaved();
 renderQuickSaved();
};
function resetToHome(){
 clearInterval(data.timerId);data.timerId=null;
 data.questionFiles=[];data.answerFiles=[];data.sourceNames=[];
 data.questions=[];data.skippedQuestions=[];data.totalDetected=0;
 data.answersVisible=false;data.running=false;data.finished=false;
 data.editingAnswers=false;data.manualOptionFor=null;data.pendingLetters={};
 data.startAt=0;data.fromSaved=false;data.currentSavedName='';
 ['filesInput','answerFilesInput','questionPhotos','answerPhotos'].forEach(id=>{el(id).value=''});
 el('testName').value='';el('savedSelect').value='';
 filesText();
 el('timer').textContent='Süre: 00:00';
 el('progress').value=0;el('progressLabel').textContent='İlerleme: 0 / 0';
 ['correctCount','wrongCount','unanswered'].forEach(id=>{el(id).textContent='0'});
 el('rate').textContent='0%';
 el('metrics').classList.add('hidden');el('chart').classList.add('hidden');
 el('uploadCard').classList.remove('hidden');
 el('recordCard').classList.add('hidden');
 el('toggleAnswersBtn').textContent='Cevapları Göster';
 renderQuestions();
 el('questions').innerHTML='<p class="hint">Önce soru ve cevap dosyası veya fotoğrafı ekleyin; ya da yukarıdaki kayıtlı testlerden birini seçin.</p>';
 el('importStatus').textContent='Dosyaları yükleyin. Fotoğraflar OCR ile okunur; cevap anahtarı ayrı dosya veya fotoğraf olarak eklenebilir.';
 renderManualAnswers();
 renderQuickSaved();
 window.scrollTo?.({top:0,behavior:'instant'});
}
const header=el('homeHeader');
header.onclick=()=>resetToHome();
header.onkeydown=event=>{
 if(event.key==='Enter'||event.key===' '){event.preventDefault();resetToHome()}
};
const savedLoadRecord=loadRecord;
loadRecord=function(index){
 if(data.running)return;
 if(!readRecords()[index])return;
 data.fromSaved=true;
 data.questionFiles=[];data.answerFiles=[];
 ['filesInput','answerFilesInput','questionPhotos','answerPhotos'].forEach(id=>{el(id).value=''});
 savedLoadRecord(index);
 el('uploadCard').classList.add('hidden');
 el('recordCard').classList.add('hidden');
 renderQuickSaved();
 if(!allAnswersMatched()){
   // Older or corrupted records do not bypass validation.
   el('uploadCard').classList.remove('hidden');
   notify('Bu kayıt eşleştirme açısından eksik görünüyor. Teste başlamadan önce kaynağı yeniden yükleyin.');
 }
};
deleteRecord=function(index){
 const records=readRecords(),record=records[index];
 if(!record)return;
 if(!confirm('“'+record.name+'” kaydını kalıcı olarak silmek istediğinize emin misiniz?'))return;
 const wasSelected=Boolean(data.currentSavedName)&&data.currentSavedName===record.name;
 records.splice(index,1);
 writeRecords(records);
 if(wasSelected||records.length===0)resetToHome();
 else renderQuickSaved();
 if(records.length===0)notify('Son kayıt silindi. Yeni test oluşturmak için dosya veya fotoğraf yükleyin.');
 else notify('“'+record.name+'” silindi. Diğer kayıtlı testler başlığın altında duruyor.');
};
const extractOriginal=el('extractBtn').onclick;
el('extractBtn').onclick=async()=>{
 data.fromSaved=false;
 el('uploadCard').classList.remove('hidden');
 await extractOriginal();
 renderQuickSaved();
};
const originalStart=el('startBtn').onclick;
el('startBtn').onclick=()=>{
 originalStart();
 renderQuickSaved();
};
const originalFinish=el('finishBtn').onclick;
el('finishBtn').onclick=()=>{
 originalFinish();
 if(data.fromSaved){
   el('recordCard').classList.add('hidden');
   el('uploadCard').classList.add('hidden');
 }
 renderQuickSaved();
};
window.__quizDiagnostics={parseReport,strictQuestion,keyData,resetToHome};
resetToHome();
})();