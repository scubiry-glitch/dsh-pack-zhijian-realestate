#!/usr/bin/env python3
"""Render one rent-pricing data file into matching Markdown and HTML."""
import argparse
from datetime import date
import hashlib
import html
import json
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parent.parent
SHELL = ROOT / "references/components/rent-pricing-shell-v2.html"
KINDS = {"挂牌", "成交"}
NATURES = {"观测", "计算", "推断", "建议", "待确认"}
TIERS = ("listing", "expected", "floor")


def require(ok, message):
    if not ok:
        raise ValueError(message)


def clean(value, name, limit=1200):
    require(isinstance(value, str), f"{name} must be text")
    value = re.sub(r"[\x00-\x1f\x7f]", " ", value).strip()
    require(0 < len(value) <= limit and "〔" not in value and "〕" not in value,
            f"{name} is blank, too long, or contains a template placeholder")
    return value


def text_list(value, name, limit=30):
    require(isinstance(value, list) and len(value) <= limit, f"{name} must be a bounded list")
    return [clean(item, f"{name}[{i}]") for i, item in enumerate(value)]


def money(value, name):
    require(type(value) in (int, float) and 0 < value <= 1000000 and
            value == value and value not in (float("inf"), -float("inf")),
            f"{name} must be a finite positive monthly rent")
    return value


def validate(data):
    require(isinstance(data, dict), "report data must be an object")
    for field in ("title", "asOfDate", "summary", "sampleBoundary"):
        clean(data.get(field), field)
    require(re.fullmatch(r"\d{4}-\d{2}-\d{2}", data["asOfDate"]),
            "asOfDate must be YYYY-MM-DD")
    try:
        date.fromisoformat(data["asOfDate"])
    except ValueError as error:
        raise ValueError("asOfDate must be a real calendar date") from error
    property_data = data.get("property")
    require(isinstance(property_data, dict), "property must be an object")
    clean(property_data.get("summary"), "property.summary")
    text_list(property_data.get("conditions"), "property.conditions")
    text_list(property_data.get("unknowns"), "property.unknowns")
    tiers = data.get("tiers")
    require(isinstance(tiers, dict) and set(tiers) == set(TIERS),
            "tiers must contain listing, expected, floor")
    for key in TIERS:
        tier = tiers[key]
        require(isinstance(tier, dict), f"tiers.{key} must be an object")
        clean(tier.get("label"), f"tiers.{key}.label")
        clean(tier.get("basis"), f"tiers.{key}.basis")
        require(tier.get("nature") in NATURES, f"tiers.{key}.nature is invalid")
        value, bounds = tier.get("value"), tier.get("range")
        require(not (value is not None and bounds is not None),
                f"tiers.{key} cannot declare both value and range")
        if value is not None:
            money(value, f"tiers.{key}.value")
        if bounds is not None:
            require(isinstance(bounds, list) and len(bounds) == 2,
                    f"tiers.{key}.range must have two values")
            require(money(bounds[0], f"tiers.{key}.range[0]") <=
                    money(bounds[1], f"tiers.{key}.range[1]"),
                    f"tiers.{key}.range is reversed")
        if value is None and bounds is None:
            require(tier["nature"] == "待确认", f"tiers.{key} missing value must be 待确认")
        else:
            clean(tier.get("source"), f"tiers.{key}.source")
    comps = data.get("comparables")
    require(isinstance(comps, list) and len(comps) <= 30,
            "comparables must be a bounded list")
    for i, row in enumerate(comps):
        require(isinstance(row, dict), f"comparables[{i}] must be an object")
        for field in ("label", "source", "date"):
            clean(row.get(field), f"comparables[{i}].{field}")
        require(row.get("identity") in KINDS, f"comparables[{i}].identity must be 挂牌 or 成交")
        money(row.get("price"), f"comparables[{i}].price")
        if row.get("area") is not None:
            money(row["area"], f"comparables[{i}].area")
    logic = data.get("logic")
    require(isinstance(logic, list) and 1 <= len(logic) <= 6,
            "logic needs 1 to 6 findings")
    for i, row in enumerate(logic):
        require(isinstance(row, dict), f"logic[{i}] must be an object")
        for field in ("title", "finding", "evidence"):
            clean(row.get(field), f"logic[{i}].{field}")
    for field in ("actions", "limitations", "sources"):
        text_list(data.get(field), field)
    require(data["sources"], "at least one source is required")
    cases = data.get("cases", [])
    require(isinstance(cases, list) and len(cases) <= 4, "cases must be a bounded list")
    for i, row in enumerate(cases):
        require(isinstance(row, dict), f"cases[{i}] must be an object")
        for field in ("title", "condition", "decision"):
            clean(row.get(field), f"cases[{i}].{field}")


def esc(value):
    return html.escape(str(value), quote=True)


def md(value):
    return str(value).replace("\\", "\\\\").replace("|", "\\|").replace("\n", " ")


def fmt(value):
    return f"{value:,.0f}" if value == int(value) else f"{value:,.1f}"


def tier_display(tier):
    if tier.get("value") is not None:
        return f"{fmt(tier['value'])} 元/月"
    if tier.get("range") is not None:
        return f"{fmt(tier['range'][0])}—{fmt(tier['range'][1])} 元/月"
    return "待确认"


def chart(rows, listing):
    if not rows:
        return '<p class="empty">本轮未取得可绘制的同质样本；不绘制价格分布图，也不据此报市场均价。</p>'
    prices = [row["price"] for row in rows]
    if listing is not None:
        prices.append(listing)
    lo, hi = min(prices), max(prices)
    pad = max((hi - lo) * .13, 100)
    lo = max(0, lo - pad)
    hi += pad
    width, left, right = 810, 220, 730
    height = 78 + 34 * len(rows)
    x = lambda value: left + (value - lo) / (hi - lo) * (right - left)
    parts = [f'<svg viewBox="0 0 {width} {height}" role="img" aria-label="可比样本月租价格分布">'
             '<title>可比样本月租价格分布，挂牌与成交分色，建议价为虚线</title>']
    for i in range(5):
        value = lo + (hi - lo) * i / 4
        px = x(value)
        parts.append(f'<line x1="{px:.1f}" y1="38" x2="{px:.1f}" y2="{height-24}" stroke="#dbe3ef"/>'
                     f'<text x="{px:.1f}" y="23" text-anchor="middle" font-size="12" fill="#53647a">{esc(fmt(value))}</text>')
    if listing is not None:
        px = x(listing)
        parts.append(f'<line x1="{px:.1f}" y1="33" x2="{px:.1f}" y2="{height-24}" stroke="#aa7926" stroke-width="2" stroke-dasharray="5 4"/>')
    for i, row in enumerate(rows):
        y = 57 + i * 34
        px = x(row["price"])
        color = "#245bd1" if row["identity"] == "挂牌" else "#178b75"
        label = row["label"][:18] + ("…" if len(row["label"]) > 18 else "")
        parts.append(f'<text x="8" y="{y+4}" font-size="13" fill="#17243a">{esc(label)}</text>'
                     f'<line x1="{left}" y1="{y}" x2="{right}" y2="{y}" stroke="#e7edf5"/>'
                     f'<circle cx="{px:.1f}" cy="{y}" r="6" fill="{color}"/>'
                     f'<text x="{right+7}" y="{y+4}" font-size="12" fill="#53647a">{esc(fmt(row["price"]))}</text>')
    parts.append("</svg>")
    return "".join(parts)


def render(data):
    title = data["title"]
    asof = data["asOfDate"]
    h = [f'<header class="cover"><p class="eyebrow">具体标的 · 月租金决策</p><h1>{esc(title)}</h1>'
         f'<p class="lede">{esc(data["summary"])}</p><div class="meta"><span>基准日：{esc(asof)}</span>'
         f'<span>标的：{esc(data["property"]["summary"])}</span><span>金额单位：元/月</span></div></header>']
    h.append('<section class="card notice"><h2>先确认适用条件</h2>')
    h.append('<ul class="facts">' + "".join(f"<li>{esc(x)}</li>" for x in data["property"]["conditions"]) + "</ul>")
    if data["property"]["unknowns"]:
        h.append('<p class="empty"><b>待确认：</b>' + "；".join(esc(x) for x in data["property"]["unknowns"]) + "</p>")
    h.append("</section>")
    h.append('<section class="card"><h2>结论先行：三档价格如何用</h2><div class="price-grid">')
    for key in TIERS:
        t = data["tiers"][key]
        h.append(f'<article class="price"><span class="label">{esc(t["label"])}</span>'
                 f'<strong>{esc(tier_display(t))}</strong><span class="tag">{esc(t["nature"])}</span>'
                 f'<p>{esc(t["basis"])}</p><p class="caption">依据：{esc(t.get("source", "待确认"))}</p></article>')
    h.append('</div><p class="caption">挂牌、成交与业主底线的性质各异；缺少成交或成本证据时，只给推断或待确认。</p></section>')
    if data.get("cases"):
        h.append('<section class="card"><h2>不同出租形态分别判断</h2><div class="split">')
        for row in data["cases"]:
            h.append(f'<div class="subcard"><h3>{esc(row["title"])}</h3><p>{esc(row["condition"])}</p><p><b>{esc(row["decision"])}</b></p></div>')
        h.append("</div></section>")
    legend = "蓝点＝挂牌，绿点＝成交"
    if data["tiers"]["listing"].get("value") is not None:
        legend += "，金色虚线＝建议挂牌"
    h.append('<section class="card"><h2>样本如何约束价格</h2><p class="section-lede">' +
             esc(data["sampleBoundary"]) + '</p><figure class="figure"><h3>可比样本月租分布</h3>' +
             chart(data["comparables"], data["tiers"]["listing"].get("value")) +
             '<figcaption>' + legend +
             '。仅展示输入文件中经核实的样本；非市场全量。</figcaption></figure>')
    if data["comparables"]:
        h.append('<div class="table-wrap"><table><thead><tr><th>样本</th><th>月租</th><th>面积</th><th>性质</th><th>时间</th><th>来源</th></tr></thead><tbody>')
        for row in data["comparables"]:
            area = f'{fmt(row["area"])}㎡' if row.get("area") is not None else "未核"
            h.append(f'<tr><td>{esc(row["label"])}</td><td>{esc(fmt(row["price"]))}</td><td>{esc(area)}</td>'
                     f'<td>{esc(row["identity"])}</td><td>{esc(row["date"])}</td><td>{esc(row["source"])}</td></tr>')
        h.append("</tbody></table></div>")
    h.append("</section>")
    h.append('<section class="card"><h2>定价依据与边界</h2><div class="flow">')
    for row in data["logic"]:
        h.append(f'<div><b>{esc(row["title"])}</b>{esc(row["finding"])}'
                 f'<p class="caption">{esc(row["evidence"])}</p></div>')
    h.append("</div></section>")
    h.append('<section class="card"><h2>挂牌与复核动作</h2><ol class="actions">' +
             "".join(f"<li>{esc(x)}</li>" for x in data["actions"]) + "</ol></section>")
    h.append('<section class="card"><h2>风险、缺口与来源</h2><ul class="facts">' +
             "".join(f"<li>{esc(x)}</li>" for x in data["limitations"]) +
             '</ul><h3>证据入口</h3><ol class="sources">' +
             "".join(f"<li>{esc(x)}</li>" for x in data["sources"]) + "</ol></section>")
    shell = SHELL.read_text(encoding="utf-8")
    require(shell.count("{{TITLE}}") == 1 and shell.count("{{CONTENT}}") == 1,
            "invalid rent pricing shell")
    page = shell.replace("{{TITLE}}", esc(title)).replace("{{CONTENT}}", "\n".join(h))
    m = [f"# {md(title)}", "", f"基准日：{md(asof)}。{md(data['summary'])}", "",
         "## 先确认适用条件", "", md(data["property"]["summary"])]
    m += [f"- {md(x)}" for x in data["property"]["conditions"]]
    m += [f"- 待确认：{md(x)}" for x in data["property"]["unknowns"]]
    m += ["", "## 结论先行：三档价格如何用", "",
          "| 决策量 | 金额 | 性质 | 依据 | 来源 |",
          "|---|---:|---|---|---|"]
    for key in TIERS:
        t = data["tiers"][key]
        m.append(f'| {md(t["label"])} | {md(tier_display(t))} | {md(t["nature"])} | {md(t["basis"])} | {md(t.get("source", "待确认"))} |')
    if data.get("cases"):
        m += ["", "## 不同出租形态分别判断", ""]
        m += [f'- **{md(x["title"])}**：{md(x["condition"])}；{md(x["decision"])}' for x in data["cases"]]
    m += ["", "## 样本如何约束价格", "", md(data["sampleBoundary"]), "",
          "| 样本 | 月租（元/月） | 面积 | 性质 | 日期 | 来源 |",
          "|---|---:|---:|---|---|---|"]
    for row in data["comparables"]:
        m.append(f'| {md(row["label"])} | {fmt(row["price"])} | {fmt(row["area"]) if row.get("area") is not None else "未核"} | {md(row["identity"])} | {md(row["date"])} | {md(row["source"])} |')
    m += ["", "## 定价依据与边界", ""]
    m += [f'- **{md(x["title"])}**：{md(x["finding"])}；证据：{md(x["evidence"])}' for x in data["logic"]]
    m += ["", "## 挂牌与复核动作", ""]
    m += [f'{i+1}. {md(x)}' for i, x in enumerate(data["actions"])]
    m += ["", "## 风险、缺口与来源", ""]
    m += [f'- {md(x)}' for x in data["limitations"]]
    m += ["", "来源："] + [f'- {md(x)}' for x in data["sources"]]
    return "\n".join(m) + "\n", page


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, required=True)
    ap.add_argument("--md", type=Path, required=True)
    ap.add_argument("--html", type=Path, required=True)
    ap.add_argument("--pdf", type=Path, required=True)
    ap.add_argument("--ledger", type=Path, required=True)
    args = ap.parse_args()
    require(len({x.resolve() for x in (args.data, args.md, args.html, args.pdf, args.ledger)}) == 5,
            "data and outputs must use distinct paths")
    raw = args.data.read_bytes()
    require(len(raw) <= 512000, "data file too large")
    data = json.loads(raw)
    validate(data)
    md_out, html_out = render(data)
    md_bytes, html_bytes = md_out.encode(), html_out.encode()
    digest = lambda value: hashlib.sha256(value).hexdigest()
    for path, content in ((args.md, md_bytes), (args.html, html_bytes)):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
    from playwright.sync_api import sync_playwright
    args.pdf.parent.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, args=["--no-sandbox"])
        page = browser.new_page()
        page.goto(args.html.resolve().as_uri(), wait_until="load")
        page.pdf(path=str(args.pdf), format="A4", print_background=True,
                 display_header_footer=False)
        browser.close()
    pdf_bytes = args.pdf.read_bytes()
    ledger = {
        "template": "rent-pricing-shell-v2",
        "dataSha256": digest(raw),
        "mdSha256": digest(md_bytes),
        "htmlSha256": digest(html_bytes),
        "pdfSha256": digest(pdf_bytes),
        "sourceCount": len(data["sources"]),
        "comparableCount": len(data["comparables"]),
        "independentReview": "required",
    }
    args.ledger.parent.mkdir(parents=True, exist_ok=True)
    args.ledger.write_text(json.dumps(ledger, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
