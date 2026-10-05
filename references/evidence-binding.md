# 证据定位绑定

本工具仅替换精确定位，不选择章节语义、不计算业务答案、不签发验收。先生成新版本报告，再读取该版本 anchors-index.json，选择实际内容块；工具从 anchors.json 复制对应的完整 `{markdown,htmlId}` 和三格式摘要。

bindings.json 顶层必须恰好包含 chapters、calculations、policyClaims。chapters 每项为 `{htmlId,parts}`，htmlId 选择清单中实际分析章，标题由工具复制。parts 沿用五件套协议，其中 opportunityRisk 分为两个独立部分；所有原本填写 Span 的位置改填 `{"$anchor":"实际ID"}`。计算类型、数值、单位及政策原文声明仍由作者按工艺填写，不从角色名或关键词自动推断。

结构示意，ID 必须来自本次清单：

```json
{
  "chapters": [{
    "htmlId": "section-001",
    "parts": {
      "quote": {"$anchor": "anchor-0003"},
      "roles": {"$anchor": "section-002"},
      "basis": {"$anchor": "section-003"},
      "inference": {"$anchor": "section-004"},
      "opportunityRisk": {
        "opportunity": {"$anchor": "section-005"},
        "risk": {"$anchor": "section-006"}
      }
    }
  }],
  "calculations": [],
  "policyClaims": []
}
```

示例空数组只说明格式，不能用于省略报告中已存在的计算或政策。quote 必须选真实引用块，不能选包含“一句话定位”标题的整章；章节parts必须不重叠，不能把同一节同时用作机会和风险。工具不会替作者修正这类语义选择，预检会拒绝。

退出0表示定位绑定草稿，退出2表示输入错误。未知ID、手抄Span、陈旧清单和覆盖旧输出均拒绝。正文变更必须重新构建，并依据新索引重新选择；输出后运行正式预检，再提交独立审核。
