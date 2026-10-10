import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("rent_pricing_detailed", ROOT / "scripts/render-rent-pricing-detailed.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
FIXTURE = json.loads((ROOT / "tests/fixtures/rent-pricing-detailed-futureyue.json").read_text())


class DetailedRentPricingTest(unittest.TestCase):
    def test_craft_materials_fit_host_role_budget(self):
        craft = json.loads((ROOT / "craft/zhijian-rent-pricing.json").read_text())
        for role in ("writer", "renderer", "reviewer"):
            selected = [item for item in craft["materials"] if role in item["roles"]]
            total = sum((ROOT / item["path"]).stat().st_size for item in selected)
            self.assertLessEqual(total, 24 * 1024, f"{role} material budget")
        paths = {item["path"] for item in craft["materials"]}
        self.assertIn("references/rent-pricing-collection-runbook.md", paths)
        self.assertIn("scripts/render-rent-pricing-detailed.py", paths)

    def test_real_replay_renders_eight_chapters_and_distinct_minimum(self):
        data = copy.deepcopy(FIXTURE)
        MODULE.validate(data)
        markdown, html = MODULE.render(data)
        self.assertEqual(html.count("<h2>"), 8)
        self.assertIn("测算硬底只说明市场情景", html)
        self.assertIn("底价（测算硬底）", html)
        self.assertIn("共用月租横轴", html)
        self.assertIn("滚动 12 个月均值同比", html)
        self.assertIn("业主确认最低价", html)
        self.assertIn("待确认", html)
        self.assertIn("未来悦小区近 12 个月", html)
        self.assertIn("2026-07", html)
        self.assertEqual(html.count("<svg"), 4)
        self.assertIn("未来悦", markdown)

    def test_business_circle_fallback_has_actual_scope_in_heading(self):
        data = copy.deepcopy(FIXTURE)
        data["trend"]["selectedLevel"] = "business_circle"
        data["trend"]["selectedName"] = "未来科技城"
        data["trend"]["fallbackAttempts"] = [
            {"level": "community", "status": "indicator_unavailable", "reason": "无同口径月序列", "receiptPath": "community.json"},
            {"level": "business_circle", "status": "selected", "reason": "连续12期", "receiptPath": "circle.json"},
        ]
        MODULE.validate(data)
        _, html = MODULE.render(data)
        self.assertIn("近 12 个月商圈租金趋势", html)
        self.assertNotIn("近 12 个月小区租金趋势", html)
        data["trend"]["fallbackAttempts"].reverse()
        with self.assertRaisesRegex(ValueError, "fallback attempts"):
            MODULE.validate(data)

    def test_no_trend_draws_no_trend_chart(self):
        data = copy.deepcopy(FIXTURE)
        data["trend"].update(status="unavailable", selectedLevel=None, months=[],
                             historyMonths=[],
                             fallbackAttempts=[{"level": level, "status": "unavailable"}
                                               for level in MODULE.LEVELS])
        MODULE.validate(data)
        _, html = MODULE.render(data)
        self.assertEqual(html.count("<svg"), 3)
        self.assertIn("本报告不绘制趋势图", html)

    def test_owner_minimum_cannot_be_invented(self):
        data = copy.deepcopy(FIXTURE)
        data["productCases"][0]["ownerConfirmedMinimum"]["value"] = 2000
        with self.assertRaisesRegex(ValueError, "owner minimum requires"):
            MODULE.validate(data)

    def test_visible_sample_cannot_claim_full_quantiles(self):
        data = copy.deepcopy(FIXTURE)
        data["comparablePools"][1]["median"] = 2350
        with self.assertRaisesRegex(ValueError, "cannot claim"):
            MODULE.validate(data)

    def test_fifth_chapter_cannot_silently_have_no_comparables(self):
        data = copy.deepcopy(FIXTURE)
        data["comparables"] = []
        data["comparablePools"] = []
        with self.assertRaisesRegex(ValueError, "comparableEvidenceGap"):
            MODULE.validate(data)
        data["comparableEvidenceGap"] = "本轮检索无可核逐条房源；需补查询回执。"
        MODULE.validate(data)
        _, html = MODULE.render(data)
        self.assertIn("可比证据缺口", html)

    def test_haixing_original_four_trend_rates_recalculate_from_31_periods(self):
        fixture = json.loads((ROOT / "tests/fixtures/haixing-rentidx-history.json").read_text())
        months = fixture["months"]
        self.assertEqual(len(months), 31)
        metrics = MODULE.trend_metrics({"months": months[-12:], "historyMonths": months})
        self.assertEqual([round(item["value"], 1) for item in metrics], [35.9, 17.4, -10.6, 2.2])
        self.assertIn("2025-08", metrics[0]["title"])
        self.assertIn("2025-07", metrics[1]["title"])

    def test_haixing_visual_replay_includes_all_three_requested_elements(self):
        data = json.loads((ROOT / "tests/fixtures/rent-pricing-detailed-haixing-visual.json").read_text())
        MODULE.validate(data)
        _, html = MODULE.render(data)
        self.assertIn("底价（测算硬底）", html)
        self.assertIn("2,300 元/月", html)
        self.assertIn("三档定价共用横轴", html)
        for rate in ("+35.9%", "+17.4%", "−10.6%", "+2.2%"):
            self.assertIn(rate, html)
        self.assertEqual(len(data["comparables"]), 20)
        self.assertEqual([pool["validN"] for pool in data["comparablePools"]], [10, 10])
        self.assertEqual(data["queryAudit"][-1]["validCount"], 19)
        fifth = html.split('<section class="card anchor" id="s5">', 1)[1].split(
            '<section class="card anchor" id="s6">', 1)[0]
        self.assertEqual(fifth.count("<td>ORIG-A-"), 10)
        self.assertEqual(fifth.count("<td>ORIG-B-"), 10)
        self.assertIn("仅摘要，未并入逐条样本池", fifth)
        self.assertNotIn('暂无已核数据', fifth)
        self.assertIn('朝向/楼层', fifth)
        self.assertIn('79.1 元/㎡·月', fifth)

    def test_missing_prior_period_is_explicit_instead_of_invented(self):
        data = copy.deepcopy(FIXTURE)
        data["trend"]["historyMonths"] = data["trend"]["months"]
        MODULE.validate(data)
        metrics = MODULE.trend_metrics(data["trend"])
        self.assertIsNone(metrics[1]["value"])
        self.assertIn("2025-07", metrics[1]["detail"])
        self.assertIsNone(metrics[3]["value"])
        self.assertIn("2024-08", metrics[3]["detail"])

    def test_original_price_ladder_uses_one_axis_and_listing_denominator(self):
        data = copy.deepcopy(FIXTURE)
        case = data["productCases"][0]
        for key, value, bounds in (("listing", 2600, [2550, 2700]),
                                   ("expected", 2500, [2450, 2550]),
                                   ("modeledConcessionBoundary", 2300, None)):
            case[key].update(value=value, range=bounds)
        case["modeledConcessionBoundary"].update(basisStepIds=[data["calculationSteps"][0]["id"]], evidenceIds=[data["sources"][0]["id"]])
        MODULE.validate(data)
        axis = MODULE.price_chart(case)
        self.assertEqual(axis.count("<svg"), 1)
        self.assertIn("2,300", axis)
        self.assertIn("2,700", axis)
        gap = MODULE.decision_gap_note(case)
        self.assertIn("3.8%", gap)
        self.assertIn("7.7%", gap)
        self.assertIn("11.5%", gap)


if __name__ == "__main__":
    unittest.main()
