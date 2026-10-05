/**
 * zhijian-report-craft-core-v1: three PARTIAL BASIS checks, never all G1–G5.
 * Basis SKILL.md SHA256 c4d04f4b206eccbccd42569c870f11a4b5b1137aa3b35eae7a5e8951433281eb
 * Basis report-template-fivepiece-v1.md SHA256 36f95a6a8302ef1346638a58bd491e53e4e524b5ed2372e25a7012ebd89e5cd0
 * Only supplied, hash-bound artifact contents are used; paths are not opened.
 * Static HTML extraction is not browser visibility/visual review. Closing
 * structure is not proof of semantic three-element synthesis. Independent
 * content/visual review and the remaining craft gates are still required.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
const IDS = ['report-craft-source-disclosure', 'report-craft-closing-structure', 'report-craft-pdf-structure'];
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 64 * 1024;
// Fixed domain-pack program; the complete installed pack is digest-bound by Host.
// No artifact-supplied code or shell interpolation.
const PYTHON_HELPER = String.raw `
import sys, json, re, io, base64, sysconfig
from html.parser import HTMLParser
from html import unescape

IDS = ['report-craft-source-disclosure', 'report-craft-closing-structure', 'report-craft-pdf-structure']
def result(i, status, detail):
    return {'id': IDS[i], 'status': status, 'detail': detail}
def norm(s):
    return re.sub(r'[\s*\x60_#]+', '', unescape(s)).strip()
def title(s):
    return re.sub(r'^(?:第[一二三四五六七八九十百0-9]+[章节篇]|[一二三四五六七八九十]+[、.．]|[0-9]+[、.．])\s*', '', s).strip(' ：:—-')
def source_heading(s):
    return bool(re.match(r'^(?:数据)?来源披露(?:\s|[（(:：]|$)|^(?:data\s+)?source\s+disclosure\b', title(s), re.I))
def closing_heading(s):
    return bool(re.match(r'^(?:(?:总结|结语|结论)(?:(?:与|及)(?:行动|建议))?|收束总结|总结与展望)(?:\s|[（(:：]|$)|^(?:conclusion|closing\s+summary|summary\s+and\s+conclusion)\b', title(s), re.I))
def clean(s):
    return re.sub(r'[*_\x60]', '', unescape(s)).strip()

def markdown_sections(md):
    sections, current, fence = [], None, None
    # Raw HTML comments and code examples are not disclosure/closing evidence.
    md = re.sub(r'<!--.*?-->', '', md, flags=re.S)
    md = re.sub(r'<(script|style|pre|code|template)\b[^>]*>.*?</\1\s*>', '', md, flags=re.I|re.S)
    md = re.sub(r'<([a-z][\w-]*)\b[^>]*(?:\shidden(?=\s|=|>)|display\s*:\s*none|aria-hidden\s*=\s*[\"\']true)[^>]*>.*?</\1\s*>', '', md, flags=re.I|re.S)
    for raw in md.splitlines():
        line = raw.strip()
        marker = re.match(r'^(\x60{3,}|~{3,})', line)
        if marker:
            if fence is None: fence = marker.group(1)[0]
            elif marker.group(1)[0] == fence: fence = None
            continue
        if fence: continue
        h = re.match(r'^(#{1,6})\s+(.+?)\s*#*$', line)
        if h:
            current = {'level':len(h.group(1)), 'title':clean(h.group(2)), 'rows':[], 'quotes':[]}
            sections.append(current)
        elif current and line:
            if line.startswith('<'): continue  # raw HTML isn't parsed as Markdown-visible text
            text = clean(re.sub(r'^[-+]\s+', '', line))
            current['rows'].append(text)
            if line.startswith('>'):
                current['quotes'].append(clean(line.lstrip('> ')))
    return sections

class Node:
    def __init__(self, tag='', attrs=None):
        self.tag, self.attrs, self.children = tag, dict(attrs or []), []
class Document(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root, self.stack, self.count = Node(), [], 0
        self.stack = [self.root]
    def handle_starttag(self, tag, attrs):
        self.count += 1
        if self.count > 100000 or len(self.stack) > 256: raise ValueError('HTML structure exceeds inspection limit')
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in ('area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'):
            self.stack.append(node)
    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if len(self.stack) > 1 and self.stack[-1].tag == tag: self.stack.pop()
    def handle_endtag(self, tag):
        for i in range(len(self.stack)-1, 0, -1):
            if self.stack[i].tag == tag:
                self.stack = self.stack[:i]
                return
    def handle_data(self, data): self.stack[-1].children.append(data)

def html_sections(html):
    doc = Document(); doc.feed(html); doc.close()
    # Simple static hidden-class/id/tag rules only. Complex CSS, media queries,
    # clipping, contrast, and script-generated DOM remain independent review.
    hidden_selectors = set()
    for style in re.findall(r'<style\b[^>]*>(.*?)</style\s*>', html, re.I|re.S):
        for selector, declarations in re.findall(r'([^{}]+)\{([^{}]*)\}', style):
            if re.search(r'(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\s*[;!]|\s*$))', declarations, re.I):
                for s in selector.split(','):
                    if re.fullmatch(r'[.#]?[\w-]+', s.strip()): hidden_selectors.add(s.strip())
    def hidden(n):
        if n.tag in ('script','style','head','template','noscript','pre','code'): return True
        a = n.attrs
        if 'hidden' in a or a.get('aria-hidden','').lower() == 'true': return True
        if n.tag in hidden_selectors or '#'+a.get('id','') in hidden_selectors: return True
        if any('.'+x in hidden_selectors for x in a.get('class','').split()): return True
        s = a.get('style','')
        return bool(re.search(r'(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\s*[;!]|\s*$)|font-size\s*:\s*0(?:px|em|rem|pt|%|\s*[;!]|\s*$))', s, re.I))
    def text(n):
        if isinstance(n,str): return n
        if hidden(n): return ''
        if n.tag == 'br': return '\n'
        separator = ' | ' if n.tag == 'tr' else ''
        return separator.join(text(c) for c in n.children)
    sections, current = [], None
    def walk(n):
        nonlocal current
        if isinstance(n,str):
            if current and n.strip(): current['rows'].append(n.strip())
            return
        if hidden(n): return
        if re.fullmatch('h[1-6]', n.tag):
            current = {'level':int(n.tag[1]), 'title':clean(text(n)), 'rows':[], 'quotes':[]}
            sections.append(current); return
        if n.tag in ('p','li','tr','blockquote'):
            if current:
                value = clean(text(n))
                if value: current['rows'].append(value)
                if n.tag == 'blockquote' and value: current['quotes'].append(value)
            return
        for c in n.children: walk(c)
    walk(doc.root)
    return sections

def section_with_children(sections, predicate):
    for i, s in enumerate(sections):
        if predicate(s['title']):
            rows, quotes = list(s['rows']), list(s['quotes'])
            excluded_level = None
            for child in sections[i+1:]:
                if child['level'] <= s['level']: break
                if excluded_level is not None and child['level'] > excluded_level: continue
                excluded_level = None
                # An observation list and its subsections are never disclosure evidence.
                if re.search(r'观察|待补清单|observation', child['title'], re.I):
                    excluded_level = child['level']; continue
                rows.extend(child['rows']); quotes.extend(child['quotes'])
            yield i, s, rows, quotes

STATUS = re.compile(r'已透出数值|本轮采用|已采用|仅趋势|待补|未配置|未采用|未使用|未调用|未接入|通道失败|调用失败|不可用|未交付|无数值|空序列|\b(?:used|not\s+used|unavailable|pending|not\s+configured|trend\s+only)\b', re.I)
CHANNELS = {'Wind': re.compile(r'\bWind\b|万得',re.I), 'zyt': re.compile(r'\bzyt\b|政研通',re.I), 'beike': re.compile(r'\bbeike\b|贝壳',re.I)}
def disclosure(sections):
    areas = list(section_with_children(sections, source_heading))
    if not areas: return ['explicit source-disclosure heading missing']
    found = set()
    for _, _, rows, _ in areas:
        for row in rows:
            # The leading label/table cell identifies the channel. Comparisons
            # later in the row must not reclassify it. 贝壳政研通 is zyt, not a
            # second beike-channel label.
            row = re.sub(r'^[-+>]\s*', '', row).strip().lstrip('|').strip()
            # Parenthetical supplier/caliber explanations do not change the
            # leading channel. A status inside that explanation cannot supply
            # the leading channel's own required status.
            depth=0;split=None
            for i,char in enumerate(row):
                if char in '(（':depth+=1
                elif char in ')）':depth=max(0,depth-1)
                elif depth==0 and char in ':：|':split=i;break
            label=row if split is None else row[:split]
            primary=label
            for _ in range(8):
                reduced=re.sub(r'\([^()]*\)|（[^（）]*）','',primary)
                if reduced==primary:break
                primary=reduced
            primary=primary.replace('贝壳政研通', '政研通')
            channels = [name for name, pattern in CHANNELS.items() if pattern.search(primary)]
            own_status=primary if split is None else row[split+1:]
            if len(channels) == 1 and STATUS.search(own_status): found.add(channels[0])
    return ['missing channel status: '+name for name in CHANNELS if name not in found]
def closing(sections):
    areas = list(section_with_children(sections, closing_heading))
    if not areas: return ['explicit closing-summary heading missing']
    for index, _, rows, quotes in areas:
        # It must close the analysis: only disclosure/observations/appendices may follow.
        later_analysis = [s['title'] for s in sections[index+1:] if s['level'] <= sections[index]['level'] and not source_heading(s['title']) and not re.search(r'观察|附录|免责|参考|来源|observation|appendix|disclaimer|reference', s['title'],re.I)]
        prose = [r for r in rows if r not in quotes and not r.startswith('>') and not re.match(r'^(?:收束金句|结尾金句|closing\s+quote)\s*[:：]',r,re.I)]
        explicit_quote = any(re.match(r'^(?:收束金句|结尾金句|closing\s+quote)\s*[:：]\s*\S',r,re.I) for r in rows)
        if prose and (any(q.strip() for q in quotes) or explicit_quote) and not later_analysis: return []
    return ['closing section needs nonempty summary prose and a blockquote/explicit closing quote, after analysis']

def pdf_check(data, md_sections):
    # -I deliberately ignores PYTHONPATH/cwd. Add only interpreter-defined
    # installation paths (some distributions omit /usr/local under -I).
    for key in ('purelib','platlib'):
        path = sysconfig.get_path(key)
        if path and path not in sys.path: sys.path.append(path)
    try:
        import fitz
        from pypdf import PdfReader
    except ImportError:
        return result(2,'unverified','PDF dependency unavailable under isolated Python (fitz/pypdf); no installation/network attempted')
    try:
        pdf = base64.b64decode(data, validate=True)
        reader = PdfReader(io.BytesIO(pdf), strict=True)
        doc = fitz.open(stream=pdf, filetype='pdf')
        if reader.is_encrypted or doc.needs_pass:
            return result(2,'unverified','Encrypted PDF cannot be inspected')
        n = len(doc)
        if n > 300: return result(2,'unverified','PDF exceeds 300-page inspection resource limit; not a report-length requirement')
        if n != len(reader.pages): return result(2,'failed','PDF parsers disagree on page count')
        if n < 3: return result(2,'failed','PDF needs distinct first/last covers and at least one body page')
        failures, unknown = [], []
        number = re.compile(r'(?:第\s*\d+\s*页|\d+\s*[/／]\s*\d+|page\s+\d+|^\s*\d+\s*$)',re.I)
        for i,page in enumerate(doc):
            spans = [span for block in page.get_text('dict')['blocks'] if 'lines' in block for line in block['lines'] for span in line['spans'] if span.get('alpha',255)>0]
            if not any(s['text'].strip() for s in spans):
                unknown.append('page '+str(i+1)+' has no extractable text'); continue
            # Only physical footer text is accepted, never N/M in body prose.
            footer = '\n'.join(s['text'] for s in spans if s['bbox'][1] >= page.rect.height * .85)
            if i in (0,n-1):
                margins = footer+'\n'+'\n'.join(s['text'] for s in spans if s['bbox'][3] <= page.rect.height * .15)
                if number.search(margins): failures.append('cover page '+str(i+1)+' has margin page numbering')
            else:
                if not re.search(r'98wiki|99wiki|智见', footer, re.I): failures.append('body page '+str(i)+' missing footer brand')
                compact = re.sub(r'\s+','',footer)
                patterns = [r'(?<!\d)'+str(i)+r'[/／]'+str(n-2)+r'(?!\d)', r'第'+str(i)+r'页(?:[/／·|,，;；]*)共'+str(n-2)+r'页']
                if not any(re.search(p,compact) for p in patterns): failures.append('body page '+str(i)+' missing footer '+str(i)+'/'+str(n-2))
        def metadata_heading(s):
            return bool(re.match(r'^(?:卷首|摘要|目录|封面|封底|观察|来源披露|数据来源|来源说明|附录|免责|版权|参考|cover\b|contents\b|abstract\b|observation\b|appendix\b|disclaimer\b|references?\b|source\s+disclosure\b)', title(s),re.I))
        chapters = [s['title'] for s in md_sections if not metadata_heading(s['title']) and (s['level'] == 2 or (s['level'] == 1 and re.match(r'^(?:第[一二三四五六七八九十百0-9]+[章节篇]|[一二三四五六七八九十]+[、.．]|[0-9]+[、.．])',s['title'])))]
        outlines = []
        def walk_outline(items):
            for item in items:
                if isinstance(item,list): walk_outline(item)
                else:
                    dest = reader.get_destination_page_number(item)
                    outlines.append((norm(str(item.title)),dest))
        walk_outline(reader.outline)
        if not outlines: failures.append('PDF chapter outline missing')
        elif not chapters: unknown.append('no MD chapter headings to bind outline coverage')
        for chapter in chapters:
            if not any(name == norm(chapter) and page is not None and 0 <= page < n for name,page in outlines): failures.append('outline missing chapter: '+chapter)
        if failures: return result(2,'failed','; '.join(failures[:20])+('; '+ '; '.join(unknown[:3]) if unknown else ''))
        if unknown: return result(2,'unverified','; '.join(unknown[:10]))
        return result(2,'passed','Partial basis: '+str(n)+' pages; unnumbered first/last margins; every body footer brand and N/'+str(n-2)+'; '+str(len(chapters))+' MD chapter outline targets. No 20–25-page requirement or visual/content certification.')
    except Exception as e:
        return result(2,'failed','Malformed/unreadable PDF or outline: '+type(e).__name__)

payload = json.load(sys.stdin)
md = markdown_sections(payload['md'])
try:
    html = html_sections(payload['html'])
    errors = ['MD: '+x for x in disclosure(md)] + ['HTML: '+x for x in disclosure(html)]
    sources = result(0,'failed' if errors else 'passed','; '.join(errors) if errors else 'Partial basis: Wind/zyt/beike each has status in explicit MD and static HTML source-disclosure sections; observations/hidden/code excluded. Not browser visibility or source truth verification.')
    errors = ['MD: '+x for x in closing(md)] + ['HTML: '+x for x in closing(html)]
    ending = result(1,'failed' if errors else 'passed','; '.join(errors) if errors else 'Partial basis: explicit closing summary prose plus located closing quote in MD and static HTML. Does not judge semantic three-element synthesis or quotability.')
except Exception as e:
    sources = result(0,'unverified','HTML inspection unavailable: '+type(e).__name__)
    ending = result(1,'unverified','HTML inspection unavailable: '+type(e).__name__)
print(json.dumps([sources, ending, pdf_check(payload['pdf'],md)],ensure_ascii=False))
`;
function uniform(status, detail) {
    return IDS.map(id => ({ id, status, detail }));
}
function artifactBytes(artifacts, id, max) {
    const selected = artifacts.filter(artifact => artifact.id === id);
    if (selected.length !== 1)
        throw new Error('binding must match exactly one artifact id');
    const artifact = selected[0];
    if (typeof artifact.content !== 'string' || artifact.content.length > max * 2)
        throw new Error('artifact content exceeds inspection size limit');
    if (artifact.encoding !== undefined && artifact.encoding !== 'utf8' && artifact.encoding !== 'base64')
        throw new Error('unsupported artifact encoding');
    if (artifact.encoding === 'base64' && !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(artifact.content))
        throw new Error('invalid base64 artifact');
    const bytes = Buffer.from(artifact.content, artifact.encoding === 'base64' ? 'base64' : 'utf8');
    if (bytes.length > max)
        throw new Error('artifact bytes exceed inspection size limit');
    if (createHash('sha256').update(bytes).digest('hex') !== artifact.sha256)
        throw new Error('artifact hash differs from binding evidence');
    return bytes;
}
export async function evaluateReportCraft(artifacts, binding) {
    let input;
    try {
        if (binding.id !== 'zhijian-report-craft-core-v1' || new Set([binding.md, binding.html, binding.pdf]).size !== 3)
            throw new Error('invalid report craft binding');
        const md = artifactBytes(artifacts, binding.md, MAX_TEXT_BYTES);
        const html = artifactBytes(artifacts, binding.html, MAX_TEXT_BYTES);
        const pdf = artifactBytes(artifacts, binding.pdf, MAX_PDF_BYTES);
        const decoder = new TextDecoder('utf-8', { fatal: true });
        input = JSON.stringify({ md: decoder.decode(md), html: decoder.decode(html), pdf: pdf.toString('base64') });
    }
    catch (error) {
        return uniform('failed', `Report craft input invalid: ${error instanceof Error ? error.message : 'invalid bytes'}`);
    }
    return new Promise(resolve => {
        let settled = false, output = '', count = 0;
        const child = spawn('python3', ['-I', '-c', PYTHON_HELPER], { shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
        const finish = (results) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            resolve(results);
        };
        const timer = setTimeout(() => {
            child.kill('SIGKILL');
            finish(uniform('unverified', 'Report craft inspection exceeded 10-second resource deadline'));
        }, 10_000);
        child.on('error', () => finish(uniform('unverified', 'Isolated Python report craft inspector unavailable')));
        child.stdin.on('error', () => { });
        child.stderr.on('data', () => { });
        child.stdout.on('data', (chunk) => {
            count += chunk.length;
            if (count > MAX_OUTPUT_BYTES) {
                child.kill('SIGKILL');
                finish(uniform('unverified', 'Report craft inspector output exceeded resource limit'));
            }
            else
                output += chunk.toString('utf8');
        });
        child.on('close', code => {
            if (settled)
                return;
            if (code !== 0)
                return finish(uniform('unverified', 'Isolated report craft inspector did not complete'));
            try {
                const value = JSON.parse(output);
                if (!Array.isArray(value) || value.length !== IDS.length || value.some((item, index) => !item || item.id !== IDS[index] || !['passed', 'failed', 'unverified'].includes(item.status) || typeof item.detail !== 'string' || item.detail.length > 16000))
                    throw new Error('invalid result');
                finish(value);
            }
            catch {
                finish(uniform('unverified', 'Report craft inspector returned invalid results'));
            }
        });
        child.stdin.end(input);
    });
}
