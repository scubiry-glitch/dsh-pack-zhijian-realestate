#!/usr/bin/env python3
"""Offline MD single-source rendering. Creates drafts and locators, never review evidence."""
import argparse
import hashlib
import html
import io
import json
import os
from pathlib import Path
import re
import shutil
import stat
import sys
import sysconfig
import tempfile


# Same interpreter-owned install paths as the domain checker; ignore PYTHONPATH under -I.
for key in ('purelib', 'platlib'):
    installed = sysconfig.get_path(key)
    if installed and installed not in sys.path:
        sys.path.append(installed)


def require(ok, message):
    if not ok:
        raise ValueError(message)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def norm(value):
    return re.sub(r'\s+', '', value)


def snapshot(path):
    require(path.is_absolute(), '--md must be absolute')
    before = path.lstat()
    require(stat.S_ISREG(before.st_mode) and before.st_size <= 2 * 1024 * 1024,
            'MD must be a bounded regular file, not a symlink')
    raw = path.read_bytes()
    after = path.lstat()
    require((before.st_dev, before.st_ino, before.st_mtime_ns, before.st_size) ==
            (after.st_dev, after.st_ino, after.st_mtime_ns, len(raw)), 'MD changed during read')
    return raw


def render_body(md):
    from markdown_it import MarkdownIt
    from bs4 import BeautifulSoup, NavigableString
    parser = MarkdownIt('commonmark', {'html': True}).enable('table')
    tokens = parser.parse(md)
    for token in tokens:
        require(token.type not in ('html_block', 'html_inline', 'image'),
                'builder supports Markdown without raw HTML or images; use a custom renderer for these')
        require(not any(t.type in ('html_inline', 'image') for t in token.children or []),
                'builder supports Markdown without raw HTML or images; use a custom renderer for these')
    lines = md.splitlines(keepends=True)
    candidates = []
    # Token line maps preserve exact source ranges, including quotes, lists and tables.
    for token in tokens:
        if token.nesting == 1 and token.map and not token.hidden:
            index = len(candidates)
            candidates.append(''.join(lines[token.map[0]:token.map[1]]).rstrip('\r\n'))
            token.attrSet('data-source-index', str(index))
    soup = BeautifulSoup(parser.renderer.render(tokens, parser.options, {}), 'html.parser')
    require(not soup.find(['script', 'style', 'iframe', 'object', 'embed', 'img']), 'unsupported active content')
    for a in soup.find_all('a'):
        require(re.match(r'^(https?://|mailto:|#)', a.get('href', ''), re.I), 'unsupported link scheme')
    main = soup.new_tag('main', id='report-body')
    for child in list(soup.contents):
        main.append(child.extract())
    soup.append(main)
    sections, stack, serial = [], [], 0
    for child in list(main.contents):
        if child.name and re.fullmatch(r'h[1-6]', child.name):
            level = int(child.name[1])
            while stack and stack[-1][0] >= level:
                stack.pop()
            if level >= 2:
                serial += 1
                section = soup.new_tag('section', id=f'section-{serial:03d}')
                if level == 2:
                    section['class'] = ['chapter']
                    sections.append({'heading': child.get_text(' ', strip=True), 'htmlId': section['id']})
                (stack[-1][1] if stack else main).append(section)
                stack.append((level, section))
        if stack:
            stack[-1][1].append(child.extract())
    for table in main.find_all('table'):
        table['class'] = ['data-table']
    for quote in main.find_all('blockquote'):
        quote['class'] = ['quote-line']
    anchors, serial = [], 0
    def visible(node):
        return ''.join(node.strings)
    def add(node, source, kind):
        nonlocal serial
        if not source or source not in md or not norm(visible(node)):
            return
        if norm(BeautifulSoup(parser.render(source), 'html.parser').get_text()) != norm(visible(node)):
            return
        if node.name in ('pre', 'code') or node.find_parent(['pre', 'code']):
            return
        serial += 1
        if not node.get('id'):
            node['id'] = f'anchor-{serial:04d}'
        chapter = node.find_parent('section', class_='chapter')
        anchors.append({'kind': kind, 'chapterId': chapter.get('id') if chapter else None,
                        'span': {'markdown': source, 'htmlId': node['id']}})
    for node in main.select('[data-source-index]'):
        source = candidates[int(node.attrs.pop('data-source-index'))]
        add(node, source, node.name)
    # A subsection is useful when one craft part contains a heading and several blocks.
    headings = [(i, t) for i, t in enumerate(tokens) if t.type == 'heading_open' and int(t.tag[1]) >= 2]
    for section, (index, token) in zip(main.find_all('section'), headings):
        end = next((t.map[0] for t in tokens[index + 1:] if t.type == 'heading_open'
                    and int(t.tag[1]) <= int(token.tag[1]) and t.map), len(lines))
        if token.tag != 'h2':
            add(section, ''.join(lines[token.map[0]:end]).rstrip('\r\n'), 'section')
    # Cell contents and quantities are exact MD substrings, not inferred calculations.
    for node in main.find_all(['td', 'th']):
        add(node, visible(node).strip(), node.name)
    quantity = re.compile(r'(?<![\d.,])[+-]?\d+(?:\.\d+)?(?:亿元|万元|元|平方米|㎡|%|％|个月|月|年|日|倍)(?:/月|/年|/日)?')
    for text_node in list(main.find_all(string=True)):
        if not isinstance(text_node, NavigableString) or text_node.find_parent(['pre', 'code', 'a']):
            continue
        value = str(text_node)
        matches = [m for m in quantity.finditer(value) if m.group() in md]
        if not matches:
            continue
        offset = 0
        for match in matches:
            text_node.insert_before(NavigableString(value[offset:match.start()]))
            node = soup.new_tag('span')
            node.string = match.group()
            text_node.insert_before(node)
            add(node, match.group(), 'quantity')
            offset = match.end()
        text_node.insert_before(NavigableString(value[offset:]))
        text_node.extract()
    expected = norm(BeautifulSoup(parser.render(md), 'html.parser').get_text())
    require(len(expected) <= 100000, 'visible body exceeds checker inspection limit')
    require(norm(visible(main)) == expected, 'renderer changed visible MD content')
    title = main.find('h1')
    require(title is not None and len(title.get_text()) <= 160, 'MD needs a bounded h1 title (up to 160 characters)')
    require(sections, 'MD needs at least one h2 chapter')
    return str(main), title.get_text(' ', strip=True), sections, anchors


def build(md_path, out, variant):
    from weasyprint import HTML
    from pypdf import PdfReader, PdfWriter
    import fitz
    raw = snapshot(md_path)
    md = raw.decode('utf-8')
    require(out.is_absolute() and out.parent.is_dir(), '--out-dir needs an existing absolute parent directory')
    require(not os.path.lexists(out), '--out-dir must be new; use a new directory for each revision')
    body, title, sections, anchors = render_body(md)
    root = Path(__file__).resolve().parent.parent
    base = (root / 'references/components/base-v2.css').read_text()
    palette = (root / f'references/components/{variant}-v2.css').read_text()
    # All resources are inline. Links stay clickable without fetching their targets.
    def no_fetch(url, **kwargs):
        raise ValueError('external/local resource fetch is disabled')
    css = base + '\n' + palette
    css += '\n@media print{h1{font-size:28pt}h2{font-size:18pt}h3{font-size:12pt}.chapter:first-of-type{break-before:auto}li{list-style-position:inside}table{break-inside:auto}thead{display:table-header-group}tr{break-inside:avoid}h1{bookmark-level:none}a{overflow-wrap:anywhere}}'
    def document(content, extra=''):
        return ('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'
                '<meta name="viewport" content="width=device-width, initial-scale=1">'
                '<title>' + html.escape(title) + '</title><style>' + css + extra + '</style></head>'
                '<body><div class="report">' + content + '</div></body></html>')
    cover = '<header class="cover"><div class="hero"><p>智见研究</p><h1>' + html.escape(title) + '</h1></div></header>'
    back = '<footer class="back-cover"><p class="back-brand">智见</p><p>' + html.escape(title) + '</p></footer>'
    full_html = document(cover + body + back).encode('utf-8')
    footer = '@page{@bottom-center{content:"智见 · " counter(page) "/" counter(pages);font-family:"Noto Sans CJK SC",sans-serif;font-size:9pt;color:#333}}'
    body_pdf = HTML(string=document(body, footer), url_fetcher=no_fetch).write_pdf()
    cover_css = '@media print{h1{bookmark-level:none}.cover{break-after:auto}.back-cover{break-before:auto}}'
    writer = PdfWriter()
    for content in (cover, None, back):
        part = body_pdf if content is None else HTML(string=document(content, cover_css), url_fetcher=no_fetch).write_pdf()
        reader = PdfReader(io.BytesIO(part))
        require(content is None or len(reader.pages) == 1, 'cover/back overflow; shorten h1 title')
        writer.append(reader)
    target = io.BytesIO()
    writer.write(target)
    pdf = target.getvalue()
    require(len(full_html) <= 2 * 1024 * 1024 and len(pdf) <= 20 * 1024 * 1024, 'rendered artifact exceeds checker size limit')
    with fitz.open(stream=pdf, filetype='pdf') as doc:
        require(3 <= len(doc) <= 300, 'PDF exceeds inspection page limit')
        total = len(doc) - 2
        for i in range(1, len(doc) - 1):
            footer_text = ''.join(s['text'] for b in doc[i].get_text('dict')['blocks'] if 'lines' in b
                                  for line in b['lines'] for s in line['spans'] if s['bbox'][1] >= doc[i].rect.height * .85)
            require('智见' in footer_text and f'{i}/{total}' in norm(footer_text), 'PDF footer rendering failed')
    hashes = {'md': digest(raw), 'html': digest(full_html), 'pdf': digest(pdf)}
    inventory = {'schemaVersion': 1, 'reportSha256': hashes, 'body': {'htmlId': 'report-body'},
                 'chapters': sections, 'anchors': anchors,
                 'notice': 'Locator inventory only. AI must choose nonoverlapping parts and declare complete calculation/policy evidence; no quality approval.'}
    index = {'reportSha256': hashes, 'body': inventory['body'], 'chapters': sections,
             'anchors': [{'kind': a['kind'], 'chapterId': a['chapterId'], 'htmlId': a['span']['htmlId'],
                          'characters': len(a['span']['markdown']), 'preview': a['span']['markdown'][:80]}
                         for a in anchors]}
    manifest = {'status': 'RENDERED_DRAFT', 'qualityApproved': False, 'variant': variant,
                'sourcePath': str(md_path), 'reportSha256': hashes, 'bodyPages': total,
                'builderSha256': digest(Path(__file__).read_bytes())}
    stage = Path(tempfile.mkdtemp(prefix='.report-build-', dir=out.parent))
    try:
        for name, data in [('report.md', raw), ('report.html', full_html), ('report.pdf', pdf),
                           ('anchors-index.json', (json.dumps(index, ensure_ascii=False, indent=2) + '\n').encode()),
                           ('anchors.json', (json.dumps(inventory, ensure_ascii=False, indent=2) + '\n').encode()),
                           ('build.json', (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode())]:
            (stage / name).write_bytes(data)
        require(snapshot(md_path) == raw, 'MD changed during rendering; output not published')
        # Reserve the final directory exclusively; partial copy is never a success.
        out.mkdir()
        try:
            for child in stage.iterdir():
                child.rename(out / child.name)
        except BaseException:
            shutil.rmtree(out)
            raise
    finally:
        shutil.rmtree(stage)
    return {**manifest, 'outputDirectory': str(out), 'anchors': len(anchors)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--md', required=True, type=Path)
    parser.add_argument('--out-dir', required=True, type=Path)
    parser.add_argument('--variant', required=True, choices=['credit-policy', 'designer-paper'])
    args = parser.parse_args()
    try:
        print(json.dumps(build(args.md, args.out_dir, args.variant), ensure_ascii=False))
        return 0
    except Exception as error:
        print(json.dumps({'status': 'NOT_RENDERED', 'qualityApproved': False,
                          'error': f'{type(error).__name__}: {error}'}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
