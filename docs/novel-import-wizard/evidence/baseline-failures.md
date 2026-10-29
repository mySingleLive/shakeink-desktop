# 改动前已存在的失败（基线）

日期：2026-10-29。Node v24.18.0。方法：把本次对既有文件的修改（`novel-import-files.ts`、`novel-import-semantics.ts`、`main/novel-import.ts`、`core/novel-import.ts`）在工作区临时还原，运行同一组测试，然后恢复修改。这些文件未纳入 git，无法用 git 基线。

| 文件 | 改动前 | 改动后 |
| --- | --- | --- |
| tests/unit/lotm-import-audit.test.ts | 0 通过 / 11 失败 | 同 |
| tests/unit/lotm-local-import-audit.test.ts | 24 / 1（volume-first chapter title prefix…） | 同 |
| tests/unit/novel-import-evidence-batches.test.ts | 33 / 1（LOTM-L-ID04） | 同 |

失败原因示例：`lotm-import-audit` 在 `assertPlan → validateDetailedOutlines` 报"仍有章节缺少细纲"，与本次修改无关。这些失败不由本任务修复，也不计入本任务的通过/失败。

## 负载相关的不稳定用例

- `tests/unit/novel-import-classification.test.ts` LOTM-L-C04：全量并行运行时偶发"controlled classification window reached"断言失败（等待窗口计时）；单独运行 3/3 通过（2026-10-29）。不属于本任务改动范围。
- `tests/unit/novel-import-source-picker.test.ts` CP-F01/CP-L02：全量并行运行时偶发计时失败（IO 超时预算）；单独运行 2/2 全部通过（17/17）。本任务未修改选择器代码。
