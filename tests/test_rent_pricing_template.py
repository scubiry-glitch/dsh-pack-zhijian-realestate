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
        MODULE.validate(data)
        md, page = MODULE.render(data)
        self.assertIn('aria-label="可比样本月租价格分布"', page)
        self.assertIn("A &lt;script&gt;", page)
        self.assertNotIn("<script>", page)
        self.assertIn("4,200 元/月", md)

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
