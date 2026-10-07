#!/usr/bin/env node
/** V5 inspector: integrity, actual text, A4 and offline browser. No editorial quotas. */
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
const ids=['v5-byte-binding','v5-text-consistency','v5-pdf-layout','v5-browser-layout']
const hash=b=>createHash('sha256').update(b).digest('hex')
let raw='';for await(const part of process.stdin){raw+=part;if(Buffer.byteLength(raw)>40*1024*1024)throw Error('input limit')}
const input=JSON.parse(raw), results=[]
const result=(id,status,detail)=>({id,status,detail})
let payload
try {
  if(input.protocolVersion!==1||!Array.isArray(input.resultIds)||input.resultIds.length!==ids.length||!ids.every(id=>input.resultIds.includes(id)))throw Error('invalid result contract')
  const data={}
  for(const role of ['md','html','pdf','evidence']){
    const a=input.artifacts?.[role]
    if(!a||!['utf8','base64',undefined].includes(a.encoding)||typeof a.content!=='string')throw Error('missing role')
    const bytes=Buffer.from(a.content,a.encoding==='base64'?'base64':'utf8')
    if(hash(bytes)!==a.sha256||bytes.length>(role==='pdf'?20:2)*1024*1024)throw Error('artifact byte/hash mismatch')
    data[role]=role==='pdf'?bytes.toString('base64'):new TextDecoder('utf-8',{fatal:true}).decode(bytes)
  }
  const ledger=JSON.parse(data.evidence),selection=input.selections?.find(s=>s.skillId==='zhijian-research-craft-v5')
  if(ledger.schemaVersion!==5||!['credit-policy','designer-paper'].includes(selection?.variant)||ledger.style!==selection.variant)throw Error('V5 style/evidence binding required')
  for(const role of ['md','html','pdf'])if(ledger[role+'Sha256']!==input.artifacts[role].sha256)throw Error('stale craft evidence')
  for(const ref of ['credit-policy','designer-paper'])if(typeof ledger.references?.[ref]!=='string'||!ledger.references[ref].trim())throw Error('both reference decisions required')
  payload={...data,style:selection.variant,browser:input.host?.browserExecutablePath??'/root/.cache/dsh-report-craft/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell'}
  results.push(result(ids[0],'passed','Exact artifact bytes and V5 reference decisions bound; semantic correctness requires independent review.'))
}catch(e){process.stdout.write(JSON.stringify(ids.map(id=>result(id,'failed',String(e.message)))));process.exit(0)}
const python=String.raw`
import sys,json,base64,re,tempfile,os,hashlib,sysconfig
for key in ('purelib','platlib'):
 path=sysconfig.get_path(key)
 if path and path not in sys.path:sys.path.append(path)
p=json.load(sys.stdin); out=[]
def row(id,status,detail):out.append(dict(id=id,status=status,detail=detail))
def norm(s):return re.sub(r'\s+','',s)
def require(ok,msg):
 if not ok:raise ValueError(msg)
try:
 from bs4 import BeautifulSoup
 from markdown_it import MarkdownIt
 html=BeautifulSoup(p['html'],'html.parser'); bodies=html.select('main#report-body')
 require(len(bodies)==1,'one main#report-body required');body=bodies[0]
 require(not html.find(['script','iframe','object','embed','link']),'static inline document required')
 require(not re.search(r'@import|url\(\s*[\x22\x27]?https?:',p['html'],re.I),'remote CSS resources forbidden')
 source=BeautifulSoup(MarkdownIt('commonmark',{'html':False}).enable('table').render(p['md']),'html.parser')
 ledger=json.loads(p['evidence']);prose=BeautifulSoup(str(body),'html.parser');figures=ledger.get('figures',[])
 require(isinstance(figures,list),'figures must be an array');seen=set()
 for fig in prose.select('figure[data-v5-figure]'):
  fid=fig.get('data-v5-figure');rows=[f for f in figures if isinstance(f,dict) and f.get('id')==fid]
  require(fid not in seen and len(rows)==1,'figure requires a unique ledger binding');seen.add(fid)
  require(isinstance(rows[0].get('sourceQuote'),str) and rows[0]['sourceQuote'].strip() and rows[0]['sourceQuote'] in p['md'],'figure must cite actual approved prose')
  nums=set(re.findall(r'[-+]?\d[\d,]*(?:\.\d+)?(?:%|％)?',p['md']))
  require(all(n in nums for n in re.findall(r'[-+]?\d[\d,]*(?:\.\d+)?(?:%|％)?',fig.get_text())),'figure introduces an unapproved number')
  fig.decompose()
 require(len(seen)==len(figures),'ledger figure missing from actual HTML')
 for node in source.find_all(['style','script']):node.decompose()
 text=lambda n:n.get_text('',strip=False)
 require(norm(text(source))==norm(text(prose)),'actual MD and HTML body text differ')
 require(all(not n.get('hidden') and not re.search(r'display\s*:\s*none|visibility\s*:\s*hidden',n.get('style',''),re.I) for n in body.find_all()),'hidden body content prohibited')
 row('v5-text-consistency','passed','Full Markdown reading text matches HTML body. Browser separately checks visibility; independent review checks meaning and charts.')
except ImportError:row('v5-text-consistency','unverified','Markdown/HTML inspection dependency unavailable')
except Exception as e:row('v5-text-consistency','failed',str(e)[:1500])
try:
 import fitz
 doc=fitz.open(stream=base64.b64decode(p['pdf'],validate=True),filetype='pdf');require(1<=len(doc)<=300,'PDF page limit')
 page_text=[];issues=[]
 for i,page in enumerate(doc):
  if abs(page.rect.width-595.276)>3 or abs(page.rect.height-841.89)>3:issues.append('page '+str(i+1)+' is not A4 portrait')
  words=page.get_text('words')
  for w in words:
   if w[0]<-1 or w[1]<-1 or w[2]>page.rect.width+1 or w[3]>page.rect.height+1:issues.append('text outside page '+str(i+1));break
  page_text.append(page.get_text('text'))
 require(not issues,'; '.join(issues[:8]))
 pdftext=norm(''.join(page_text));require(bool(pdftext),'PDF has no extractable text')
 # Check actual paragraphs/tables in the final PDF. No fixed cover or chapter count.
 require('body' in globals(),'HTML body was not parsed')
 for n in body.find_all(['h1','h2','h3','h4','p','li','tr','figcaption']):
  s=norm(text(n))
  if s:require(s in pdftext,'PDF omits or changes body block: '+s[:90])
 # Refuse PDF-only textual numeric facts (page counters may be added by rendering).
 wanted=set(re.findall(r'[-+]?\d[\d,]*(?:\.\d+)?(?:%|％)?',text(html)))
 for page in doc:
  for b in page.get_text('blocks'):
   if b[1]>page.rect.height*.92 or b[3]<page.rect.height*.06:continue
   for n in re.findall(r'[-+]?\d[\d,]*(?:\.\d+)?(?:%|％)?',b[4]):require(n in wanted,'PDF introduces numerical token '+n)
 row('v5-pdf-layout','passed',json.dumps({'pageCount':len(doc),'scope':'actual A4 bounds, body blocks and numerical tokens; independent review checks page aesthetics'},ensure_ascii=False))
except ImportError:row('v5-pdf-layout','unverified','PDF inspector unavailable')
except Exception as e:row('v5-pdf-layout','failed',str(e)[:1500])
try:
 from playwright.sync_api import sync_playwright
 require(os.path.isabs(p['browser']) and os.path.isfile(p['browser']),'controlled browser unavailable')
 metrics=[];evidence_dir=tempfile.mkdtemp(prefix='v5-render-evidence-')
 with tempfile.TemporaryDirectory(prefix='v5-browser-') as d:
  path=os.path.join(d,'report.html');open(path,'w').write(p['html'])
  with sync_playwright() as pw:
   browser=pw.chromium.launch(executable_path=p['browser'],headless=True,args=['--no-sandbox','--disable-background-networking','--disable-sync'])
   try:
    for width in [1280,375]:
     ctx=browser.new_context(viewport={'width':width,'height':900},java_script_enabled=False,service_workers='block')
     ctx.route('**/*',lambda route:route.continue_() if route.request.url=='file://'+path else route.abort())
     page=ctx.new_page();page.goto('file://'+path,wait_until='load',timeout=10000)
     m=page.evaluate('''() => {const b=document.querySelector('#report-body');const bad=[];const all=[b,...b.querySelectorAll('*')];for(const n of all){const s=getComputedStyle(n),r=n.getBoundingClientRect();if(n.textContent.trim()&&(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0))bad.push('hidden text');if(r.width&&r.height&&(r.left < -1 || r.right > innerWidth+1))bad.push('horizontal overflow');if(n.childNodes.length&&n.textContent.trim()&&s.overflowY==='hidden'&&n.scrollHeight>n.clientHeight+1)bad.push('clipped text');}return {width:innerWidth,documentWidth:document.documentElement.scrollWidth,bad:[...new Set(bad)],visibleText:b.innerText,background:getComputedStyle(document.body).backgroundColor};}''')
     require(m['documentWidth']<=width+1 and not m['bad'],'viewport '+str(width)+': '+str(m['bad']))
     require(norm(m.pop('visibleText'))==norm(text(body)),'rendered body hides or changes text')
     shot=page.screenshot(full_page=False);shot_path=os.path.join(evidence_dir,str(width)+'.png');open(shot_path,'xb').write(shot);m['screenshotPath']=shot_path;m['screenshotSha256']=hashlib.sha256(shot).hexdigest();m['coverage']='initial viewport screenshot plus document DOM bounds';metrics.append(m)
     ctx.close()
   finally:browser.close()
 row('v5-browser-layout','passed',json.dumps({'metrics':metrics,'scope':'actual offline 1280/375 DOM and screenshots; no semantic or full contrast certification'},ensure_ascii=False))
except ImportError:row('v5-browser-layout','unverified','Playwright unavailable')
except Exception as e:row('v5-browser-layout','unverified' if 'unavailable' in str(e) else 'failed',str(e)[:1500])
print(json.dumps(out,ensure_ascii=False))
`
const child=spawn('python3',['-I','-c',python],{stdio:['pipe','pipe','pipe'],detached:true})
let output='',failed=false
const timer=setTimeout(()=>{failed=true;try{process.kill(-child.pid,'SIGKILL')}catch{}},45000)
child.stdout.on('data',b=>{output+=b;if(output.length>128*1024){failed=true;child.kill('SIGKILL')}})
child.stderr.on('data',()=>{})
child.stdin.on('error',()=>{})
child.on('error',()=>{failed=true})
child.on('close',()=>{clearTimeout(timer);try{if(failed)throw Error();const r=JSON.parse(output);if(r.length!==3||r.some((v,i)=>v.id!==ids[i+1]||!['passed','failed','unverified'].includes(v.status)))throw Error();process.stdout.write(JSON.stringify([...results,...r]))}catch{process.stdout.write(JSON.stringify([...results,...ids.slice(1).map(id=>result(id,'unverified','Inspector did not complete; retry the infrastructure channel.'))]))}})
child.stdin.end(JSON.stringify(payload))
