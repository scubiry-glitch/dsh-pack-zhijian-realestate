/** Domain-pack-owned inspector source; compiled release bytes are pinned by the selected pack digest. */
export const REPORT_CRAFT_V2_PYTHON = String.raw`
import sys, sysconfig, json, re, io, base64, math, os, hashlib, unicodedata, difflib, stat, fcntl, secrets
from decimal import Decimal
from collections import Counter
from datetime import date
from urllib.parse import urlparse
for key in ('purelib','platlib'):
    p=sysconfig.get_path(key)
    if p and p not in sys.path: sys.path.append(p)
IDS=['report-craft-chapter-structure','report-craft-calculations','report-craft-format-consistency','report-craft-browser','report-craft-policy-evidence']
def result(i,status,detail): return {'id':IDS[i],'status':status,'detail':str(detail)[:15000]}
def uniform(status,detail): return [result(i,status,detail) for i in range(5)]
def norm(s): return re.sub(r'\s+','',unicodedata.normalize('NFC',s))
def exact_keys(x, keys): return isinstance(x,dict) and set(x)==set(keys)
def require(test,message):
    if not test: raise ValueError(message)
payload=json.load(sys.stdin)
try:
    from bs4 import BeautifulSoup, NavigableString, Tag, Comment
    from markdown_it import MarkdownIt
except ImportError:
    print(json.dumps(uniform('unverified','V2 parser dependencies unavailable (markdown_it/bs4); no installation attempted'))); sys.exit(0)
try:
    ledger=json.loads(payload['ledger'])
    require(type(ledger.get('schemaVersion')) is int and ledger['schemaVersion'] in (2,3),'craft evidence schemaVersion must be 2 or 3')
    fields=['schemaVersion','reportSha256','body','chapters','calculations','policyClaims']
    if ledger['schemaVersion']==3:fields.append('figureLayer')
    require(exact_keys(ledger,fields),'ledger fields do not match its schemaVersion')
    require(ledger['reportSha256']==payload['hashes'],'ledger reportSha256 does not match the three actual artifact bytes')
    require(exact_keys(ledger['body'],['htmlId']),'body requires exact htmlId')
    require(isinstance(ledger['chapters'],list) and 0<len(ledger['chapters'])<=64,'chapters must contain 1..64 analysis chapters')
    require(isinstance(ledger['calculations'],list) and len(ledger['calculations'])<=64,'calculations must contain at most64 entries')
    require(isinstance(ledger['policyClaims'],list) and len(ledger['policyClaims'])<=64,'policyClaims must contain at most64 entries')
    if ledger['schemaVersion']==3:
        layer=ledger['figureLayer']
        require(exact_keys(layer,['fragmentsHtml','sha256','chapters']),'figureLayer needs exact fragmentsHtml/sha256/chapters')
        require(isinstance(layer['fragmentsHtml'],str) and 0<len(layer['fragmentsHtml'].encode())<=131072,'figure fragment bytes must be bounded')
        require(layer['sha256']==hashlib.sha256(layer['fragmentsHtml'].encode()).hexdigest(),'figure fragment hash mismatch')
        require(isinstance(layer['chapters'],list) and len(layer['chapters'])==len(ledger['chapters']),'figure chapter count mismatch')
except Exception as e:
    print(json.dumps(uniform('failed','Craft evidence invalid: '+str(e)))); sys.exit(0)
renderer=MarkdownIt('commonmark',{'html':True}).enable('table')
mdsoup=BeautifulSoup(renderer.render(payload['md']),'html.parser')
htmlsoup=BeautifulSoup(payload['html'],'html.parser')
def hidden(n):
    if not isinstance(n,Tag): return False
    if n.name in ('script','style','head','template','noscript'): return True
    if n.has_attr('hidden') or n.get('aria-hidden','').lower()=='true': return True
    return bool(re.search(r'display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\s*;|\s*$)',n.get('style',''),re.I))
def text(n):
    if isinstance(n,Comment): return ''
    if isinstance(n,NavigableString): return str(n)
    if hidden(n): return ''
    return ' '.join(text(c) for c in n.children) if hasattr(n,'children') else ''
def plain(s): return norm(text(BeautifulSoup(renderer.render(s),'html.parser')))
def unique_id(identifier):
    require(isinstance(identifier,str) and re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{0,95}',identifier),'htmlId must be a bounded explicit DOM id')
    found=htmlsoup.find_all(id=identifier)
    require(len(found)==1,'htmlId is missing or duplicated: '+identifier)
    node=found[0]
    require(not any(hidden(p) for p in [node,*node.parents]),'htmlId is statically hidden: '+identifier)
    return node
expected_visible={}
def span(value, md_scope=None, html_scope=None):
    require(exact_keys(value,['markdown','htmlId']),'Span requires exact markdown/htmlId fields')
    s=value['markdown']; require(isinstance(s,str) and 0<len(s.encode())<=32768,'Span markdown must be nonempty and bounded')
    require(s in (payload['md'] if md_scope is None else md_scope),'Span markdown is absent from its actual MD scope: '+value['htmlId'])
    n=unique_id(value['htmlId']); v=plain(s)
    require(not any(x.name in ('pre','code') for x in [n,*n.parents]) and not any(t.type in ('fence','code_block') for t in renderer.parse(s)), 'code examples cannot be chapter/calculation evidence')
    require(v and norm(text(n))==v,'Span actual MD/HTML visible text differs: '+value['htmlId'])
    if html_scope is not None: require(n is not html_scope and html_scope in n.parents,'part not inside its actual chapter: '+value['htmlId'])
    expected_visible[value['htmlId']]=v
    return n,v
body=None
try:
    body=unique_id(ledger['body']['htmlId']);require(body.name in ('main','article'),'body must locate an actual main/article container')
except Exception as e:
    print(json.dumps(uniform('failed',str(e))));sys.exit(0)
# A closing title is not a global exemption: only one bounded terminal closing
# section can be metadata. Earlier/numbered/duplicate/analysis-shaped sections
# remain in the inventory. This locates structure, not disguised-topic semantics.
def metadata(s):
    return bool(re.match(r'^(?:卷首速览|摘要|目录|总论|来源披露|数据来源|附录|观察清单|信息缺口|封面|封底|免责声明|Introduction|Source Disclosure|Appendix|Contents|Abstract|Disclaimer)(?:\s|[（(:：]|$)',s,re.I))
def closing_title(s):
    return bool(re.fullmatch(r'(?:总结|结语|结论)(?:(?:与|及)(?:行动|建议))?(?:[（(:：].*)?|(?:Conclusion|Summary)(?: and (?:Actions?|Recommendations?))?(?:\s*[:(].*)?',s.strip(),re.I))
def suffix_metadata(s):
    return bool(re.match(r'^(?:来源披露|数据来源|附录|观察清单|信息缺口|封底|免责声明|Source Disclosure|Appendix|Disclaimer)(?:\s|[（(:：]|$)',s,re.I))
def section_nodes(heading):
    nodes=[]
    for node in heading.next_elements:
        if isinstance(node,Tag) and node.name in ('h1','h2') and node is not heading:break
        if isinstance(node,Tag) and heading not in node.parents:nodes.append(node)
    return nodes
def analysis_inventory(root,declared):
    headings=root.find_all('h2');titles=[h.get_text(' ',strip=True) for h in headings]
    candidates=[i for i,s in enumerate(titles) if closing_title(s)]
    declared_positions=[i for i,s in enumerate(titles) if norm(s) in declared]
    last=max(declared_positions,default=-1);excluded=set();reasons=[]
    for i in candidates:
        nodes=section_nodes(headings[i]);paragraphs=[n for n in nodes if n.name=='p' and not any(p.name in ('blockquote','q') for p in n.parents) and norm(text(n))]
        quote=any(n.name in ('blockquote','q') and norm(text(n)) for n in nodes) or any(re.search(r'收束(?:句|金句|引言)\s*[:：]|Closing (?:quote|statement)\s*:',text(n),re.I) for n in paragraphs)
        # Headings/tables or explicit analytical-role blocks signal an analysis
        # section. A terminal rename must not automatically bypass its inventory.
        analysis_shape=any(n.name in ('h3','h4','h5','h6','table') for n in nodes) or any(re.match(r'\s*(?:角色对照|方案对照|事实依据|条款依据|推论与数据|Roles|Basis|Inference)\s*[:：（(]',text(n),re.I) for n in paragraphs)
        allowed=(len(candidates)==1 and last>=0 and i>last and norm(titles[i]) not in declared and all(suffix_metadata(s) for s in titles[i+1:]) and bool(paragraphs) and quote and not analysis_shape)
        if allowed:excluded.add(i)
        else:reasons.append({'heading':titles[i],'reason':'closing requires one unnumbered terminal section after declared chapters, only source/appendix suffix, summary prose plus closing quote, and no analytical subheadings/table/role blocks'})
    return [norm(s) for i,s in enumerate(titles) if i not in excluded and not metadata(s)],reasons
def inventory_detail(label,actual,declared,reasons):
    return label+': '+json.dumps({'actual':actual,'declared':declared,'undeclared':[s for s in actual if s not in declared],'missing':[s for s in declared if s not in actual],'closingNotExempted':reasons},ensure_ascii=False)
# Source ranges use parsed heading token line maps, not a search for arbitrary keywords.
tokens=renderer.parse(payload['md']); source_lines=payload['md'].splitlines(keepends=True); md_sections=[]
for i,t in enumerate(tokens):
    if t.type=='heading_open' and t.tag=='h2' and t.map:
        title=text(BeautifulSoup(renderer.render(tokens[i+1].content),'html.parser')).strip()
        end=next((u.map[0] for u in tokens[i+1:] if u.type=='heading_open' and u.tag in ('h1','h2') and u.map),len(source_lines))
        md_sections.append((norm(title),''.join(source_lines[t.map[0]:end])))
structure_errors=[]
try:
    declared=[norm(c.get('heading','')) for c in ledger['chapters'] if isinstance(c,dict)]
    actual,md_closing_reasons=analysis_inventory(mdsoup,declared)
    require(actual and actual==declared and len(set(actual))==len(actual),inventory_detail('chapter inventory must match every actual MD analysis h2 in order, without omission or duplicates',actual,declared,md_closing_reasons))
    html_actual,html_closing_reasons=analysis_inventory(body,declared)
    require(html_actual==actual,inventory_detail('HTML analysis chapter headings differ from actual MD inventory',html_actual,actual,html_closing_reasons))
    for c in ledger['chapters']:
        require(exact_keys(c,['heading','htmlId','parts']),'chapter requires exact heading/htmlId/parts')
        chapter=unique_id(c['htmlId']);require(body in chapter.parents,'chapter must belong to actual report body')
        hs=chapter.find_all('h2');require(len(hs)==1 and norm(hs[0].get_text(' ',strip=True))==norm(c['heading']),'chapter container must own exactly its declared h2')
        scope=next(s for h,s in md_sections if h==norm(c['heading']))
        p=c['parts']; require(exact_keys(p,['quote','roles','basis','inference','opportunityRisk']),'chapter requires all five named parts')
        require(exact_keys(p['opportunityRisk'],['opportunity','risk']),'fifth part requires distinct opportunity and risk blocks')
        entries=[p[k] for k in ('quote','roles','basis','inference')]+[p['opportunityRisk'][k] for k in ('opportunity','risk')]
        nodes=[]; intervals=[]
        for entry in entries:
            node,value=span(entry,scope,chapter)
            require(node not in nodes and not any(node in n.parents or n in node.parents for n in nodes),'chapter parts must use distinct nonoverlapping visible blocks')
            require(not re.fullmatch(r'章眼金句|金句|角色对照|事实依据|条款依据|推论与数据|机会|风险|Quote|Roles|Basis|Inference|Opportunity|Risk',value,re.I),'part contains only a label, no body')
            pos=scope.find(entry['markdown']);interval=(pos,pos+len(entry['markdown']))
            require(all(interval[1]<=a or b<=interval[0] for a,b in intervals),'chapter MD parts overlap')
            nodes.append(node);intervals.append(interval)
        quote=nodes[0]; require(quote.name in ('blockquote','q') or 'quote' in ' '.join(quote.get('class',[])).lower(),'quote part needs a real quote block/component')
    structure=result(0,'passed','Bounded structure: '+str(len(actual))+' actual MD/HTML analysis chapters each has five separately located nonempty parts (opportunity/risk separate). Not semantic adequacy, truth, or disguised-metadata detection.')
except Exception as e: structure=result(0,'failed',str(e))

calc_errors=[];covered=[];calculation_ids=set();typed_coverage=[];calculated_results={}
def percent(value):
    require(isinstance(value,str) and re.fullmatch(r'[+-]?\d+(?:\.\d{1,6})?%',value),'percent must be an explicit finite decimal string ending in %')
    n=float(value[:-1]);require(math.isfinite(n),'nonfinite percentage')
    return n
def decimal(value):
    require(isinstance(value,str) and re.fullmatch(r'[+-]?\d{1,15}(?:\.\d{1,6})?',value),'quantity value must be a bounded decimal string; no expressions')
    return Decimal(value)
MONEY={'元':Decimal(1),'万元':Decimal(10000),'亿元':Decimal(100000000)}
RENT={u+'/'+p:(factor,p) for u,factor in MONEY.items() for p in ('月','年')}
def quantity(q,units):
    require(exact_keys(q,['value','unit','claim']),'quantity requires exact value/unit/claim')
    n=decimal(q['value']);require(q['unit'] in units,'unsupported or incompatible quantity unit: '+str(q['unit']))
    _,visible=span(q['claim']);require(len(visible)<=500,'quantity span must be a bounded input/result, not a whole chapter')
    numbers=re.findall(r'[+-]?\d+(?:\.\d+)?',visible)
    require(len(numbers)==1 and decimal(numbers[0])==n,'quantity span must contain exactly its one declared number: '+q['claim']['htmlId'])
    require(re.search(re.escape(q['value'])+re.escape(q['unit']),visible),'quantity value and unit must be printed together: '+q['claim']['htmlId'])
    return n,visible

def checked_result(q,expected):
    actual,_=quantity(q,MONEY)
    digits=len(q['value'].split('.')[1]) if '.' in q['value'] else 0
    tolerance=Decimal('0.5')*Decimal(10)**(-digits)
    scaled=expected/MONEY[q['unit']]
    require(abs(actual-scaled)<=tolerance,'calculation output '+q['claim']['htmlId']+' requires '+str(scaled)+' '+q['unit']+', not '+q['value']+' (display rounding only)')

# Coverage inventories quantities with their units, rather than bare numbers.
# Dates, publication years and note/row numbers are context, not arithmetic inputs.
QUANTITY_UNITS=sorted(set(MONEY)|set(RENT)|{'%/月','%/年','%/日','%','倍','月','年','日'},key=len,reverse=True)
QUANTITY_PATTERN=re.compile(r'(?<![\d.])([+-]?\d+(?:\.\d+)?)('+ '|'.join(re.escape(u) for u in QUANTITY_UNITS)+r')')
def quantity_signatures(visible):
    without_dates=re.sub(r'(?<!\d)\d{4}[-/]\d{1,2}[-/]\d{1,2}(?!\d)|(?<!\d)\d{4}年(?:\d{1,2}月(?:\d{1,2}日)?)?', '',visible)
    return Counter((decimal(number),unit) for number,unit in QUANTITY_PATTERN.findall(without_dates))
def claims_for(c,quantities):
    require(isinstance(c['claims'],list) and 1<=len(c['claims'])<=24,'typed calculation requires 1..24 complete visible claim blocks')
    require(len({q['claim']['htmlId'] for q in quantities})==len(quantities),'each typed input/result must bind a distinct visible element')
    values=Counter((decimal(q['value']),q['unit']) for q in quantities)
    rows=[]
    for claim in c['claims']:
        _,visible=span(claim);require(len(visible)<=2500,'calculation claim must be a bounded paragraph or table row')
        # Counter multiplicity catches a second, omitted equal-valued input;
        # unit identity catches equal bare numbers used for different quantities.
        numeric=quantity_signatures(visible)
        require(numeric and not (numeric-values),'claim contains an undeclared numeric input/result, incompatible unit or omitted repeated amount: '+claim['htmlId'])
        rows.append(visible)
    typed_coverage.append((c['kind'],rows))
    return rows

FAMILIES={
 'cash-balance':re.compile(r'净回款|自有资金|资金缺口|资金平衡|购房预算|置换预算|首付缺口|cash.?balance|funding.?gap',re.I),
 'rent-multiple':re.compile(r'月租倍数|年租倍数|租金倍数|租售比倍数|rent.?multiple|P\s*=\s*(?:Rm|月租|年租)',re.I),
 'money-sum':re.compile(r'费用合计|成本合计|金额合计|总费用|total.?cost|money.?sum',re.I),
 'simple-interest':re.compile(r'过桥|计息本金|融资成本|借款成本|贷款利息|bridge.?financing|simple.?interest',re.I),
}
try:
    for c in ledger['calculations']:
        require(isinstance(c,dict) and isinstance(c.get('id'),str) and re.fullmatch(r'[A-Za-z][\w-]{0,63}',c['id']) and c['id'] not in calculation_ids,'calculation id missing/duplicated')
        calculation_ids.add(c['id'])
        kind=c.get('kind')
        if kind=='inverse-yield-range':
            require(exact_keys(c,['id','kind','baseYield','base','scenarios']),'inverse-yield calculation requires exact id/kind/baseYield/base/scenarios')
            base=percent(c['baseYield']);claim_ids=set();require(0<base<=100,'baseYield must be positive and at most100%')
            _,base_text=span(c['base']);require(re.findall(r'[+-]?\d+(?:\.\d+)?%',base_text)==[c['baseYield']], 'base block must contain exactly its explicit common-base percentage');covered.append(base_text);claim_ids.add(c['base']['htmlId'])
            require(isinstance(c['scenarios'],list) and 2<=len(c['scenarios'])<=16,'inverse range requires2..16 scenarios')
            yields=set()
            for row in c['scenarios']:
                require(exact_keys(row,['yield','change','claim']),'scenario requires exact yield/change/claim')
                y=percent(row['yield']);claimed=percent(row['change']);require(0<y<=100 and y not in yields,'scenario yield invalid/duplicated');yields.add(y)
                _,claim=span(row['claim']);require(row['claim']['htmlId'] not in claim_ids,'each scenario/base must bind a distinct visible block');claim_ids.add(row['claim']['htmlId']);require(sorted(re.findall(r'[+-]?\d+(?:\.\d+)?%',claim))==sorted([row['yield'],row['change']]),'scenario block must contain exactly its declared yield and change percentages');covered.append(claim)
                expected=(base/y-1)*100
                digits=len(row['change'].split('.')[1].rstrip('%')) if '.' in row['change'] else 0
                tolerance=.5*(10**-digits)+1e-9
                require(abs(claimed-expected)<=tolerance,'inverse-yield-range '+c['id']+': '+row['yield']+' requires '+format(expected,'.8g')+'% relative to common base '+c['baseYield']+', not '+row['change'])
        elif kind=='cash-balance':
            require(exact_keys(c,['id','kind','uses','sources','result','claims']),'cash-balance requires exact id/kind/uses/sources/result/claims')
            for key in ('uses','sources'):require(isinstance(c[key],list) and 1<=len(c[key])<=24,'cash-balance requires 1..24 uses and sources')
            amounts=[]
            for q in c['uses']+c['sources']:
                n,_=quantity(q,MONEY);require(n>=0,'cash input must be nonnegative; uses/sources define its sign');amounts.append(n*MONEY[q['unit']])
            expected=sum(amounts[:len(c['uses'])])-sum(amounts[len(c['uses']):])
            checked_result(c['result'],expected);claims_for(c,c['uses']+c['sources']+[c['result']])
        elif kind=='rent-multiple':
            require(exact_keys(c,['id','kind','rent','multiple','period','result','claims']),'rent-multiple requires exact id/kind/rent/multiple/period/result/claims')
            rent,_=quantity(c['rent'],RENT);multiple,multiple_text=quantity(c['multiple'],['倍'])
            require(rent>=0 and multiple>0 and c['period'] in ('月','年'),'invalid rent/multiple period or amount')
            require(re.findall(r'月租|年租',multiple_text)==[c['period']+'租'],'multiple span must explicitly identify exactly its 月租 or 年租 basis')
            factor,rent_period=RENT[c['rent']['unit']]
            period_rent=rent*factor*(Decimal(12) if rent_period=='月' and c['period']=='年' else Decimal(1)/12 if rent_period=='年' and c['period']=='月' else 1)
            checked_result(c['result'],period_rent*multiple);claims_for(c,[c['rent'],c['multiple'],c['result']])
        elif kind=='simple-interest':
            require(exact_keys(c,['id','kind','principal','rate','periods','result','claims']),'simple-interest requires exact id/kind/principal/rate/periods/result/claims')
            principal,_=quantity(c['principal'],MONEY);rate,_=quantity(c['rate'],['%/月','%/年','%/日']);periods,_=quantity(c['periods'],['月','年','日'])
            require(principal>=0 and 0<=rate<=100 and periods>=0,'invalid simple-interest inputs')
            require(c['rate']['unit'][2:]==c['periods']['unit'],'interest rate and duration periods differ; convert explicitly before calculation')
            checked_result(c['result'],principal*MONEY[c['principal']['unit']]*rate/100*periods);claims_for(c,[c['principal'],c['rate'],c['periods'],c['result']])
        elif kind=='money-sum':
            require(exact_keys(c,['id','kind','terms','result','claims']),'money-sum requires exact id/kind/terms/result/claims')
            require(isinstance(c['terms'],list) and 1<=len(c['terms'])<=24,'money-sum requires 1..24 terms')
            amounts=[]
            for q in c['terms']:
                n,_=quantity(q,MONEY);require(n>=0,'money-sum terms must be nonnegative');amounts.append(n*MONEY[q['unit']])
            checked_result(c['result'],sum(amounts));rows=claims_for(c,c['terms']+[c['result']])
            # A bridge total can include fees, but only a declared, already
            # recomputed interest result establishes the principal/rate/period.
            # Exact Q identity reuses that visible result; equal amounts alone
            # cannot turn an unrelated sum into proof of interest coverage.
            if any(q==prior['result'] and prior['kind']=='simple-interest' for q in c['terms'] for prior in calculated_results.values()):
                typed_coverage.append(('simple-interest',rows))
        else: raise ValueError('unsupported calculation kind; only inverse-yield-range/cash-balance/rent-multiple/simple-interest/money-sum, no general evaluator')
        if kind!='inverse-yield-range':calculated_results[c['id']]={'kind':kind,'result':c['result']}
    family=re.compile(r'目标(?:租金)?(?:回报率|收益率)|合理价弹性|target\s+yield|price\s+sensitivity|inverse[- ]yield|P\s*=\s*R\s*/\s*y',re.I)
    for node in mdsoup.find_all(['p','tr','li']):
        if any(p.name in ('pre','code') or hidden(p) for p in [node,*node.parents]):continue
        value=norm(text(node))
        if '%' in value and family.search(value):
            require(any(value in c for c in covered),'unbound inverse-yield-family claim in actual MD: '+value[:180])
        # A numerical conclusion needs its whole paragraph/row represented.
        # Keyword coverage is deliberately bounded, not semantic completeness.
        if re.search(r'\d',value) and re.search(r'元|万元|亿元|%|倍|CNY',value,re.I):
            for kind,pattern in FAMILIES.items():
                if pattern.search(value):require(any(k==kind and any(value in v for v in rows) for k,rows in typed_coverage),'unbound '+kind+' claim in actual MD: '+value[:180])
    calc=result(1,'passed','Bounded calculation coverage: '+str(len(calculation_ids))+' declared inverse-yield/cash-balance/rent-multiple/simple-interest/money-sum calculations recomputed and bound to actual MD/HTML. Recognisable family paragraphs/rows must be bound with all unit-bearing inputs/results; contextual dates and note numbers excluded. No proof of unrecognised arithmetic, semantic classifications, factual inputs or omitted assumptions; independent review remains required.')
except Exception as e: calc=result(1,'failed',str(e))

policy_ids=set();policy_coverage=[]
def iso_date(value):
    require(isinstance(value,str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}',value),'policy date requires YYYY-MM-DD')
    return date.fromisoformat(value)
try:
    for p in ledger['policyClaims']:
        require(isinstance(p,dict) and isinstance(p.get('id'),str) and re.fullmatch(r'[A-Za-z][\w-]{0,63}',p['id']) and p['id'] not in policy_ids,'policy id missing/duplicated')
        policy_ids.add(p['id']);status=p.get('status')
        require(status in ('primary-text','conditional'),'policy status must be primary-text or conditional, not self-reported verified/PASS')
        common=['id','status','claim','asOf','jurisdiction']
        require(exact_keys(p,common+(['source'] if status=='primary-text' else ['reason'])),'policy claim has missing or unknown fields')
        _,claim=span(p['claim']);require(len(claim)<=2500,'policy claim must locate a bounded visible paragraph/row')
        asof=iso_date(p['asOf']);require(isinstance(p['jurisdiction'],str) and 0<len(p['jurisdiction'])<=100,'policy jurisdiction must be explicit')
        policy_coverage.append(claim)
        if status=='conditional':
            require(isinstance(p['reason'],str) and 5<=len(p['reason'])<=1000,'conditional policy requires a concrete missing-evidence reason')
            require(re.search(r'未核验|待核实|尚未核实|未经核实|unverified|not\s*verified',claim,re.I),'conditional status must explicitly say unverified/pending verification in the actual report; assumption alone is not verification')
            require(not re.search(r'已确认现行|已核实现行|已验证适用',claim),'conditional claim contradicts its status')
            for current_assumption in re.findall(r'假设[^。；;]{0,30}现行',claim):
                require(re.search(r'不能|不可|不作为|不代表|并非|不是|不等于',current_assumption),'conditional claim must not assume an unverified rule is current')
        else:
            source=p['source'];require(exact_keys(source,['url','documentNumber','publishedAt','effectiveAt','excerpt','claim']),'primary-text requires source url/documentNumber/publishedAt/effectiveAt/excerpt/claim')
            url=urlparse(source['url']);require(url.scheme=='https' and url.hostname and not url.username and not url.password,'official primary-text URL must be a plain HTTPS URL')
            published=iso_date(source['publishedAt']);effective=iso_date(source['effectiveAt']);require(published<=asof and effective<=asof,'policy is not published/effective at the claimed asOf date')
            require(isinstance(source['documentNumber'],str) and 3<=len(source['documentNumber'])<=120,'policy document number must be explicit')
            require(isinstance(source['excerpt'],str) and 12<=len(source['excerpt'])<=4000,'policy requires the operative primary-text excerpt, not just a headline')
            _,context=span(source['claim'])
            require(all(norm(v) in context for v in [source['url'],source['documentNumber'],source['publishedAt'],source['effectiveAt'],p['asOf'],p['jurisdiction'],source['excerpt']]),'official source identity, dates, jurisdiction and operative excerpt must be visible in the bound report source block (print the URL)')
            policy_coverage.append(context)
    pattern=re.compile(r'契税|增值税|个人所得税|限购|限贷|购房资格|普宅标准|普通住房标准|税率|税费政策|tax.?rate|housing.?eligibility',re.I)
    for node in mdsoup.find_all(['p','tr','li']):
        if any(p.name in ('pre','code') or hidden(p) for p in [node,*node.parents]):continue
        value=norm(text(node))
        if pattern.search(value) and re.search(r'\d|现行|有效|取消|执行|适用|免税|免征',value):
            require(any(value in c for c in policy_coverage),'unbound policy claim in actual MD: '+value[:180])
    policy=result(4,'passed','Bounded policy evidence structure: '+str(len(policy_ids))+' visible primary-text declarations or explicitly conditional claims bound to MD/HTML. No network retrieval or legal truth/official-source authenticity/current applicability verification performed; independent reviewer must read official text and assess these facts. Recognisable extra policy claims cannot be omitted.')
except Exception as e:policy=result(4,'failed',str(e))

try:
    mdtext=norm(text(mdsoup));htmltext=norm(text(body));require(len(mdtext)<=100000 and len(htmltext)<=100000,'format text exceeds100000-character inspection limit')
    if ledger['schemaVersion']==3:
        layer=ledger['figureLayer'];fragments=layer['fragmentsHtml']
        declared=[c['heading'] for c in ledger['chapters']]
        require(layer['chapters']==declared,'figure chapter order must match report chapters')
        cards=body.select('[data-chapter]')
        fragment_cards=BeautifulSoup(fragments,'html.parser').select('[data-chapter]')
        require(len(cards)==len(declared) and len(fragment_cards)==len(declared),'exactly one figure card per chapter required')
        require([c.get('data-chapter') for c in cards]==declared and [c.get('data-chapter') for c in fragment_cards]==declared,'figure card chapter/order mismatch')
        for card,original,title in zip(cards,fragment_cards,declared):
            require(str(card)==str(original),'reviewed figure card changed during HTML embedding: '+title)
            parents=[p for p in card.parents if isinstance(p,Tag) and p.name=='section' and p.get('data-report-chapter')==title]
            require(len(parents)==1,'figure card must be inside its named analysis chapter: '+title)
        source_body=BeautifulSoup(str(body),'html.parser')
        for card in source_body.select('[data-chapter]'):card.decompose()
        require(mdtext==norm(text(source_body)),'MD source layer differs from HTML after removing only authenticated figure cards')
    else:require(mdtext==htmltext,'Full actual MD body and HTML report-body text differ (whitespace-only normalization)')
    import fitz
    data=base64.b64decode(payload['pdf'],validate=True);doc=fitz.open(stream=data,filetype='pdf');require(3<=len(doc)<=300,'PDF body inspection page limit')
    body_pages=[]
    for i,page in enumerate(doc):
        if i in (0,len(doc)-1): continue
        # Compare actual body text in reading order; strip only validated footer
        # lines with brand plus exact expected physical body page/total.
        # Use the same PDF engine for body and footer text. pypdf can decode
        # embedded CJK subsets as raw CID bytes even when the page renders and
        # MuPDF decodes it correctly. This is a fixed extractor, never a
        # choose-whichever-matches fallback; real text changes still fail.
        lines=page.get_text('text',sort=False).splitlines();kept=[]
        footer_spans=[s['text'] for b in page.get_text('dict')['blocks'] if 'lines' in b for l in b['lines'] for s in l['spans'] if s['bbox'][1]>=page.rect.height*.85]
        actual_footer=norm(''.join(footer_spans))
        for line in lines:
            compact=norm(line)
            if compact and compact in actual_footer and re.search(r'98wiki|99wiki|智见',compact,re.I) and (str(i)+'/'+str(len(doc)-2) in compact or '第'+str(i)+'页' in compact):continue
            kept.append(line)
        body_pages.append('\n'.join(kept))
    pdftext=norm('\n'.join(body_pages));require(len(pdftext)<=150000,'PDF extracted text exceeds inspection limit')
    # Rendering may repeat a table header or generate list markers. Every
    # accepted residual is derived from the actual Markdown AST/HTML table.
    extras=set()
    for tr in body.select('thead tr'):
        if norm(text(tr)):extras.add(norm(text(tr)))
    for ol in mdsoup.find_all('ol'):
        start=int(ol.get('start',1));n=len(ol.find_all('li',recursive=False))
        extras.add(''.join(str(j)+'.' for j in range(start,start+n)))
        extras.update(str(j)+'.' for j in range(start,start+n))
    changes=[]
    for op,a,b,c,d in difflib.SequenceMatcher(None,htmltext,pdftext,autojunk=False).get_opcodes():
        if op=='equal':continue
        delta=pdftext[c:d]
        if op=='insert' and (delta in extras or (mdsoup.find('ul') is not None and re.fullmatch(r'[•·◦▪]+',delta))):continue
        changes.append({'operation':op,'html':htmltext[a:b][:90],'pdf':delta[:90]})
    require(not changes,'Actual PDF body differs from MD/HTML: '+json.dumps(changes[:3],ensure_ascii=False))
    # Repeated cover values are allowed; new numeric tokens are not. This is a
    # lexical consistency check, not proof of semantic/calculation correctness.
    numeric=lambda s:re.findall(r'(?<![\w])[-+]?\d[\d,]*(?:\.\d+)?(?:%|％)?',s)
    body_nums=set(numeric(text(body)))
    extras_visible=[n for n in htmlsoup.find_all(['header','footer']) if body not in n.parents and n is not body]
    for node in extras_visible:
        for token in numeric(text(node)):require(token in body_nums,'Cover/back adds numeric token absent from MD body: '+token)
    fmt=result(2,'passed','Parsed MD source layer and HTML body agree; schema 3 authenticates a separate reviewed figure layer. Actual PDF body agrees with complete HTML allowing only observed repeated table headers/generated list markers. No new HTML cover/back numeric tokens. This does not certify rendering provenance or formula truth.')
except ImportError:fmt=result(2,'unverified','Format PDF dependency unavailable; no installation attempted')
except Exception as e:fmt=result(2,'failed',str(e))

# Host-owned evidence cache, never an artifact or caller-supplied path. All path
# components are opened without symlink following. A lock makes quota admission
# and atomic immutable publication consistent across concurrent inspections.
SCREENSHOT_ROOT='/root/.cache/dsh-report-craft/evidence'
MAX_PNG_BYTES=8*1024*1024
MAX_CACHE_BYTES=256*1024*1024
MAX_CACHE_FILES=4096
def cache_directory():
    fd=os.open('/',os.O_RDONLY|os.O_DIRECTORY)
    try:
        for part in SCREENSHOT_ROOT.strip('/').split('/'):
            try:os.mkdir(part,0o700,dir_fd=fd)
            except FileExistsError:pass
            child=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd)
            info=os.fstat(child)
            if info.st_uid not in (0,os.geteuid()) or info.st_mode&0o022:
                os.close(child);raise ValueError('Screenshot cache directory is not exclusively Host controlled')
            os.close(fd);fd=child
        return fd
    except BaseException:
        os.close(fd);raise

def persist_screenshot(data,width,browser_hash):
    require(data.startswith(b'\x89PNG\r\n\x1a\n') and 0<len(data)<=MAX_PNG_BYTES,'Screenshot PNG exceeds fixed size limit or has invalid signature')
    require(re.fullmatch('[a-f0-9]{64}',payload['hashes']['html']) and re.fullmatch('[a-f0-9]{64}',browser_hash),'Invalid screenshot identity')
    require(re.fullmatch('[a-zA-Z0-9.-]{1,32}',payload['checkerVersion']) is not None,'Invalid fixed checker identity')
    sha=hashlib.sha256(data).hexdigest()
    name=payload['hashes']['html']+'-'+payload['checkerVersion']+'-'+browser_hash+'-'+str(width)+'x900-'+sha+'.png'
    fd=cache_directory();lock=None;temporary=None
    try:
        lock=os.open('.cache.lock',os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600,dir_fd=fd)
        require(stat.S_ISREG(os.fstat(lock).st_mode),'Invalid screenshot cache lock')
        fcntl.flock(lock,fcntl.LOCK_EX)
        try:
            existing=os.open(name,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=fd)
        except FileNotFoundError:existing=None
        if existing is not None:
            with os.fdopen(existing,'rb') as stream:
                info=os.fstat(stream.fileno())
                require(stat.S_ISREG(info.st_mode) and info.st_nlink==1 and info.st_size==len(data),'Screenshot cache identity conflict')
                require(hashlib.sha256(stream.read(MAX_PNG_BYTES+1)).hexdigest()==sha,'Screenshot cache bytes conflict')
        else:
            total=count=0
            for entry in os.listdir(fd):
                if entry=='.cache.lock':continue
                info=os.stat(entry,dir_fd=fd,follow_symlinks=False)
                require(stat.S_ISREG(info.st_mode) and info.st_nlink==1,'Screenshot cache contains an unsafe entry')
                total+=info.st_size;count+=1
            require(count<MAX_CACHE_FILES and total+len(data)<=MAX_CACHE_BYTES,'Screenshot evidence cache quota exceeded; no image discarded or truncated')
            temporary='.pending-'+secrets.token_hex(16)
            target=os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=fd)
            with os.fdopen(target,'wb') as stream:
                stream.write(data);stream.flush();os.fsync(stream.fileno())
            # link is an atomic create-if-absent: never replace a prior receipt.
            os.link(temporary,name,src_dir_fd=fd,dst_dir_fd=fd,follow_symlinks=False)
            os.unlink(temporary,dir_fd=fd);temporary=None;os.fsync(fd)
        return {'viewport':width,'width':width,'height':900,'coverage':'initial viewport only; not a full-page screenshot','path':SCREENSHOT_ROOT+'/'+name,'viewportScreenshotSha256':sha,'bytes':len(data),'htmlSha256':payload['hashes']['html'],'checkerVersion':payload['checkerVersion'],'browserSha256':browser_hash}
    finally:
        if temporary is not None:
            try:os.unlink(temporary,dir_fd=fd)
            except FileNotFoundError:pass
        if lock is not None:os.close(lock)
        os.close(fd)

# Browser evaluation code is fixed. Report-supplied scripts never execute.
BROWSER_JS=r'''() => {
const displayed=e=>{let n=e;while(n){const s=getComputedStyle(n);if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0)return false;n=n.parentElement}return true};
const visible=e=>{if(!displayed(e))return false;const r=e.getBoundingClientRect();return r.width>0&&r.height>0};
const color=s=>{const m=s.match(/^rgba?\(([^)]+)\)$/);if(!m)return null;const x=m[1].split(/[,\s\/]+/).filter(Boolean).map(Number);return x.length>=3&&x.every(Number.isFinite)?x:null};
const blend=(a,b)=>{const t=a[3]??1;return [0,1,2].map(i=>a[i]*t+b[i]*(1-t))};
const lum=c=>c.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
const fails=[],unknown=[],rects=[],textNodes=[],fontFailures=[];let checked=0;const tw=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
while(tw.nextNode()){const n=tw.currentNode,e=n.parentElement;if(!n.textContent.trim()||!displayed(e)||['SCRIPT','STYLE','NOSCRIPT','TEMPLATE'].includes(e.tagName))continue;const cs=getComputedStyle(e);if(parseFloat(cs.fontSize)===0)continue;const range=document.createRange();range.selectNodeContents(n);const d={n,e,cs,rects:[]},node=textNodes.length;textNodes.push(d);for(const r of range.getClientRects())if(r.width>1&&r.height>1){const box={node,line:d.rects.length,id:e.id,tag:e.tagName,text:n.textContent.trim().slice(0,70),x:r.x,y:r.y,right:r.right,bottom:r.bottom};d.rects.push(box);rects.push(box)};
let bg=[255,255,255],chain=[],p=e,backgroundUnknown=false,effectUnknown=false;while(p){chain.unshift(p);p=p.parentElement}for(const q of chain){const s=getComputedStyle(q),c=color(s.backgroundColor);if(c&&((c[3]??1)===1)){backgroundUnknown=false;bg=[c[0],c[1],c[2]]}else if(c)bg=blend(c,bg);else backgroundUnknown=true;if(s.backgroundImage!=='none')backgroundUnknown=true;if(s.filter!=='none'||s.mixBlendMode!=='normal'||Number(s.opacity)!==1)effectUnknown=true;for(const pseudo of ['::before','::after']){const ps=getComputedStyle(q,pseudo);if(ps.content!=='none'&&ps.content!=='normal'&&ps.display!=='none'&&ps.visibility!=='hidden'&&Number(ps.opacity)!==0&&(ps.backgroundImage!=='none'||ps.backgroundColor!=='rgba(0, 0, 0, 0)'))effectUnknown=true;}}
const size=parseFloat(cs.fontSize),isBody=!!e.closest('main p,main li,article p,article li'),caption=!!e.closest('figcaption,.figcap,.caption,.source');if(size<12||(isBody&&!caption&&size<14))fontFailures.push({id:e.id,text:n.textContent.trim().slice(0,70),fontSize:size,minimum:isBody&&!caption?14:12});
const fg=color(cs.color);if(!fg||cs.textShadow!=='none'||backgroundUnknown||effectUnknown){unknown.push({id:e.id,text:n.textContent.trim().slice(0,70),reason:'unsupported composited background/color'});continue}const f=blend(fg,bg),a=lum(f),b=lum(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05),weight=parseInt(cs.fontWeight)||400,threshold=(size>=24||(size>=18.6667&&weight>=700))?3:4.5;checked++;if(ratio+1e-6<threshold)fails.push({id:e.id,text:n.textContent.trim().slice(0,70),foreground:cs.color,background:bg,ratio,threshold});}
const overflow=rects.filter(r=>r.x<-.5||r.right>innerWidth+.5),clipped=[];for(const e of document.body.querySelectorAll('*')){if(!visible(e))continue;const s=getComputedStyle(e);if((/hidden|clip/.test(s.overflowX)&&e.scrollWidth>e.clientWidth+1)||(/hidden|clip/.test(s.overflowY)&&e.scrollHeight>e.clientHeight+1))clipped.push({id:e.id,tag:e.tagName});}
// Range rectangles describe the font box, not painted glyphs. Derive bounded
// browser-font ink boxes first; only possible intersections need raster proof.
const measureCanvas=document.createElement('canvas'),measure=measureCanvas.getContext('2d');
const geometryUnknown=[],glyphCandidates=[],geometryExamples=[];let confirmed=0,ambiguous=0;
const setupFont=(ctx,s)=>{ctx.font=s.font;ctx.textBaseline='alphabetic';ctx.textAlign='left';ctx.direction='ltr';for(const key of ['fontKerning','fontStretch','fontVariantCaps','letterSpacing','wordSpacing'])if(key in ctx&&s[key])try{ctx[key]=s[key]==='normal'&&key.endsWith('Spacing')?'0px':s[key]}catch{}};
const geometryIssue=(d,reason)=>{if(!d.geometryIssue){d.geometryIssue=reason;geometryUnknown.push({id:d.e.id,tag:d.e.tagName,text:d.n.textContent.trim().slice(0,70),reason})}};
for(const d of textNodes){
 const s=d.cs;let transformed=false;for(let p=d.e;p;p=p.parentElement)if(getComputedStyle(p).transform!=='none'){transformed=true;break}
 if(!measure||s.writingMode!=='horizontal-tb'||s.direction!=='ltr'||s.textTransform!=='none'||s.fontFeatureSettings!=='normal'||transformed){geometryIssue(d,'unsupported text geometry/transform/font feature');continue}
 setupFont(measure,s);const tm=measure.measureText(d.n.textContent);
 if(![tm.fontBoundingBoxAscent,tm.fontBoundingBoxDescent,tm.actualBoundingBoxAscent,tm.actualBoundingBoxDescent].every(Number.isFinite)){geometryIssue(d,'browser did not expose finite actual glyph/font metrics');continue}
 for(const r of d.rects){
  if(Math.abs((tm.fontBoundingBoxAscent+tm.fontBoundingBoxDescent)-(r.bottom-r.y))>2){geometryIssue(d,'DOM range height differs from browser font metrics');continue}
  const ink={...r,y:r.y+tm.fontBoundingBoxAscent-tm.actualBoundingBoxAscent,bottom:r.y+tm.fontBoundingBoxAscent+tm.actualBoundingBoxDescent};
  glyphCandidates.push(ink);
 }
}
const lineCache=new Map();let inspectedCharacters=0;
const lineFor=r=>{
 const d=textNodes[r.node];if(d.geometryIssue)return null;
 if(!lineCache.has(r.node)){
  const lines=d.rects.map(box=>({box,text:'',baseline:0}));let cursor=0,previousX=-Infinity,previousY=-Infinity;
  if(d.n.textContent.length>12000||inspectedCharacters+d.n.textContent.length>60000){geometryIssue(d,'glyph confirmation text resource limit exceeded');return null}
  inspectedCharacters+=d.n.textContent.length;
  const range=document.createRange(),segments=new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(d.n.textContent);
  for(const part of segments){
   range.setStart(d.n,part.index);range.setEnd(d.n,part.index+part.segment.length);const pieces=[...range.getClientRects()].filter(x=>x.width>.01&&x.height>0);
   if(!pieces.length)continue;if(pieces.length!==1){geometryIssue(d,'grapheme spans multiple browser boxes');return null}
   const p=pieces[0];if(p.y===previousY&&p.x<previousX-.5)cursor++;
   while(cursor<lines.length&&!(Math.abs(lines[cursor].box.y-p.y)<.6&&p.x>=lines[cursor].box.x-.6&&p.right<=lines[cursor].box.right+1.6))cursor++;
   if(cursor>=lines.length){geometryIssue(d,'cannot bind grapheme to an exact laid-out line');return null}
   lines[cursor].text+=part.segment;previousX=p.x;previousY=p.y;
  }
  for(const line of lines){
   setupFont(measure,d.cs);const tm=measure.measureText(line.text);
   if(!line.text||Math.abs(tm.width-(line.box.right-line.box.x))>1.6||Math.abs(tm.fontBoundingBoxAscent+tm.fontBoundingBoxDescent-(line.box.bottom-line.box.y))>2){geometryIssue(d,'line text/font measurement differs from DOM layout; no collision inference');return null}
   line.baseline=line.box.y+tm.fontBoundingBoxAscent;
  }
  lineCache.set(r.node,lines);
 }
 return lineCache.get(r.node)[r.line];
};
const rasterPair=(a,b)=>{
 const one=lineFor(a),two=lineFor(b);if(!one||!two)return null;
 const x=Math.floor(Math.max(a.x,b.x))-2,y=Math.floor(Math.max(a.y,b.y))-2,w=Math.ceil(Math.min(a.right,b.right))-x+2,h=Math.ceil(Math.min(a.bottom,b.bottom))-y+2;
 if(w<1||h<1)return {pixels:0};if(w*h>512000)return null;
 const paint=(line,node)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{willReadFrequently:true});if(!ctx)return null;setupFont(ctx,textNodes[node].cs);ctx.fillStyle='#000';ctx.fillText(line.text,line.box.x-x,line.baseline-y);return ctx.getImageData(0,0,w,h).data};
 const p=paint(one,a.node),q=paint(two,b.node);if(!p||!q)return null;let pixels=0,left=w,top=h,right=0,bottom=0;
 for(let i=0;i<w*h;i++)if(p[i*4+3]>32&&q[i*4+3]>32){pixels++;const px=i%w,py=Math.floor(i/w);left=Math.min(left,px);top=Math.min(top,py);right=Math.max(right,px);bottom=Math.max(bottom,py)}
 return {pixels,...(pixels?{pixelBounds:{x:x+left,y:y+top,right:x+right+1,bottom:y+bottom+1}}:{})};
};
glyphCandidates.sort((a,b)=>a.y-b.y);let pairs=0;
for(let i=0;i<glyphCandidates.length;i++)for(let j=i+1;j<glyphCandidates.length&&glyphCandidates[j].y<glyphCandidates[i].bottom;j++){
 const a=glyphCandidates[i],b=glyphCandidates[j],w=Math.min(a.right,b.right)-Math.max(a.x,b.x),h=Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y);if(w<=.5||h<=.5)continue;
 if(++pairs>2000){ambiguous++;break}
 const proof=rasterPair(a,b);
 if(proof===null){ambiguous++;continue}
 if(proof.pixels>3){confirmed++;if(geometryExamples.length<8)geometryExamples.push({first:{id:a.id,tag:a.tag,node:a.node,line:a.line,text:a.text},second:{id:b.id,tag:b.tag,node:b.node,line:b.line,text:b.text},sameTextNode:a.node===b.node,intersectionPixels:proof.pixels,pixelBounds:proof.pixelBounds,method:'DOM line placement plus browser-font alpha-raster intersection'})}
}
const overlap=confirmed;

const ids={};for(const e of document.querySelectorAll('[id]'))ids[e.id]={visible:visible(e),text:e.innerText??''};const unresolvedAssets=[...document.images].filter(i=>!i.complete||i.naturalWidth===0).length+document.querySelectorAll('iframe,object,embed').length;const broken=[...document.querySelectorAll('a[href^="#"]')].map(e=>e.getAttribute('href')).filter(s=>s.length>1&&!document.getElementById(s.slice(1)));
const deadControls=[...document.querySelectorAll('button,[role="button"],a[href=""],a[href="#"],a[href^="javascript:"]')].filter(e=>displayed(e)).map(e=>({tag:e.tagName,text:(e.innerText??'').slice(0,60)}));
const hiddenText=[...document.querySelectorAll('main h1,main h2,main h3,main p,main li,main [data-chapter],article h1,article h2,article h3,article p,article li,article [data-chapter]')].filter(e=>e.textContent.trim()&&!visible(e)).map(e=>({tag:e.tagName,text:e.textContent.trim().slice(0,60)}));
return {viewport:innerWidth,checked,aaFailures:fails.slice(0,12),aaFailureCount:fails.length,fontFailures:fontFailures.slice(0,8),fontFailureCount:fontFailures.length,deadControls:deadControls.slice(0,8),deadControlCount:deadControls.length,hiddenText:hiddenText.slice(0,8),hiddenTextCount:hiddenText.length,unsupported:unknown.slice(0,5),unsupportedCount:unknown.length,overflow:overflow.slice(0,5),overflowCount:overflow.length,clipped:clipped.slice(0,5),clippedCount:clipped.length,overlapCount:overlap,overlaps:geometryExamples,geometryUnsupported:geometryUnknown.slice(0,5),geometryUnsupportedCount:geometryUnknown.length+ambiguous,glyphCandidatePairCount:pairs,unresolvedAssets,brokenInternalLinks:broken.slice(0,5),ids};
}'''
try:
    from playwright.sync_api import sync_playwright
    require(os.path.isfile(payload['browser']) and os.access(payload['browser'],os.X_OK),'controlled browser executable unavailable')
    if htmlsoup.find('script'):raise ValueError('Report scripts are forbidden; browser inspection never executes them')
    def file_hash(path):
        h=hashlib.sha256()
        with open(path,'rb') as stream:
            for chunk in iter(lambda:stream.read(1024*1024),b''):h.update(chunk)
        return h.hexdigest()
    browser_hash=file_hash(payload['browser'])
    screenshots=[];metrics=[];attempted=[]
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=payload['browser'],headless=True,args=['--no-sandbox','--disable-background-networking','--disable-component-update','--disable-sync','--host-resolver-rules=MAP * ~NOTFOUND'])
        try:
            for width in (1280,375):
                ctx=browser.new_context(viewport={'width':width,'height':900},device_scale_factor=1,java_script_enabled=False,service_workers='block')
                try:
                    def reject(route): attempted.append(route.request.url.split(':',1)[0]);route.abort()
                    ctx.route('**/*',reject)
                    page=ctx.new_page();page.set_content(payload['html'],wait_until='load',timeout=10000)
                    value=page.evaluate(BROWSER_JS)
                    mismatches=[]
                    for identifier,expected in expected_visible.items():
                        actual=value['ids'].get(identifier)
                        if not actual or not actual['visible'] or norm(actual['text'])!=expected:mismatches.append(identifier)
                    value['boundVisibleTextMismatches']=mismatches
                    del value['ids'];metrics.append(value)
                    # Persist actual PNG bytes in the fixed Host cache, separate from business output.
                    screenshots.append(persist_screenshot(page.screenshot(timeout=5000,full_page=False),width,browser_hash))
                finally:ctx.close()
            version=browser.version
        finally:browser.close()
    hard=any(m['aaFailureCount'] or m['fontFailureCount'] or m['deadControlCount'] or m['hiddenTextCount'] or m['overflowCount'] or m['clippedCount'] or m['overlapCount'] or m['brokenInternalLinks'] or m['boundVisibleTextMismatches'] for m in metrics)
    unknown=bool(attempted) or any(m['unsupportedCount'] or m['geometryUnsupportedCount'] or m['unresolvedAssets'] or not m['checked'] for m in metrics)
    state='failed' if hard else 'unverified' if unknown else 'passed'
    browser_result=result(3,state,json.dumps({'scope':'Actual1280/375 static report DOM, bounded AA/DOM-line and glyph-raster/anchor checks; unsupported compositing is unverified, not full Finesse/semantic certification. Report JS disabled; all requests blocked.','screenshotCoverage':'1280x900 and375x900 initial viewports only; DOM metrics inspect laid-out text throughout the document, not full-page pixel validation','browserVersion':version,'browserSha256':browser_hash,'metrics':metrics,'screenshots':screenshots,'blockedRequestSchemes':attempted[:20]},ensure_ascii=False))
except ImportError:browser_result=result(3,'unverified','Python Playwright unavailable; no installation/network attempted')
except Exception as e:
    message=str(e)
    browser_result=result(3,'failed' if 'Report scripts are forbidden' in message else 'unverified','Browser inspection unavailable: '+message[:500])
print(json.dumps([structure,calc,fmt,browser_result,policy],ensure_ascii=False))
`
