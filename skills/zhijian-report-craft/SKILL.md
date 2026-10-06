---
name: zhijian-report-craft
description: 智见研究报告的写作、来源、章节结构、计算证据与独立内容审核。适用于研究报告，内容工艺可单独采用；交付 HTML/PDF 时可与同包渲染 skill 组合。
---

# 智见报告内容工艺

本技能属于领域包 `zhijian-realestate`。AI 根据当前任务决定是否选择本技能，并记录理由；Host 不按关键词自动选择。工艺以本包声明和固定版本为准，不能从全局同名副本替换。

必需材料由本包 [craft 声明](../../craft/zhijian-report-craft.json) 给出。写作者、渲染者和审核者按其角色接收所需正文。共享规范和原始参考统一在本包 [references](../../references/)；链接始终相对所在文件解析。历史业务数字只作例文，不能作为本次任务事实。

内容工艺检查来源披露、收束结构、章节五件套以及声明的计算范围，并要求独立内容审核。完整 HTML/PDF 交付通常还需要选择同包 [zhijian-designer-render](../zhijian-designer-render/SKILL.md)，由 AI 决定合适的样式。没有选中的工艺不得宣称已经验收。

通过 `reportBundle.craft.version=3` 提交显式 `selections`，每项为 `{packId,skillId,variant?,reason}`；不要填写材料路径或自行生成 Host 摘要。Host 将实际可用包的版本、材料与检查绑定任务。修订沿用契约及剩余预算。

提交前使用本包 [预检入口](../../scripts/preflight-report.mjs) 检查实际文件。机器证据、完整材料交付和独立实质审核互不替代。失败或无法检查均不能宣称合格。

纯正文沿用 schemaVersion 2；嵌入逐章已审点睛图时使用 schemaVersion 3，按 [台账约定](../../references/evidence-ledger-v3.md) 登记独立图层、关键计算与政策主张。图层须对应 Host 已审 figure-fragments.html 原字节，不能用图卡补写正文。计算局部通过不等于全文无误；现行政策要求核读官方原文，缺失时明确条件与限制。
