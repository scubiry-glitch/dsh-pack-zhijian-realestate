---
name: zhijian-designer-render
description: 将固定的智见报告正文渲染为响应式 HTML 和带大纲的 PDF，验证可见内容一致、版式与可访问性。AI 可选政策报告或纸本报告样式。
---

# 智见报告渲染工艺

本技能属于领域包 `zhijian-realestate`。选择时显式组合内容技能 `zhijian-report-craft`；依赖不会由插件悄悄补选。AI 在 `credit-policy` 和 `designer-paper` 中选择一个 variant，并说明适合当前任务的理由。

`credit-policy` 适合规则、判断条件、政策解读和清晰的对照关系；`designer-paper` 适合合作研究、长文论证和纸本阅读。两者都要求移动端可读，不沿用原例固定画布宽度。

本技能的 [工艺声明](../../craft/zhijian-designer-render.json)、[渲染规则](../../references/render-v2.md)、[基础组件](../../references/components/components-v2.html)、[基础 CSS](../../references/components/base-v2.css) 与两份完整参考均在本包。按选定样式组合组件，正文以固定 MD 为单一来源，不添改业务判断。逐章嵌入已审点睛图时使用 [schemaVersion 3 图层台账](../../references/evidence-ledger-v3.md)：图卡必须原样放在对应章节，正文与图卡分层核对，完整 HTML/PDF 仍须全文一致。

参考源：[政策报告](../../references/zhijian-credit-policy-v1.html)、[合作报告](../../references/zhijian-designer-v1.html)、[来源归档](../../references/source-provenance-v2.json)。大文件按需查阅；必需短规范由 Host 按所选契约完整交付，不将参考全文存在等同于已读。

最终 PDF、HTML 和 Markdown 的实际字节必须通过本技能声明的检查与独立版式审核。运行包内 [预检](../../scripts/preflight-report.mjs) 后按反馈修订；本地预检不签发 Host 交付收据。
