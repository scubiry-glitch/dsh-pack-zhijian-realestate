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
    def test_real_replay_renders_eight_chapters_and_distinct_minimum(self):
        data = copy.deepcopy(FIXTURE)
        MODULE.validate(data)
        markdown, html = MODULE.render(data)
        self.assertEqual(html.count("<h2>"), 8)
        self.assertIn("测算让价边界", html)
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


if __name__ == "__main__":
    unittest.main()
