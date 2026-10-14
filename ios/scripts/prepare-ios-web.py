#!/usr/bin/env python3
"""Generate the native iOS web assets from the Android HTML source."""
from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
IOS = Path(__file__).resolve().parents[1]
APP = IOS / 'SoruHazirlamaAsistani'
WEB = APP / 'Web'
SOURCE = ROOT / 'index.html'
WEB.mkdir(parents=True, exist_ok=True)
if not SOURCE.exists():
    raise SystemExit(f'Missing source: {SOURCE}')
html = SOURCE.read_text(encoding='utf-8')
urls = {
 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js': 'lib/pdf.min.js',
 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js': 'lib/mammoth.browser.min.js',
 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js': 'lib/xlsx.full.min.js',
 "pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'": "pdfjsLib.GlobalWorkerOptions.workerSrc='lib/pdf.worker.min.js'"
}
for old, new in urls.items():
 if old not in html:
  raise SystemExit('Missing dependency marker: ' + old)
 html = html.replace(old,new)
html = html.replace('<script src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"></script>','')
old_ocr = "async function ocrFile(file){if(!window.Tesseract)throw Error('OCR bileşeni yüklenemedi. İnternet bağlantısını kontrol edin.');const result=await Tesseract.recognize(file,'tur+eng',{logger:m=>{if(m.status==='recognizing text')notify('Fotoğraf okunuyor: '+file.name+' · %'+Math.round((m.progress||0)*100))}});return result.data.text}"
new_ocr = r'''const iosOCRPending=new Map();
window.__resolveNativeOCR=function(id,text,error){
 const p=iosOCRPending.get(String(id));if(!p)return;
 iosOCRPending.delete(String(id));
 if(error)p.reject(new Error(String(error)));else p.resolve(String(text||''));
};
async function ocrFile(file){
 if(!window.webkit||!window.webkit.messageHandlers||!window.webkit.messageHandlers.nativeOCR){
  throw Error('iOS fotoğraf okuma bileşeni kullanılamıyor. Uygulamayı iPhone üzerinden açın.');
 }
 notify('Fotoğraf cihazda okunuyor: '+file.name);
 const base64=await new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onerror=()=>reject(new Error('Fotoğraf açılamadı'));
  reader.onload=()=>resolve(String(reader.result||''));
  reader.readAsDataURL(file);
 });
 const id=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
 return await new Promise((resolve,reject)=>{
  iosOCRPending.set(id,{resolve,reject});
  try{window.webkit.messageHandlers.nativeOCR.postMessage({id:id,data:base64});}
  catch(e){iosOCRPending.delete(id);reject(e)}
 });
}'''
if old_ocr not in html:
 raise SystemExit('Cannot locate original OCR function')
html = html.replace(old_ocr,new_ocr)
html = html.replace('<meta name="color-scheme" content="light">','<meta name="color-scheme" content="light"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="default">')
# Keep the validated iOS-specific parsing and matching layer in the app bundle.
fix=WEB/'quiz-fixes.js'
if not fix.is_file() or fix.stat().st_size<100:
 raise SystemExit('Missing iOS matching logic: '+str(fix))
if '</body>' not in html:
 raise SystemExit('Missing document body')
html=html.replace('</body>','<script src="quiz-fixes.js"></script></body>')
(WEB/'index.html').write_text(html,encoding='utf-8')
icon_dir=APP/'Assets.xcassets'/'AppIcon.appiconset'
icon_dir.mkdir(parents=True, exist_ok=True)
icon=Image.new('RGB',(1024,1024),'#FACC15')
draw=ImageDraw.Draw(icon)
font=None
for font_path in ('/System/Library/Fonts/Supplemental/Arial Bold.ttf','/Library/Fonts/Arial Bold.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'):
 try:
  font=ImageFont.truetype(font_path,460)
  break
 except OSError:
  continue
if font is None: font=ImageFont.load_default(size=460)
bounds=draw.textbbox((0,0),'S',font=font)
x=(1024-(bounds[2]-bounds[0]))/2-bounds[0]
y=(1024-(bounds[3]-bounds[1]))/2-bounds[1]
draw.text((x,y),'S',font=font,fill='#111111')
icon.save(icon_dir/'Icon-1024.png')
(icon_dir/'Contents.json').write_text(json.dumps({'images':[{'filename':'Icon-1024.png','idiom':'universal','platform':'ios','size':'1024x1024'}],'info':{'author':'xcode','version':1}},indent=2)+'\n')
print('Prepared iOS web assets and S icon')
