---
name: zhijian-research-craft-v5
description: 观点驱动研究 V5 的表达与成品检查；不施加旧版章数或论证配额。
---
# 智见研究表达 V5

## 分工

作者围绕证据组织观点与结构；designer-craft 提出神韵、论证顺序、图文节奏，渲染时忠实执行已审正文；独立内容评审核验实际来源与推理；设计批评人独立检查最终成品。不能用作者自评代替独立评审。

## 两份设计参考

阅读 references/style-credit-policy-v2.md 与 references/style-designer-paper-v2.md。主样式由冻结 selection.variant 决定；craft-evidence.json 记录主样式及两份参考各自采用/未采用的组件与理由。两份参考均需真正读过，不强行混用冲突配色。执行相应配色、层级与组件，在可读性前提下表现论证性格。旧样例业务内容不能成为证据。

## 成品执行

完整正文放 HTML 唯一的 `<main id="report-body">`，与 report.md 的实际阅读文本一致。CSS 内联；静态离线，无脚本与远程资源。图表需要事实标签，不能新增正文未审数字。桌面 1280 和手机 375 宽度均正常换行、不裁切正文。打印使用 A4，不强制封面、封底、章节数或每章图数。页眉页脚只承担已有标题和页码；避免依靠装饰重复大量正文。

craft-evidence.json：schemaVersion=5，mdSha256/htmlSha256/pdfSha256 原字节 SHA256，style 为主样式，references={"credit-policy":"实际取舍理由","designer-paper":"实际取舍理由"}。可选点睛图使用 `<figure data-v5-figure="唯一id">`，台账加 figures=[{id,sourceQuote}]，sourceQuote 必须是已审正文原句；图表不得引入正文之外的数值。正文文字层保持单源，图层可用视觉重述已审事实，由独立评审检查语义。无需旧版逐章六段锚点。真实工具结果和独立审核记录保留；机器检查只是有界核验，不认证观点、审美或数据真实性。

发布前用本 skill 的 scripts/check.mjs，通过 stdin 传入 Host 协议相同的 protocolVersion=1、selections、resultIds、artifacts（md/html/pdf/evidence；id/sha256/content/encoding，PDF base64）及受控浏览器路径。结果 unverified 表示工具通道未完成，不能伪称通过。

## 独立审核

内容 reviewer 阅读当前正文、所有关键来源与台账，记录 content-audit JSON 代码块，字段 argument/sources/calculations/uncertainty/coverage 为实际复核说明，包括遗漏检测与抽验。机器自动绑定当前哈希，毋须手写全文每章证明。

成品 reviewer 必须检查实际页面：宽/窄屏、DOM、可读性，以及 A4 首中末页，记录 visual-audit（verdict="PASS"、checkedAt、method、htmlSha256、pdfSha256、dom、wide、narrow、accessibility、pageCount、pages.first/middle/last 的 index/sha256），按 Host 既有 PDF 实渲染回执填写。静态报告无交互就不造交互结果。无视觉能力时如实报未验证，由具备能力者完成，不自签通过。
