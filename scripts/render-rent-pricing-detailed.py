#!/usr/bin/env python3
"""Render the detailed rent pricing contract from one reviewed JSON file."""
import argparse
from datetime import date
import hashlib
from html import escape
import importlib.util
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / "references/rent-pricing-detailed-template.html"
BASE_SPEC = importlib.util.spec_from_file_location("rent_pricing_v2", ROOT / "scripts/render-rent-pricing.py")
BASE = importlib.util.module_from_spec(BASE_SPEC)
BASE_SPEC.loader.exec_module(BASE)
LEVELS = ("community", "business_circle", "city")
LEVEL_NAMES = {"community": "小区", "business_circle": "商圈", "city": "城市"}
PRICE_KEYS = ("listing", "expected", "modeledConcessionBoundary", "ownerConfirmedMinimum")
PRICE_NAMES = ("建议挂牌", "目标成交", "测算让价边界", "业主确认最低价")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def fmt(value):
    if value is None or value == "":
        return "待确认"
    if isinstance(value, bool):
        return "是" if value else "否"
    if isinstance(value, (int, float)):
        return f"{value:,.0f}" if value == int(value) else f"{value:,.2f}"
    if isinstance(value, list):
        return "；".join(fmt(item) for item in value) if value else "待确认"
    return str(value)


def e(value):
    return escape(fmt(value), quote=True)


def source_text(source):
    if not isinstance(source, dict):
        return fmt(source)
    return "｜".join(fmt(source.get(key)) for key in ("id", "channel", "observedAt", "pathOrUrl", "scope"))


def table(headers, rows, empty="暂无已核数据"):
    head = "".join(f"<th>{e(item)}</th>" for item in headers)
    body = "".join("<tr>" + "".join(f"<td>{e(cell)}</td>" for cell in row) + "</tr>" for row in rows)
    if not body:
        body = f'<tr><td colspan="{len(headers)}">{e(empty)}</td></tr>'
    return f'<div class="scroll"><table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>'


def section(index, label, title, content):
    return (f'<section class="card anchor" id="s{index}"><div class="eyebrow">'
            f'{index:02d} / {e(label)}</div><h2>{e(title)}</h2>{content}</section>')


def chart(title, svg, caption):
    return (f'<figure class="figure"><div class="figure-title">{e(title)}</div>'
            f'{svg}<figcaption>{e(caption)}</figcaption></figure>')


def price_chart(case):
    rows = []
    for key, label in zip(PRICE_KEYS, PRICE_NAMES):
        price = case[key]
        if price.get("value") is not None:
            rows.append((label, price["value"], price.get("nature")))
    if len(rows) < 2:
        return '<p class="mini">有数值的决策量不足两项，暂不绘制价格刻度。</p>'
    low, high = min(x[1] for x in rows), max(x[1] for x in rows)
    low = max(0, low - max(100, (high-low)*.2))
    high += max(100, (high-low)*.2)
    x = lambda value: 180 + (value-low)/(high-low)*540
    parts = [f'<svg viewBox="0 0 820 {90+len(rows)*38}" role="img" aria-label="各决策量价格刻度">'
             '<title>由已核数值绘制的价格刻度；推断与建议不等于真实成交</title>']
    for i, (label, value, nature) in enumerate(rows):
        y = 62+i*38
        parts.append(f'<text x="6" y="{y+4}" font-size="13" fill="#17243a">{e(label)}·{e(nature)}</text>'
                     f'<line x1="180" y1="{y}" x2="720" y2="{y}" stroke="#dbe3ef"/>'
                     f'<circle cx="{x(value):.1f}" cy="{y}" r="6" fill="#245bd1"/>'
                     f'<text x="729" y="{y+4}" font-size="12" fill="#53647a">{e(fmt(value))}</text>')
    parts.append('</svg>')
    return ''.join(parts)


def method_chart(methods):
    rows = []
    for key, label in (("homogeneousComparables", "同质可比"), ("unitArea", "单位面积"), ("substitutes", "替代品")):
        bounds = (methods.get(key) or {}).get("range") or (methods.get(key) or {}).get("bounds")
        if isinstance(bounds, list) and len(bounds) == 2 and all(number(v) for v in bounds):
            rows.append((label, bounds[0], bounds[1]))
    if len(rows) < 2:
        return '<p class="mini">可核的依据区间不足两组，暂不绘制区间图。</p>'
    low, high = min(x[1] for x in rows), max(x[2] for x in rows)
    low = max(0, low-max(100, (high-low)*.08))
    high += max(100, (high-low)*.08)
    x = lambda value: 170 + (value-low)/(high-low)*540
    parts = [f'<svg viewBox="0 0 820 {82+len(rows)*42}" role="img" aria-label="三种依据区间对照">'
             '<title>各依据区间来自不同用途；同源单位面积不构成独立市场样本</title>']
    for i, (label, lo, hi) in enumerate(rows):
        y = 54+i*42
        parts.append(f'<text x="8" y="{y+4}" font-size="13" fill="#17243a">{e(label)}</text>'
                     f'<line x1="{x(lo):.1f}" y1="{y}" x2="{x(hi):.1f}" y2="{y}" stroke="#245bd1" stroke-width="6" stroke-linecap="round"/>'
                     f'<circle cx="{x(lo):.1f}" cy="{y}" r="4" fill="#245bd1"/>'
                     f'<circle cx="{x(hi):.1f}" cy="{y}" r="4" fill="#245bd1"/>'
                     f'<text x="721" y="{y+4}" font-size="12" fill="#53647a">{e(fmt(lo))}–{e(fmt(hi))}</text>')
    parts.append('</svg>')
    return ''.join(parts)


def number(value):
    return type(value) in (int, float) and value == value and 0 < value < 1000000


def validate(data):
    require(data.get("schemaVersion") == 3, "schemaVersion must be 3")
    require(data.get("status") == "reviewed", "only reviewed v3 data can be rendered")
    report = data.get("report") or {}
    subject = data.get("subject") or {}
    for key in ("title", "asOfDate", "oneSentenceConclusion"):
        require(isinstance(report.get(key), str) and report[key].strip(), f"report.{key} required")
    asof = date.fromisoformat(report["asOfDate"])
    for key in ("city", "community", "areaSqm", "areaBasis", "layout", "rentalMode"):
        require(subject.get(key) is not None, f"subject.{key} required")
    require(number(subject["areaSqm"]), "subject.areaSqm invalid")
    cases = data.get("productCases")
    require(isinstance(cases, list) and cases and len(cases) <= 4, "productCases requires 1-4 cases")
    steps = data.get("calculationSteps")
    require(isinstance(steps, list), "calculationSteps must be a list")
    step_ids = {row.get("id") for row in steps}
    require(len(step_ids) == len(steps) and None not in step_ids, "calculationSteps IDs required and unique")
    for row in steps:
        for key in ("inputs", "formula", "result", "evidenceIds"):
            require(row.get(key), f"step {row['id']}.{key} required")
    for case in cases:
        require(case.get("id") and case.get("label") and case.get("condition"), "product case identity missing")
        for key in PRICE_KEYS:
            price = case.get(key)
            require(isinstance(price, dict), f"{case['id']}.{key} required")
            value = price.get("value")
            bounds = price.get("range")
            if value is not None:
                require(number(value), f"{case['id']}.{key}.value invalid")
            if bounds is not None:
                require(isinstance(bounds, list) and len(bounds) == 2 and all(number(x) for x in bounds)
                        and bounds[0] <= bounds[1], f"{case['id']}.{key}.range invalid")
            require(not (value is not None and bounds is not None), f"{case['id']}.{key} has value and range")
            if key == "ownerConfirmedMinimum":
                require(value is None or (price.get("confirmedAt") and price.get("evidenceId")),
                        "owner minimum requires owner confirmation date and evidence")
            elif value is not None or bounds is not None:
                require(price.get("basisStepIds") and set(price["basisStepIds"]) <= step_ids,
                        f"{case['id']}.{key} requires valid calculation steps")
                require(price.get("evidenceIds"), f"{case['id']}.{key} requires evidence IDs")
    comps = data.get("comparables") or []
    comp_ids = [row.get("id") for row in comps]
    require(None not in comp_ids and len(comp_ids) == len(set(comp_ids)), "comparable IDs required and unique")
    pools = data.get("comparablePools") or []
    pool_ids = [row.get("id") for row in pools]
    require(None not in pool_ids and len(pool_ids) == len(set(pool_ids)), "pool IDs required and unique")
    for row in comps:
        require(row.get("poolId") in pool_ids, f"comparable {row['id']} has unknown pool")
        require(number(row.get("monthlyRent")), f"comparable {row['id']} rent invalid")
        require(row.get("identity") in ("挂牌", "成交"), f"comparable {row['id']} identity invalid")
    for pool in pools:
        ids = pool.get("listingIds") or []
        require(all(item in comp_ids for item in ids), f"pool {pool['id']} has unknown listing")
        require(pool.get("validN") == len([row for row in comps if row.get("poolId") == pool["id"] and row.get("included")]),
                f"pool {pool['id']} validN mismatches included comparable rows")
        require(pool.get("identity") in ("挂牌", "成交"), f"pool {pool['id']} identity invalid")
        require(all(row.get("identity") == pool["identity"] for row in comps if row.get("poolId") == pool["id"]),
                f"pool {pool['id']} mixes listing and transaction")
        if pool.get("coverageStatus") != "complete":
            require(pool.get("p25") is None and pool.get("median") is None and pool.get("p75") is None,
                    f"pool {pool['id']} cannot claim full-distribution quantiles")
    for row in data.get("queryAudit") or []:
        raw = row.get("rawCount")
        dedup = row.get("deduplicatedCount")
        excluded = row.get("excludedCount")
        valid = row.get("validCount")
        if all(type(x) is int for x in (raw, dedup, excluded, valid)):
            require(raw - dedup - excluded == valid, f"query {row.get('id')} count mismatch")
        require(row.get("receiptPath") and row.get("receiptSha256"), f"query {row.get('id')} lacks receipt")
        require(re.fullmatch(r"[0-9a-f]{64}", row["receiptSha256"]), f"query {row.get('id')} receipt hash invalid")
    trend = data.get("trend") or {}
    attempts = trend.get("fallbackAttempts") or []
    selected = trend.get("selectedLevel")
    require(selected in LEVELS or selected is None, "trend.selectedLevel invalid")
    require([x.get("level") for x in attempts] == list(LEVELS[:len(attempts)]),
            "trend fallback attempts must follow community, business_circle, city")
    if selected:
        require(trend.get("status") == "available", "selected trend must be available")
        require(len(attempts) == LEVELS.index(selected) + 1 and attempts[-1].get("status") == "selected",
                "trend must stop at first selected level")
        for key in ("selectedName", "geoId", "indicatorKey", "indicatorMeaning", "unit", "source"):
            require(trend.get(key), f"trend.{key} required")
        months = trend.get("months") or []
        require(len(months) == 12, "selected trend requires 12 calendar months")
        previous = None
        observed = 0
        for row in months:
            month = row.get("month")
            require(isinstance(month, str) and re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", month),
                    "trend month must be YYYY-MM")
            index = int(month[:4]) * 12 + int(month[5:])
            require(previous is None or index == previous + 1, "trend months must be consecutive")
            previous = index
            if row.get("value") is not None:
                require(number(row["value"]), "trend value invalid")
                observed += 1
        require(observed >= 2, "trend needs at least two observations")
        require(previous <= asof.year * 12 + asof.month, "trend cannot exceed report month")
        if trend.get("lagMonths") is not None:
            require(trend["lagMonths"] == asof.year * 12 + asof.month - previous, "trend lagMonths mismatch")
    else:
        require(trend.get("status") == "unavailable" and not trend.get("months"),
                "unavailable trend must not have chart values")
        require(len(attempts) == 3, "unavailable trend requires three documented attempts")
    require(data.get("sources"), "sources required")
    for source in data["sources"]:
        require(isinstance(source, dict), "each source must be a provenance object")
        require(all(source.get(key) for key in ("id", "channel", "observedAt", "pathOrUrl", "scope")),
                "source provenance fields required")
        require(re.fullmatch(r"[0-9a-f]{64}", source.get("sha256") or ""), "source sha256 invalid")


def price_text(price):
    if price.get("value") is not None:
        return f"{fmt(price['value'])} 元/月"
    if price.get("range") is not None:
        return f"{fmt(price['range'][0])}—{fmt(price['range'][1])} 元/月"
    return "待确认"


def render(data):
    report, subject = data["report"], data["subject"]
    trend = data["trend"]
    title = report["title"]
    asof = report["asOfDate"]
    headings = [
        "一、结论先行：价格与成立条件", "二、适用前提：产品形态与分案",
        "三、三种定价依据及收敛", "四、计算逻辑明细",
        "五、可比明细、样本边界与召回审计",
        f"六、近 12 个月{LEVEL_NAMES.get(trend.get('selectedLevel'), '市场')}租金趋势",
        "七、风险、证据缺口与补数动作", "八、挂牌、让价、合同和复核动作",
    ]
    h = [f'<section class="card cover"><div class="eyebrow">具体标的租金定价 · {e(asof)}</div>'
         f'<h1>{e(title)}</h1><p>{e(report["oneSentenceConclusion"])}</p>'
         f'<div class="meta"><div><b>小区</b>{e(subject["city"])}·{e(subject["community"])}</div>'
         f'<div><b>产品</b>{e(subject["areaSqm"])}㎡·{e(subject["layout"])}·{e(subject["rentalMode"])}</div>'
         f'<div><b>面积口径</b>{e(subject["areaBasis"])}</div><div><b>数据基准</b>{e(asof)}</div></div></section>']
    body = f'<p class="callout">{e(report["oneSentenceConclusion"])}</p>'
    for case in data["productCases"]:
        body += f'<h3>{e(case["label"])}｜{e(case["condition"])}</h3>'
        cards = []
        rows = []
        for key, name in zip(PRICE_KEYS, PRICE_NAMES):
            price = case[key]
            value = price_text(price)
            nature = price.get("nature") or ("业主输入" if key == "ownerConfirmedMinimum" else "待确认")
            cards.append(f'<div class="box"><strong>{e(name)}</strong><div class="amount">{e(value)}</div>'
                         f'<div class="mini">{e(nature)}｜{e(price.get("conditions"))}</div></div>')
            rows.append((name, value, nature, price.get("basisStepIds"), price.get("evidenceIds") or price.get("evidenceId")))
        body += '<div class="grid2">' + ''.join(cards) + '</div>'
        body += table(("决策量", "结果", "性质", "计算步骤", "证据"), rows)
        body += chart(f'图｜{case["label"]}决策量价格刻度', price_chart(case),
                      '只显示有数值与证据的项目；建议挂牌、推断目标和业主确认最低价不能互换。')
    body += '<p class="mini">测算让价边界只说明市场情景；业主未确认最低价时，底线保持待确认。</p>'
    h.append(section(1, "DECISION", headings[0], body))

    facts = [("城市", "city"), ("区县", "district"), ("商圈", "businessCircle"), ("小区", "community"),
             ("地址", "address"), ("面积", "areaSqm"), ("面积口径", "areaBasis"), ("户型", "layout"),
             ("出租方式", "rentalMode"), ("独立厨房", "independentKitchen"), ("独立卫浴", "independentBathroom"),
             ("独立入户", "independentEntrance"), ("独立计量", "independentMetering"),
             ("楼层", "floor"), ("朝向", "orientation"), ("装修", "decoration"), ("家具", "furniture"),
             ("出租权限", "rentPermission")]
    body = table(("项目", "已知事实/状态"), [(label, subject.get(key)) for label, key in facts])
    body += '<h3>已核实事实与待核项</h3>' + table(("类别", "内容"),
              [("已核", item) for item in subject.get("verifiedFacts") or []] +
              [("待核", item) for item in subject.get("unknowns") or []])
    h.append(section(2, "PRODUCT", headings[1], body))

    methods = data.get("methods") or {}
    body = '<p>同质可比为主估计；同源单位面积仅作算术校验；替代品检验价格边界。</p>'
    rows = []
    for key, label in (("homogeneousComparables", "同质可比"), ("unitArea", "单位面积"), ("substitutes", "替代品")):
        row = methods.get(key) or {}
        rows.append((label, row.get("status"), row.get("role"), row.get("range") or row.get("bounds") or row.get("unitRent"),
                     row.get("finding"), row.get("calculationStepIds"), row.get("limitations")))
    body += table(("依据", "状态", "作用", "区间/单价", "发现", "算式", "限制"), rows)
    body += chart("图｜三种依据区间对照", method_chart(methods),
                  "同源单位面积仅作算术校验；替代品区间仅用于边界检验。")
    convergence = data.get("convergence") or {}
    body += f'<div class="callout">收敛：{e(convergence.get("rule"))}；结果：{e(convergence.get("resultRange"))}；冲突处理：{e(convergence.get("conflictResolution"))}</div>'
    h.append(section(3, "EVIDENCE", headings[2], body))

    steps = data["calculationSteps"]
    body = table(("步骤", "输入", "公式、单位与舍入", "结果", "性质", "证据"),
                 [(x.get("id"), x.get("inputs"), x.get("formula"), x.get("result"), x.get("nature"), x.get("evidenceIds")) for x in steps])
    h.append(section(4, "REPRODUCTION", headings[3], body))

    audits, pools, comps = data.get("queryAudit") or [], data.get("comparablePools") or [], data.get("comparables") or []
    body = '<h3>查询与截断审计</h3>' + table(("查询", "通道/实际过滤", "TopK/总召回", "原始→去重→剔除→有效", "时间/回执"),
        [(x.get("id"), f'{fmt(x.get("channel"))}；{fmt(x.get("actualFilters"))}',
          f'{fmt(x.get("topK"))}/{fmt(x.get("totalRecall"))}',
          f'{fmt(x.get("rawCount"))}→{fmt(x.get("deduplicatedCount"))}→{fmt(x.get("excludedCount"))}→{fmt(x.get("validCount"))}',
          f'{fmt(x.get("queriedAt"))}；{fmt(x.get("receiptPath"))}') for x in audits])
    body += '<h3>独立样本池</h3>' + table(("池/地域", "产品/身份", "有效 n", "范围", "P25/中位/P75", "覆盖与限制"),
        [(x.get("id"), f'{fmt(x.get("productType"))}·{fmt(x.get("identity"))}', x.get("validN"),
          f'{fmt(x.get("min"))}—{fmt(x.get("max"))}',
          f'{fmt(x.get("p25"))}/{fmt(x.get("median"))}/{fmt(x.get("p75"))}',
          f'{fmt(x.get("coverageStatus"))}；{fmt(x.get("limitations"))}') for x in pools])
    included = [x for x in comps if x.get("included")]
    chart_rows = [{"label": x.get("community") or x["id"], "price": x["monthlyRent"], "identity": x["identity"]} for x in included]
    listing = next((c["listing"].get("value") for c in data["productCases"] if c["listing"].get("value") is not None), None)
    body += chart("图 1｜逐条可比月租分布", BASE.chart(chart_rows, listing), "只展示已核实有效行；挂牌与成交分色，不能把混合池当同源成交分布。")
    body += '<h3>逐条可比</h3>' + table(("ID/小区", "产品/面积", "月租", "身份", "日期/回执", "入选/排除"),
        [(f'{fmt(x.get("id"))}·{fmt(x.get("community"))}', f'{fmt(x.get("rentalMode"))}·{fmt(x.get("areaSqm"))}㎡',
          x.get("monthlyRent"), x.get("identity"), f'{fmt(x.get("sourceDate"))}；{fmt(x.get("receiptId"))}',
          f'{"入选" if x.get("included") else "排除"}：{fmt(x.get("reason"))}') for x in comps])
    h.append(section(5, "AUDIT TRAIL", headings[4], body))

    attempts = trend.get("fallbackAttempts") or []
    body = '<p>取数顺序：小区 → 商圈 → 城市。图题使用实际层级；商圈或城市序列只作背景。</p>'
    body += table(("层级", "对象/geo ID", "指标", "结果/原因", "回执"),
        [(LEVEL_NAMES.get(x.get("level"), x.get("level")), f'{fmt(x.get("name"))}·{fmt(x.get("geoId"))}',
          x.get("indicatorKey"), f'{fmt(x.get("status"))}；{fmt(x.get("reason"))}', x.get("receiptPath")) for x in attempts])
    if trend.get("selectedLevel"):
        label = LEVEL_NAMES[trend["selectedLevel"]]
        mapped = {"status": "available", "months": trend["months"]}
        svg = BASE.trend_chart(mapped).replace("社区租金趋势", f"{label}租金趋势")
        body += chart(f'图 2｜{trend["selectedName"]}{label}近 12 个月{trend["indicatorMeaning"]}', svg,
             f'{trend["observationStart"]}—{trend["observationEnd"]}；末月滞后 {trend["lagMonths"]} 个月；'
             f'指标 {trend["indicatorKey"]}；单位 {trend["unit"]}；{fmt(trend.get("comparabilityWarning"))}')
        body += table(("月份", "指标原值", "单位", "来源"),
            [(x.get("month"), x.get("value"), trend.get("unit"), x.get("sourceRow")) for x in trend["months"]])
    else:
        body += '<div class="notice">三级均无可核的 12 个月同口径序列；本报告不绘制趋势图。</div>'
    body += f'<p>时点判断：{e(trend.get("timeDecision"))}</p>'
    h.append(section(6, "TIME SERIES", headings[5], body))

    risks = data.get("risks") or []
    gaps = data.get("missingEvidenceActions") or []
    body = table(("类别", "事项", "影响/补数动作"),
         [("风险", x.get("risk") or x.get("description") if isinstance(x, dict) else x,
           x.get("impact") if isinstance(x, dict) else "待复核") for x in risks] +
         [("缺口", x.get("missing") or x.get("description") if isinstance(x, dict) else x,
           x.get("action") if isinstance(x, dict) else "待补") for x in gaps])
    body += '<div class="notice">挂牌、成交、推断和业主确认各有独立证据身份；趋势降级不得改名。</div>'
    h.append(section(7, "LIMITS", headings[6], body))

    body = '<h3>让价阶梯</h3>' + table(("触发", "价格", "动作", "停止条件"),
         [(x.get("trigger"), x.get("askingRent"), x.get("action"), x.get("stopCondition")) for x in data.get("repricingSchedule") or []])
    body += '<h3>空置经济性</h3>' + table(("较高月租", "较低月租", "比较月数", "持有成本", "临界空置天数", "算式"),
         [(x.get("higherRent"), x.get("lowerRent"), x.get("comparisonMonths"), x.get("holdingCost"),
           x.get("breakEvenVacancyDays"), (data.get("vacancyEconomics") or {}).get("formula"))
          for x in (data.get("vacancyEconomics") or {}).get("scenarios") or []])
    body += '<h3>挂牌时间窗</h3>' + table(("目标", "动作", "复核"),
         [(x.get("goal"), x.get("action"), x.get("reviewDate")) for x in data.get("listingWindows") or []])
    body += '<h3>合同条款</h3>' + table(("条款", "约定/待谈", "证据"),
         [(x.get("term"), x.get("detail"), x.get("evidenceId")) for x in data.get("leaseTerms") or []])
    body += '<h3>来源</h3><ol>' + ''.join(f'<li>{e(source_text(x))}</li>' for x in data["sources"]) + '</ol>'
    h.append(section(8, "ACTION", headings[7], body))

    template = TEMPLATE.read_text(encoding="utf-8")
    css = re.search(r"<style>(.*?)</style>", template, re.S)
    require(css is not None, "detailed template CSS missing")
    toc = '<nav class="toc">' + ''.join(f'<a href="#s{i}">{e(head)}</a>' for i, head in enumerate(headings, 1)) + '</nav>'
    page = ('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>{e(title)}</title><style>{css.group(1)}</style></head><body><main id="report-body">' + toc + ''.join(h) + '</main></body></html>')
    md = [f'# {title}', '', f'数据基准：{asof}', '', report['oneSentenceConclusion'], '']
    for i, (head, section_html) in enumerate(zip(headings, h[1:]), 1):
        md.extend([f'## {head}', '', re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', section_html)).strip(), ''])
    return '\n'.join(md), page


def main():
    ap = argparse.ArgumentParser()
    for name in ("data", "md", "html", "pdf", "ledger"):
        ap.add_argument(f"--{name}", required=True, type=Path)
    args = ap.parse_args()
    require(len({getattr(args, x).resolve() for x in ("data", "md", "html", "pdf", "ledger")}) == 5,
            "data and outputs must use different paths")
    raw = args.data.read_bytes()
    require(len(raw) <= 512000, "data file too large")
    data = json.loads(raw)
    validate(data)
    markdown, page = render(data)
    outputs = ((args.md, markdown.encode()), (args.html, page.encode()))
    for path, content in outputs:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
    from playwright.sync_api import sync_playwright
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, args=["--no-sandbox"])
        browser_page = browser.new_page()
        browser_page.goto(args.html.resolve().as_uri(), wait_until="load")
        browser_page.pdf(path=str(args.pdf), format="A4", print_background=True, display_header_footer=False)
        browser.close()
    digest = lambda value: hashlib.sha256(value).hexdigest()
    ledger = {"template": "rent-pricing-detailed-v3", "dataSha256": digest(raw),
              "mdSha256": digest(args.md.read_bytes()), "htmlSha256": digest(args.html.read_bytes()),
              "pdfSha256": digest(args.pdf.read_bytes()), "comparableCount": len(data.get("comparables") or []),
              "calculationStepCount": len(data.get("calculationSteps") or []),
              "trendLevel": data["trend"].get("selectedLevel"),
              "trendPointCount": sum(row.get("value") is not None for row in data["trend"].get("months") or []),
              "independentReview": "required"}
    args.ledger.parent.mkdir(parents=True, exist_ok=True)
    args.ledger.write_text(json.dumps(ledger, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
