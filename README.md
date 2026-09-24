# zhijian-realestate（智见点评·房地产领域包）v1.1.0

33 位房地产领域专家基线（BK-002 ~ BK-034，五大领域），由
`scripts/build-zhijian-pack.mjs` 确定性生成。

- `pack.json` + 各实体目录：`loadPackFromDir` 可装载的 DomainPackV2 布局
  （metadata-only pack.json + 每实体一个 JSON，文件名 == 实体 id）。
- `source/raw-profiles/`：原始 Profile JSON，逐字节保留（sha-256 见
  `source/SOURCE-MANIFEST.json`）。
- `source/SOURCE-MANIFEST.json`：记录两个基线（1.0.0 原始 2026-08-19 zip
  32 位；1.1.0 工作区副本 2026-08-20/21，新增陈杰 BK-034）与升级历史。
- `generated/`：派生视图（V1 金样、总表、校验报告、树摘要），可随时重建。
- 重建：`pnpm build && node scripts/build-zhijian-pack.mjs --src <源目录>`；
  漂移检查：`node scripts/build-zhijian-pack.mjs --check`。
