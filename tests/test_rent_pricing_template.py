import copy
import importlib.util
import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "rent_pricing_renderer", ROOT / "scripts/render-rent-pricing.py"
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
EXAMPLE = json.loads((ROOT / "references/rent-pricing-data-v2.example.json").read_text())


class RentPricingTemplateTest(unittest.TestCase):
    def test_empty_evidence_stays_unpriced(self):
        data = copy.deepcopy(EXAMPLE)
        MODULE.validate(data)
        md, page = MODULE.render(data)
        self.assertEqual(page.count("<h1>"), 1)
        self.assertNotIn("<svg", page)
        self.assertIn("本轮未取得可绘制的同质样本", page)
        self.assertIn("待确认", md)
        for method in ("同质可比法", "单位面积租金法", "替代品锚定法"):
            self.assertIn(method, page)
        self.assertIn("可比明细表", page)
        self.assertIn("计算逻辑明细", page)
        self.assertIn("近 12 个月社区租金趋势", page)
        self.assertIn("不绘制趋势图", page)
        self.assertNotIn("〔", page)

    def test_comparables_produce_real_chart_and_escaped_labels(self):
        data = copy.deepcopy(EXAMPLE)
        data["tiers"]["listing"] = {
            "label": "建议挂牌", "value": 4200, "range": None, "nature": "建议",
            "basis": "同类挂牌样本的条件性建议", "source": "回执 E1",
        }
        data["comparables"] = [
            {"label": "A <script>", "price": 4100, "area": 88,
             "identity": "挂牌", "date": "2026-10-09", "source": "回执 E1"},
            {"label": "B", "price": 4300, "area": 90,
             "identity": "成交", "date": "2026-10-09", "source": "回执 E2"},
        ]
        data["calculationSteps"] = [{"step": "S1 主估计", "inputs": "4100、4300 元/月",
                                      "formula": "(4100+4300)/2", "result": "4200 元/月",
                                      "evidence": "回执 E1、E2"}]
        MODULE.validate(data)
        md, page = MODULE.render(data)
        self.assertIn('aria-label="可比样本月租价格分布"', page)
        self.assertIn("A &lt;script&gt;", page)
        self.assertNotIn("<script>", page)
        self.assertIn("4,200 元/月", md)
        self.assertIn("S1 主估计", page)

    def test_trend_draws_only_from_twelve_consecutive_months(self):
        data = copy.deepcopy(EXAMPLE)
        data["communityTrend"] = {
            "status": "available", "scope": "社区跨户型套均月租",
            "source": "测试用逐月回执", "months": [
                {"month": f"{y}-{m:02d}", "value": 3900 + i * 10}
                for i, (y, m) in enumerate([(2025, 11), (2025, 12)] + [(2026, m) for m in range(1, 11)])
            ],
        }
        MODULE.validate(data)
        md, page = MODULE.render(data)
        self.assertIn('aria-label="近 12 个月社区租金趋势"', page)
        self.assertIn("2026-10", md)
        self.assertIn("不代替目标房", page)
        data["communityTrend"]["months"][5]["month"] = "2026-05"
        with self.assertRaisesRegex(ValueError, "consecutive"):
            MODULE.validate(data)

    def test_lagged_real_trend_is_shown_with_period_and_lag(self):
        data = copy.deepcopy(EXAMPLE)
        data["communityTrend"] = {
            "status": "available", "scope": "社区跨户型套均月租",
            "source": "社区原始月序列", "months": [
                {"month": f"{y}-{m:02d}", "value": 3600 + i * 10}
                for i, (y, m) in enumerate([(2025, m) for m in range(8, 13)] +
                                           [(2026, m) for m in range(1, 8)])
            ],
        }
        MODULE.validate(data)
        md, page = MODULE.render(data)
        self.assertIn("2025-08—2026-07", page)
        self.assertIn("滞后 3 个月", page)
        self.assertIn("滞后 3 个月", md)
        data["asOfDate"] = "2026-06-09"
        with self.assertRaisesRegex(ValueError, "after asOfDate"):
            MODULE.validate(data)

    def test_priced_tier_needs_steps(self):
        data = copy.deepcopy(EXAMPLE)
        data["tiers"]["listing"].update({"value": 4200, "nature": "建议", "source": "回执 E1"})
        with self.assertRaisesRegex(ValueError, "calculationSteps"):
            MODULE.validate(data)

    def test_price_requires_evidence(self):
        data = copy.deepcopy(EXAMPLE)
        data["tiers"]["listing"]["value"] = 4200
        data["tiers"]["listing"]["nature"] = "建议"
        with self.assertRaisesRegex(ValueError, "source"):
            MODULE.validate(data)

    def test_three_methods_are_required(self):
        data = copy.deepcopy(EXAMPLE)
        del data["methods"]["substitute"]
        with self.assertRaisesRegex(ValueError, "methods must contain"):
            MODULE.validate(data)


if __name__ == "__main__":
    unittest.main()
