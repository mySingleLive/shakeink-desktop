# 507 · 导入世界观提速与设定类型标识测试用例

依据：`506-world-import-performance-plan.md` 第 3R 节。合成数据，不含真实原文或 Key。文件 `tests/unit/novel-import-world-performance.test.ts`、`tests/browser/novel-import-wizard.test.ts`。

| ID | 内容 |
| --- | --- |
| WP-01 | world entity 实际在途达到 31 路；全部 done，artifact ID 集合等于已选候选。 |
| WP-02 | （506 §3R4 修订）设定任务不等待所属世界，与主世界同在首批发出；全部选中项导入完成。 |
| WP-03 | world entity 走轻量策略与导入通道；普通 world analyze、review 不变。四项设定批次走导入通道但保留原模型选项（不轻量）。 |
| WP-04 | 四项设定的多个批次并行发出（同时在途 >1），总在途 ≤31；全部批次完成后该任务 done；结果按批次顺序合并。 |
| WP-05 | 四项设定任一批失败：该任务 failed，其它批次结果不提交为部分成功；重试从头重跑该任务。 |
| WP-06 | world instruction 目录只含目标、worldId/parentId 链及本材料出现的已选项；`request.entities` 不变；请求无 evidenceOptions。 |
| WP-07 | world entity 首次 no-match 或“输出未完整结束”时有一次纠错，提示含“sourceUnitIds与evidence.unitId逐字复制”；第二次失败则任务失败。 |
| WP-08 | scopeHash 对 verified world entity 只计算一次。 |
| WP-09 | 暂停时 31 路排空后恢复，结果不丢不重。 |
| WP-10 | 既有 NIW-C26/C27/C10、CP-02、SP-01、item-performance 按 3R-5 更新后通过。 |
| WP-11 | 其它设定批次同时最多 8 路；主世界完成后世界条目拿到其余名额；总在途 ≤31。 |
| WP-12 | 全局错误后排队请求不再发出，步骤退出。 |
| WP-13 | 一批失败后任务失败，排队批次不再发出（批次多于名额）。 |
| WP-14 | 运行中跳过的设定任务结果为空时保持 skipped，不写 notFound。 |
| WU-01 | 第16步卡片：世界卡片显示 Globe 与“世界”，各设定卡片显示 `getTabIcon` 对应图标与类型标签；九种设定图标两两不同；四项其它设定为 Sparkles。 |
| WU-02 | 第15步识别树：类型标签前有对应图标。 |

全量 `npm test`（与基线对比）、typecheck、`build:desktop`。真实 E2E：第一卷，物品 ≤30 s 零失败；世界观导入 ≤60 s，全部 done、零 failed/skipped；记录主世界请求规模与耗时、每请求耗时分布与重试；截图核对类型图标。

507 审核（`507-world-import-performance-cases-review.md`）已处理：1–5 见 506 §3R2；6、7 已改方案文字；8–10 由 WP-03、WP-07、WP-11 覆盖；11 台账在验收后统一登记。
