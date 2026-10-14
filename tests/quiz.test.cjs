'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const repair=fs.readFileSync(path.join(root,'quiz-fixes.js'),'utf8');
const base=html.match(/<script>\s*([\s\S]*?)<\/script>/i);
assert.ok(base,'Main application JavaScript must exist');
assert.match(html,/src="quiz-fixes\.js"/);
const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://ios.app.local/',pretendToBeVisual:true});
const w=dom.window;
w.scrollTo=()=>{};
w.HTMLElement.prototype.scrollIntoView=function(){};
w.HTMLCanvasElement.prototype.getContext=()=>({
 clearRect(){},fillRect(){},fillText(){},
 set fillStyle(_x){},set font(_x){}
});
const context=dom.getInternalVMContext();
vm.runInContext(base[1],context,{filename:'base-app.js'});
vm.runInContext(repair,context,{filename:'quiz-fixes.js'});
const get=expr=>vm.runInContext(expr,context);
const e=id=>w.document.getElementById(id);
const {parseReport,strictQuestion,keyData}=w.__quizDiagnostics;
let passed=0;
function verify(name,fn){fn();passed++;process.stdout.write('PASS '+name+'\n')}

const imageQuestions=[
'1. Birinci soru için hangi cevap uygundur?',
'A) Birinci seçenek','B) İkinci seçenek','C) Üçüncü seçenek','D) Dördüncü seçenek',
'2. İkinci soru için hangi renk uygundur? A) Kırmızı B) Mavi C) Yeşil D) Sarı',
'3. Eksik şıklı soru için yanıt hangisidir?',
'A) Birinci','B) İkinci','C) Üçüncü',
'4. Birbirinin aynı şıkları olan soru hangisidir?',
'A) Aynı','B) Aynı','C) Başka','D) Farklı',
'5. Beşinci soru için doğru seçenek nedir?',
'A) Ali','B) Veli','C) Hasan','D) Hüseyin','E) Mehmet'
].join('\n');
const imageAnswers='1-B\n2-C';
const report=parseReport(imageQuestions,imageAnswers);

verify('Screen order is upload, matching report, save panel, test',()=>{
 const children=[...w.document.querySelector('main.wrap').children];
 assert.ok(children.indexOf(e('uploadCard'))<children.indexOf(e('recordCard')));
 assert.ok(children.indexOf(e('recordCard'))<children.indexOf(e('questions').closest('section')));
 assert.equal(e('recordCard').classList.contains('hidden'),true);
});
verify('OCR report accepts only complete questions',()=>{
 assert.equal(report.questions.length,3);
 assert.deepEqual(Array.from(report.questions,q=>q.n),[1,2,5]);
 assert.equal(report.skipped.length,2);
});
verify('OCR report names skipped questions and reasons',()=>{
 assert.ok(report.skipped.some(x=>x.n===3&&/eksik|Şık sayısı/i.test(x.reason)));
 assert.ok(report.skipped.some(x=>x.n===4&&/aynı/i.test(x.reason)));
});
verify('OCR preserves automatic matches but leaves absent key unmatched',()=>{
 assert.equal(report.auto,2);
 assert.deepEqual(Array.from(report.questions,q=>q.correctLetter),['B','C',null]);
 assert.equal(report.questions[2].matchSource,null);
});
verify('Multiple choices on a single OCR line are separated',()=>{
 assert.deepEqual(Array.from(report.questions[1].letters),['A','B','C','D']);
 assert.deepEqual(Array.from(report.questions[1].options),['Kırmızı','Mavi','Yeşil','Sarı']);
});
verify('No empty, duplicated, nested or incomplete options are accepted',()=>{
 const invalid=[
   {n:1,text:'Kontrol sorusu?',letters:['A','B','C','D'],options:['a','b','','d']},
   {n:1,text:'Kontrol sorusu?',letters:['A','B','C','D'],options:['a','a','c','d']},
   {n:1,text:'Kontrol sorusu?',letters:['A','B','B','D'],options:['a','b','c','d']},
   {n:1,text:'Kontrol sorusu?',letters:['A','B','C'],options:['a','b','c']},
   {n:1,text:'Kontrol sorusu?',letters:['A','B','C','D'],options:['a','b B) iç içe','c','d']}
 ];
 assert.ok(invalid.every(q=>!strictQuestion(q).ok));
});
verify('Conflicting OCR answer keys cannot silently choose a letter',()=>{
 const ks=keyData('1-A 1-D 2-B');
 assert.equal(ks.map.has(1),false);
 assert.equal(ks.map.get(2),'B');
});
verify('Four or five nonempty unique answers are accepted',()=>{
 assert.ok(strictQuestion({n:9,text:'Geçerli soru metni?',letters:['A','B','C','D','E'],options:['Bir','İki','Üç','Dört','Beş'],correctLetter:'E'}).ok);
});

async function runFlow(){
 // Fake camera/file input: on-device Vision returns the recognized text.
 get('ocrFile=async file=>file.mockText');
 get('data.questionFiles=[{name:"sorular.png",type:"image/png",mockText: '+JSON.stringify(imageQuestions)+'}]; data.answerFiles=[{name:"cevaplar.jpg",type:"image/jpeg",mockText: '+JSON.stringify(imageAnswers)+'}]');
 await e('extractBtn').onclick();
 verify('Separate question and answer photos match automatically',()=>{
  assert.equal(get('data.questions.length'),3);
  assert.equal(get('data.questions.filter(q=>q.matchSource==="auto").length'),2);
  assert.equal(e('startBtn').disabled,true);
 });
 verify('Only unmatched answer is presented for manual input',()=>{
  assert.equal(e('manualAnswers').querySelectorAll('[data-letter]').length,1);
  assert.equal(e('manualAnswers').querySelector('[data-letter]').dataset.letter,'2');
  assert.ok(!e('manualAnswers').innerHTML.includes('data-extra-text'));
  assert.equal(e('recordCard').classList.contains('hidden'),true);
 });
 const field=e('manualAnswers').querySelector('[data-letter]');
 field.value='Z';field.dispatchEvent(new w.Event('input',{bubbles:true}));
 verify('Invalid letters are rejected at typing time',()=>{
  assert.equal(field.value,'');
  assert.equal(get('data.questions[2].correct'),null);
 });
 field.value='E';field.dispatchEvent(new w.Event('input',{bubbles:true}));
 e('manualAnswers').querySelector('[data-apply-letter]').click();
 verify('Manually entered valid letter completes final unmatched answer',()=>{
  assert.equal(get('data.questions[2].correctLetter'),'E');
  assert.equal(get('data.questions[2].matchSource'),'manual');
  assert.equal(e('startBtn').disabled,false);
  assert.equal(e('recordCard').classList.contains('hidden'),false);
  assert.equal(e('recordEditRow').classList.contains('hidden'),false);
 });
 verify('Completion report shows automatic + manual = all, every answer and skipped questions',()=>{
  assert.match(e('matchingCount').textContent,/2 otomatik \+ 1 manuel = 3 \/ 3/);
  assert.match(e('matchingReport').textContent,/Soru 1/);
  assert.match(e('matchingReport').textContent,/Soru 5/);
  assert.match(e('skippedReport').textContent,/Soru 3/);
  assert.match(e('skippedReport').textContent,/Soru 4/);
 });
 e('testName').value='iOS Fotoğraf Denemesi';
 e('saveBtn').click();
 verify('Saving becomes possible only after complete matching',()=>{
  assert.equal(get('readRecords().length'),1);
  assert.equal(get('readRecords()[0].questions.length'),3);
 });
 e('startBtn').click();
 verify('Test starts without reasking to match and resets answers',()=>{
  assert.equal(get('data.running'),true);
  assert.equal(get('data.questions.every(q=>q.selected===null)'),true);
  assert.equal(e('finishBtn').disabled,false);
  assert.equal(e('recordCard').classList.contains('hidden'),true);
 });
 const opts=[...w.document.querySelectorAll('input[name="answer_question_0"]')];
 verify('Each question has four independent radio inputs',()=>{
  assert.equal(opts.length,4);
  assert.equal(opts.every(x=>x.type==='radio'),true);
  assert.equal(opts.every(x=>x.name==='answer_question_0'),true);
  assert.equal(opts.every(x=>!x.disabled),true);
 });
 opts[0].click();opts[1].click();
 verify('Only one answer remains selected in each question',()=>{
  assert.equal(opts.filter(x=>x.checked).length,1);
  assert.equal(opts[1].checked,true);
  assert.equal(get('data.questions[0].selected'),1);
 });
 e('finishBtn').click();
 verify('Test Bitir closes the test and calculates results',()=>{
  assert.equal(get('data.running'),false);
  assert.equal(get('data.finished'),true);
  assert.equal(e('startBtn').disabled,false);
  assert.equal(e('toggleAnswersBtn').disabled,false);
 });
 e('toggleAnswersBtn').click();
 verify('Cevapları Göster reveals correct and wrong colors',()=>{
  assert.equal(get('data.answersVisible'),true);
  assert.ok(w.document.querySelectorAll('.opt.correct').length>=3);
 });
 e('toggleAnswersBtn').click();
 verify('Cevapları Gizle hides answer colors again',()=>{
  assert.equal(get('data.answersVisible'),false);
  assert.equal(w.document.querySelectorAll('.opt.correct').length,0);
 });
 for(let n=0;n<3;n++){
  e('startBtn').click();
  assert.equal(get('data.questions.every(q=>q.selected===null)'),true);
  e('finishBtn').click();
  e('toggleAnswersBtn').click();
  e('toggleAnswersBtn').click();
 }
 verify('Test start/finish and answer show/hide repeat without rematching',()=>{
  assert.equal(get('data.finished'),true);
  assert.equal(get('data.running'),false);
  assert.equal(get('data.questions.length'),3);
 });
 get('loadRecord(0)');
 verify('Saved test reopens with no previous choices selected',()=>{
  assert.equal(get('data.questions.every(q=>q.selected===null)'),true);
  assert.equal(e('startBtn').disabled,false);
 });
 verify('Skipped OCR question report persists after reopening saved test',()=>{
   assert.equal(get('data.skippedQuestions.length'),2);
   assert.match(e('skippedReport').textContent,/Soru 3/);
   assert.match(e('skippedReport').textContent,/Soru 4/);
 });
 verify('Saved tests remain available immediately below the heading',()=>{
  assert.equal(e('quickSavedCard').classList.contains('hidden'),false);
  assert.ok(e('quickSavedCard').querySelector('[data-quick-open="0"]'));
  assert.ok([...w.document.querySelector('main.wrap').children].indexOf(e('quickSavedCard'))<[...w.document.querySelector('main.wrap').children].indexOf(e('uploadCard')));
 });
 e('homeHeader').click();
 verify('Tapping heading resets unsaved UI and keeps saved test records',()=>{
  assert.equal(get('data.questions.length'),0);
  assert.equal(get('data.questionFiles.length'),0);
  assert.equal(get('data.answerFiles.length'),0);
  assert.equal(get('data.running'),false);
  assert.equal(e('timer').textContent,'Süre: 00:00');
  assert.equal(e('startBtn').disabled,true);
  assert.equal(get('readRecords().length'),1);
  assert.equal(e('quickSavedCard').classList.contains('hidden'),false);
  assert.equal(e('uploadCard').classList.contains('hidden'),false);
 });
 e('quickSavedCard').querySelector('[data-quick-open]').click();
 verify('Selecting saved test opens matched content ready for Test Başla',()=>{
  assert.equal(get('data.questions.length'),3);
  assert.equal(get('allAnswersMatched()'),true);
  assert.equal(e('startBtn').disabled,false);
  assert.equal(e('uploadCard').classList.contains('hidden'),true);
  assert.equal(e('recordCard').classList.contains('hidden'),true);
  assert.match(e('quickSavedCard').textContent,/Test hazır/);
 });
 e('startBtn').click();
 verify('Saved test can start and finish again after selection',()=>{
  assert.equal(get('data.running'),true);
  assert.equal(e('startBtn').disabled,true);
  assert.equal(e('quickSavedCard').classList.contains('hidden'),true);
 });
 e('finishBtn').click();
 verify('Saved test restores quick chooser after finishing',()=>{
  assert.equal(get('data.finished'),true);
  assert.equal(e('quickSavedCard').classList.contains('hidden'),false);
  assert.equal(e('startBtn').disabled,false);
 });
 w.confirm=()=>true;
 e('quickSavedCard').querySelector('[data-quick-delete]').click();
 verify('Deleting last saved test clears loaded content and restores first launch',()=>{
  assert.equal(get('readRecords().length'),0);
  assert.equal(get('data.questions.length'),0);
  assert.equal(e('quickSavedCard').classList.contains('hidden'),true);
  assert.equal(e('recordCard').classList.contains('hidden'),true);
  assert.equal(e('uploadCard').classList.contains('hidden'),false);
  assert.equal(e('startBtn').disabled,true);
  assert.equal(get('data.timerId'),null);
 });
 w.close();
}
runFlow().then(()=>{console.log('\nALL '+passed+' Android logic checks passed')}).catch(e=>{console.error(e.stack);w.close();process.exitCode=1});
