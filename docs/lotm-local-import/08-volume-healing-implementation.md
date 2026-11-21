# 自愈 H03 实施记录

日期：2026-10-28。范围：仅卷章草稿与人工卷归属，不涉及模型或数据库结果。

## RED

- 首轮定向命令 exit1：25项中22通过、3失败。V04 缺卷名输入，V02/V03 拒绝人工补卷名；V01 合成夹具最初未识别正文，修正文件名后再次实际 RED，精确在首次 `choose → save → encodeImportJournal → importVolumeGroups` 抛出与真实本书一致的连续性错误。
- 原始日志私有 `volume-tests-red.log`、`volume-v01-red.log`。未修改原文或降低最终9卷1402章预期。

## 最小实现

- `desktop/core/novel-import-chapters.ts`：`importVolumeGroups` 新增默认关闭的 allowRepeatedUnassigned；人工卷名只在来源未命名段继承，来源命名卷清除继承，人工/来源及不同人工组重名拒绝。
- `desktop/main/novel-import.ts`：仅草稿 encode 开启重复未归属容忍；`start` 在授权、analysisGrant、正文副本和任何 AI 前执行默认严格分组。
- `src/components/desktop/NovelImportDialog.tsx`：正式 ChaptersScreen 新增每章可选卷名，清空时删除 volume 属性而非提交空串。
- `desktop/service/novel-import-publish.ts` 未改，发布仍默认严格。

## 测试工具自愈与 GREEN

- 第一次 GREEN 尝试23/25：V01 对 resume 的状态机假设不完整，V03 把相邻同名误当成不同人工组。分别改为先验证 resume 安全返回来源再进入分析门槛，以及构造真正不同的后续人工组重名；生产代码未为这类测试假设改动。
- 第二次单元测试只剩 resume 诊断；修正后单元全通过。最终 `volume-tests-green-final.log`：**25/25 pass，0 fail**。
- `npm run typecheck` exit0，日志 `typecheck-volume.log`。
- 源码 SHA：core chapters `358ee117…f1fd`，main controller `442e9e0c…0892`，UI `b7f4218a…058f`。

独立代码审核见09；真实整书 V05 尚需更新构建后执行。
