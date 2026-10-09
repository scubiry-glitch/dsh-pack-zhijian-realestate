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
SHELL = ROOT / "references/components/rent-pricing-shell-v3.html"
KINDS = {"挂牌", "成交"}
NATURES = {"观测", "计算", "推断", "建议", "待确认"}
TIERS = ("listing", "expected", "floor")
METHODS = (
    ("comparable", "依据一 · 同质可比法", "主估计"),
    ("unitArea", "依据二 · 单位面积租金法", "交叉验证"),
    ("substitute", "依据三 · 替代品锚定法", "边界校验"),
)
METHOD_STATUS = {"已核验", "证据不足", "不适用"}


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
    methods = data.get("methods")
    require(isinstance(methods, dict) and set(methods) == {key for key, _, _ in METHODS},
            "methods must contain comparable, unitArea, substitute")
    for key, _, _ in METHODS:
        row = methods[key]
        require(isinstance(row, dict), f"methods.{key} must be an object")
        require(row.get("status") in METHOD_STATUS, f"methods.{key}.status is invalid")
        for field in ("finding", "calculation", "evidence"):
            clean(row.get(field), f"methods.{key}.{field}")
    steps = data.get("calculationSteps")
    require(isinstance(steps, list) and len(steps) <= 20,
            "calculationSteps must be a bounded list")
    for i, row in enumerate(steps):
        require(isinstance(row, dict), f"calculationSteps[{i}] must be an object")
        for field in ("step", "inputs", "formula", "result", "evidence"):
            clean(row.get(field), f"calculationSteps[{i}].{field}")
    require(steps or not any(tiers[key].get("value") is not None or
                             tiers[key].get("range") is not None for key in TIERS),
            "priced tiers require calculationSteps")
    trend = data.get("communityTrend")
    require(isinstance(trend, dict), "communityTrend must be an object")
    require(trend.get("status") in ("available", "unavailable"),
            "communityTrend.status is invalid")
    for field in ("scope", "source"):
        clean(trend.get(field), f"communityTrend.{field}")
    months = trend.get("months")
    require(isinstance(months, list), "communityTrend.months must be a list")
    if trend["status"] == "available":
        require(len(months) == 12, "available communityTrend requires 12 months")
        observed = 0
        previous = None
        for i, row in enumerate(months):
            require(isinstance(row, dict), f"communityTrend.months[{i}] must be an object")
            month = row.get("month")
            require(isinstance(month, str) and re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", month),
                    f"communityTrend.months[{i}].month must be YYYY-MM")
            index = int(month[:4]) * 12 + int(month[5:])
            require(previous is None or index == previous + 1,
                    "communityTrend months must be consecutive")
            previous = index
            if row.get("value") is not None:
                money(row["value"], f"communityTrend.months[{i}].value")
                observed += 1
        require(observed >= 2, "available communityTrend requires two observed months")
        as_of = date.fromisoformat(data["asOfDate"])
        as_of_index = as_of.year * 12 + as_of.month
        require(previous <= as_of_index,
                "communityTrend cannot include months after asOfDate")
    else:
        require(not months, "unavailable communityTrend must have no months")
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
    row_height = 26
    height = 78 + row_height * len(rows)
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
        y = 57 + i * row_height
        px = x(row["price"])
        color = "#245bd1" if row["identity"] == "挂牌" else "#178b75"
        label = row["label"][:18] + ("…" if len(row["label"]) > 18 else "")
        parts.append(f'<text x="8" y="{y+4}" font-size="13" fill="#17243a">{esc(label)}</text>'
                     f'<line x1="{left}" y1="{y}" x2="{right}" y2="{y}" stroke="#e7edf5"/>'
                     f'<circle cx="{px:.1f}" cy="{y}" r="6" fill="{color}"/>'
                     f'<text x="{right+7}" y="{y+4}" font-size="12" fill="#53647a">{esc(fmt(row["price"]))}</text>')
    parts.append("</svg>")
    return "".join(parts)


def trend_chart(trend):
    if trend["status"] != "available":
        return '<p class="empty">本轮未取得可核的近 12 个月社区租金序列；不绘制趋势图。</p>'
    rows = trend["months"]
    values = [row["value"] for row in rows if row.get("value") is not None]
    lo, hi = min(values), max(values)
    pad = max((hi - lo) * .15, 50)
    lo = max(0, lo - pad)
    hi += pad
    left, right, top, bottom = 54, 774, 22, 212
    x = lambda i: left + i * (right - left) / 11
    y = lambda value: bottom - (value - lo) * (bottom - top) / (hi - lo)
    parts = ['<svg viewBox="0 0 820 258" role="img" aria-label="近 12 个月社区租金趋势">',
             '<title>近 12 个月社区租金趋势，缺失月份断线；不代表目标户型成交租金</title>']
    for i in range(3):
        value = lo + (hi - lo) * i / 2
        py = y(value)
        parts.append(f'<line x1="{left}" y1="{py:.1f}" x2="{right}" y2="{py:.1f}" stroke="#dbe3ef"/>'
                     f'<text x="{left-6}" y="{py+4:.1f}" text-anchor="end" font-size="11" fill="#53647a">{esc(fmt(value))}</text>')
    last = None
    for i, row in enumerate(rows):
        px = x(i)
        parts.append(f'<text x="{px:.1f}" y="238" text-anchor="middle" font-size="9" fill="#53647a">{esc(row["month"])}</text>')
        if row.get("value") is None:
            last = None
            continue
        py = y(row["value"])
        if last is not None:
            parts.append(f'<line x1="{last[0]:.1f}" y1="{last[1]:.1f}" x2="{px:.1f}" y2="{py:.1f}" stroke="#245bd1" stroke-width="2.5"/>')
        parts.append(f'<circle cx="{px:.1f}" cy="{py:.1f}" r="4" fill="#245bd1"/>')
        last = (px, py)
    parts.append('</svg>')
    return ''.join(parts)


def trend_period_note(trend, asof):
    if trend["status"] != "available":
        return ""
    first, last = trend["months"][0]["month"], trend["months"][-1]["month"]
    as_of_date = date.fromisoformat(asof)
    lag = as_of_date.year * 12 + as_of_date.month - (int(last[:4]) * 12 + int(last[5:]))
    note = f"最近可得连续 12 个月：{first}—{last}。"
    if lag > 1:
        note += f"末期较报告基准月滞后 {lag} 个月，不能代表当前月租水平。"
    return note


def render(data):
    title = data["title"]
    asof = data["asOfDate"]
    intro = data["summary"].split("。", 1)[0].strip()
    if len(intro) > 120:
        intro = intro[:120].rstrip("，；、 ") + "…"
    elif not intro.endswith(("。", "！", "？", "…")):
        intro += "。"
    boundary = data["property"]["unknowns"] or data["property"]["conditions"]
    h = [f'<section class="card cover"><span class="eyebrow">租金定价报告 · 数据基准 {esc(asof)}</span>'
         f'<h1>{esc(title)}</h1><p class="cover-summary">{esc(intro)}</p>'
         f'<div class="meta"><div><span>标的</span><span>{esc(data["property"]["summary"])}</span></div>'
         f'<div><span>基准日</span><span>{esc(asof)}</span></div>'
         '<div><span>价格口径</span><span>月租金 · 元/月</span></div>'
         '<div><span>样本性质</span><span>挂牌与成交分开标注</span></div></div>'
         + (f'<div class="warnbox"><strong>先说前提：</strong>{esc(boundary[0])}</div>' if boundary else '')
         + '</section>']
    h.append('<section class="card conclusion"><h2>一、结论先行（三档定价）</h2>'
             f'<p class="conclusion-lede">{esc(data["summary"])}</p><div class="tiers">')
    for key, variant in (("listing", "p3"), ("expected", "primary"), ("floor", "p2")):
        t = data["tiers"][key]
        display = tier_display(t)
        value = (f'{esc(display[:-4])}<em>元/月</em>' if display.endswith(" 元/月") else esc(display))
        h.append(f'<article class="tier {variant}"><div class="t">{esc(t["label"])} · {esc(t["nature"])}</div>'
                 f'<div class="v">{value}</div><div class="u">{esc(t["basis"])}</div><div class="bar"></div></article>')
    h.append('</div><div class="price-explain">')
    for key in TIERS:
        t = data["tiers"][key]
        h.append(f'<div class="price-reason"><b>{esc(t["label"])} · 证据</b>'
                 f'<span>{esc(t.get("source", "待确认"))}</span></div>')
    h.append('</div><p class="mini">挂牌、成交与业主底线的性质各异；缺少成交或成本证据时，只给推断或待确认。</p></section>')
    h.append('<section class="card"><h2>二、适用前提与产品形态</h2><p>核实出租形态后，再使用上述价格。</p>')
    h.append('<ul class="facts">' + "".join(f"<li>{esc(x)}</li>" for x in data["property"]["conditions"]) + "</ul>")
    if data["property"]["unknowns"]:
        h.append('<div class="warnbox"><strong>待确认：</strong>' + "；".join(esc(x) for x in data["property"]["unknowns"]) + "</div>")
    if data.get("cases"):
        h.append('<div class="ab">')
        for index, row in enumerate(data["cases"]):
            h.append(f'<div class="case {"a" if index == 0 else "b"}"><h3>{esc(row["title"])}</h3>'
                     f'<div class="who">{esc(row["condition"])}</div><p><strong>{esc(row["decision"])}</strong></p></div>')
        h.append('</div>')
    h.append('</section>')
    h.append('<section class="card"><h2>三、三种定价参考依据</h2>'
             '<p class="section-intro">同质可比给主估计，单位面积法作交叉验证，替代品只约束边界；同源数据不得算作独立证据。</p><div class="flow">')
    for index, (key, label, role) in enumerate(METHODS, 1):
        row = data["methods"][key]
        h.append(f'<article class="method"><div class="method-head"><span class="method-index">0{index}</span>'
                 f'<div><b>{esc(label)}</b><span class="method-role">{esc(role)}</span></div>'
                 f'<span class="tag">{esc(row["status"])}</span></div>'
                 f'<p class="method-finding">{esc(row["finding"])}</p>'
                 f'<div class="method-evidence"><p><span>计算过程</span>{esc(row["calculation"])}</p>'
                 f'<p><span>证据入口</span>{esc(row["evidence"])}</p></div></article>')
    h.append("</div></section>")
    h.append('<section class="card"><h2>四、计算逻辑明细（可复现）</h2><p class="mini">每一步列出输入、算式、结果与证据；仅复算已给出数值的决策量。</p>')
    if data["calculationSteps"]:
        h.append('<div class="table-wrap"><table class="calculation-table"><thead><tr><th>步骤</th><th>输入</th><th>算式</th><th>结果</th><th>证据</th></tr></thead><tbody>')
        for row in data["calculationSteps"]:
            h.append('<tr>' + ''.join(f'<td>{esc(row[key])}</td>' for key in ("step", "inputs", "formula", "result", "evidence")) + '</tr>')
        h.append('</tbody></table></div>')
    else:
        h.append('<p class="empty">承重价格尚未具备可复算输入，暂无计算步骤。</p>')
    h.append('</section>')
    legend = "蓝点＝挂牌，绿点＝成交"
    if data["tiers"]["listing"].get("value") is not None:
        legend += "，金色虚线＝建议挂牌"
    h.append('<section class="card"><h2>五、可比明细表</h2>'
             f'<p class="sample-boundary"><strong>样本边界：</strong>{esc(data["sampleBoundary"])}</p>'
             '<figure class="figure"><h3>可比样本月租分布</h3>' +
             chart(data["comparables"], data["tiers"]["listing"].get("value")) +
             '<figcaption>' + legend + '。仅展示输入文件中经核实的样本；非市场全量。</figcaption></figure>')
    if data["comparables"]:
        h.append('<div class="table-wrap"><table class="comparables-table"><thead><tr><th>样本</th><th>月租</th><th>面积</th><th>性质</th><th>时间</th><th>来源</th></tr></thead><tbody>')
        for row in data["comparables"]:
            area = f'{fmt(row["area"])}㎡' if row.get("area") is not None else "未核"
            h.append(f'<tr><td>{esc(row["label"])}</td><td>{esc(fmt(row["price"]))}</td><td>{esc(area)}</td>'
                     f'<td>{esc(row["identity"])}</td><td>{esc(row["date"])}</td><td>{esc(row["source"])}</td></tr>')
        h.append('</tbody></table></div>')
    else:
        h.append('<p class="empty">暂无经核实的可比明细。</p>')
    h.append('</section>')
    trend = data["communityTrend"]
    period_note = trend_period_note(trend, asof)
    h.append('<section class="card"><h2>六、近 12 个月社区租金趋势</h2>'
             f'<p class="caption">{esc(period_note)}口径：{esc(trend["scope"])}。社区跨户型趋势只用于市场背景，不代替目标房的同质可比定价。</p>'
             '<figure class="figure trend-figure">' + trend_chart(trend) +
             f'<figcaption>{("逐月数值见下表；缺失月份断线，不插值。" if trend["status"] == "available" else "数据缺口：" + esc(trend["source"]))}</figcaption></figure>')
    if trend["status"] == "available":
        h.append('<div class="table-wrap"><table><thead><tr><th>月份</th><th>社区月租（元/月）</th></tr></thead><tbody>')
        for row in trend["months"]:
            h.append(f'<tr><td>{esc(row["month"])}</td><td>{esc(fmt(row["value"])) if row.get("value") is not None else "缺失"}</td></tr>')
        h.append('</tbody></table></div>')
    h.append('</section>')
    h.append('<section class="card"><h2>七、风险与限制</h2><ul class="risks">' +
             "".join(f"<li>{esc(x)}</li>" for x in data["limitations"]) +
             '</ul><h3>证据入口</h3><ol class="sources">' +
             "".join(f"<li>{esc(x)}</li>" for x in data["sources"]) + "</ol></section>")
    h.append('<section class="card"><h2>八、行动建议</h2><ol class="actions">' +
             "".join(f"<li>{esc(x)}</li>" for x in data["actions"]) + "</ol></section>")
    shell = SHELL.read_text(encoding="utf-8")
    require(shell.count("{{TITLE}}") == 1 and shell.count("{{CONTENT}}") == 1,
            "invalid rent pricing shell")
    page = shell.replace("{{TITLE}}", esc(title)).replace("{{CONTENT}}", "\n".join(h))
    m = [f"# {md(title)}", "", f"基准日：{md(asof)}。", "",
         "## 一、结论先行（三档定价）", "", md(data["summary"]), "",
          "| 决策量 | 金额 | 性质 | 依据 | 来源 |",
          "|---|---:|---|---|---|"]
    for key in TIERS:
        t = data["tiers"][key]
        m.append(f'| {md(t["label"])} | {md(tier_display(t))} | {md(t["nature"])} | {md(t["basis"])} | {md(t.get("source", "待确认"))} |')
    m += ["", "## 二、适用前提与产品形态", "", md(data["property"]["summary"])]
    m += [f"- {md(x)}" for x in data["property"]["conditions"]]
    m += [f"- 待确认：{md(x)}" for x in data["property"]["unknowns"]]
    if data.get("cases"):
        m.append("")
        m += [f'- **{md(x["title"])}**：{md(x["condition"])}；{md(x["decision"])}' for x in data["cases"]]
    m += ["", "## 三、三种定价参考依据", "", "同质可比为主估计，单位面积法作交叉验证，替代品只约束边界；同源数据不算独立证据。", ""]
    for key, label, role in METHODS:
        row = data["methods"][key]
        m.append(f'- **{label}｜{role}｜{md(row["status"])}**：{md(row["finding"])}；计算：{md(row["calculation"])}；证据：{md(row["evidence"])}')
    m += ["", "## 四、计算逻辑明细（可复现）", "", "| 步骤 | 输入 | 算式 | 结果 | 证据 |", "|---|---|---|---|---|"]
    for row in data["calculationSteps"]:
        m.append('| ' + ' | '.join(md(row[key]) for key in ("step", "inputs", "formula", "result", "evidence")) + ' |')
    if not data["calculationSteps"]:
        m += ["", "承重价格尚未具备可复算输入，暂无计算步骤。"]
    m += ["", "## 五、可比明细表", "", f'样本边界：{md(data["sampleBoundary"])}', "",
          "| 样本 | 月租（元/月） | 面积 | 性质 | 日期 | 来源 |",
          "|---|---:|---:|---|---|---|"]
    for row in data["comparables"]:
        m.append(f'| {md(row["label"])} | {fmt(row["price"])} | {fmt(row["area"]) if row.get("area") is not None else "未核"} | {md(row["identity"])} | {md(row["date"])} | {md(row["source"])} |')
    if not data["comparables"]:
        m += ["", "暂无经核实的可比明细。"]
    m += ["", "## 六、近 12 个月社区租金趋势", "",
          f'{md(period_note)}口径：{md(trend["scope"])}；来源：{md(trend["source"])}。社区跨户型趋势只用于市场背景，不代替目标房的同质可比定价。', ""]
    if trend["status"] == "available":
        m += ["| 月份 | 社区月租（元/月） |", "|---|---:|"]
        m += [f'| {row["month"]} | {fmt(row["value"]) if row.get("value") is not None else "缺失"} |' for row in trend["months"]]
    else:
        m.append("本轮未取得可核的近 12 个月社区租金序列；不绘制趋势图。")
    m += ["", "## 七、风险与限制", ""]
    m += [f'- {md(x)}' for x in data["limitations"]]
    m += ["", "来源："] + [f'- {md(x)}' for x in data["sources"]]
    m += ["", "## 八、行动建议", ""]
    m += [f'{i+1}. {md(x)}' for i, x in enumerate(data["actions"])]
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
        "template": "rent-pricing-shell-v3",
        "dataSha256": digest(raw),
        "mdSha256": digest(md_bytes),
        "htmlSha256": digest(html_bytes),
        "pdfSha256": digest(pdf_bytes),
        "sourceCount": len(data["sources"]),
        "comparableCount": len(data["comparables"]),
        "calculationStepCount": len(data["calculationSteps"]),
        "trendPointCount": sum(row.get("value") is not None for row in data["communityTrend"]["months"]),
        "independentReview": "required",
    }
    args.ledger.parent.mkdir(parents=True, exist_ok=True)
    args.ledger.write_text(json.dumps(ledger, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
