# 卷结构修复独立代码审核

日期：2026-10-27（Asia/Shanghai）。审核者：独立子代理 `lotm_test_review`。范围为06/07批准的卷结构治愈、六个冻结生产文件、新卷章单测及追加发布集成用例。未修改生产代码，未操作真实 UI 或模型，未读取用户其它作品。

## 结论

**最终冻结版本的代码及定向组件审核通过，未发现剩余阻断项。** 这仅证明明确卷标题的保真链路与旧会话兼容，不代表本书真实整书导入、源文质量、八类语义或原生UI验收通过。实施说明08在本报告初稿时尚未落盘，其说明性内容另行核对；本报告代码结论以以下实际源文件指纹及独立命令为准。

## 冻结与独立执行

核对 `evidence/volume-production-frozen-sha256.txt`，独立测试前后六文件SHA一致：

| 文件 | SHA-256 |
|---|---|
| desktop/core/novel-import-chapters.ts | `346a2de939e2e91230f46b03858ce0def546ba9deee4ecb226fc13f38770aad8` |
| desktop/core/novel-import.ts | `21b6461fa4c03fd80e97c80e3e631f1931240310ec481488a100309870e15546` |
| desktop/shared/novel-import.ts | `a2a09a88950bdc7ed953517895f073e0bab79a1213c97e83df2989015df04675` |
| desktop/main/novel-import.ts | `026dbb5f9aea6c59eb9defba03c5f68a215f82cba8aec01c7453fdfdc68787f1` |
| desktop/service/novel-import-publish.ts | `15a7a4e63adeba5b6ca2b204586501761700174c537f66585765ce17e45b5326` |
| src/components/desktop/NovelImportDialog.tsx | `56fa54c7245fe47a68ae4a990d25951d42f2db7503945b969b2cbf513021f69d` |

实际独立运行：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^LOTM-V' tests/unit/novel-import-volumes.test.ts tests/integration/novel-import-publish.test.ts
```

退出码0；tests10、pass10、fail0、skipped0，duration8195.354833ms。日志为 `evidence/volume-independent-code-review-green.txt`。临时PGlite与controller目录由测试随机创建，没有复用作者或真实作品数据库。本代理没有运行全仓测试。

## 源码核对结果

- **版本与旧身份。** 新choose显式创建 `chapterVersion:2`；旧记录不补版本，默认检测器分支保留旧几何。未知版本在恢复、编码、分章及授权/计划边界拒绝。无新字段时scope/plan不附加默认字段；测试覆盖带卷标题及无卷标题的既有黄金值。手动确认会改变chapterDetection并按既有invalidate规则清空正文工作字段，不能把这种不同形状与自动会话的hash混比；纠正后的manual黄金值与明确的相应形状匹配，原始失败日志保留。
- **正文与卷边界。** 明确卷标题独立匹配，卷标题位置保留在本卷首章正文，实际前言保留独立章；切片使用原UTF-16位置，所有章拼接与输入一致。缺标题的第一章重启撤销归属并诊断，不造卷名、不顺延前卷。重复非first章编号仍保留两个章节；相邻first章的歧义采取未知归属，符合保守规则。
- **手动与恢复。** renderer初始cuts、view、协议及controller都携带可选volume；现有输入编辑展开对象不丢字段。core手动处理从源标题重新派生，卷首边界删除/移动、不匹配卷名均拒绝。controller使用候选克隆，非法手动提交不会先破坏在用会话；保存后重开保留版本、手动边界和归属。v2缺标题诊断在手动确认和恢复后仍可见。
- **授权与计划。** 新版本标记绑定身份，analyze scope额外包含实际volume；plan已包含完整chapters。改归属改变两种指纹；set-chapters仍撤销旧分析授权与检查点，不能持旧授权采用不同卷结构。
- **连续分组与发布。** `importVolumeGroups` 按原章节序列形成连续组，不按名字跨全书聚合；卷名/默认组回跳及不合法卷名拒绝。发布前还按原正文重新派生归属，校验发生在创建作品前；测试证明错误分组没有阶段回调、回执、目录部分写入或新catalog条目。journal编码也验证版本及连续组。
- **原生索引。** 生产发布按组创建Volume及planning卷，每卷Chapter.index从1开始；data.chapters插入和order沿全书顺序，因此narrative.chapterIndex仍引用同一全书数组。独立PGlite检查按Volume.index/Chapter.index重建正文相等、卷章映射一致，第二卷首章及第八卷末章叙事均指向正确chapter.id且refs指向真实事件，重试不重复创建。
- **旧默认行为。** 无新版本会话仍单卷“导入内容”；只有大纲没有正文时仍保存默认卷与完整大纲。未改数据库schema、原文件、模型响应或其它业务实体。

## 审核发现及闭环

首次冻结版本的既有LOTM-V定向检查独立9/9通过，但代码审核额外发现两类遗漏，已先通知主代理、由作者修复，本代理没有自行改生产：

1. 缺标题诊断仅auto模式可见；手动确认同一章界后diagnostic仍在journal中，但view返回null。本代理以合成输入直接复现。最终core对v2保留诊断显示，新增V03确认/恢复断言，独立GREEN通过。
2. first章重启原有空格限制及“前一章也是first”的豁免会保留无据归属。最终restart匹配与中文章/节/回形式对齐，并移除相邻first豁免；V02覆盖无空格和相邻重启，V01用不产生first歧义的重复非first编号验证不丢正文，独立GREEN通过。

真实来源仍需按11/12准备和冻结；正式整书必须使用与上述最终指纹对应的构建继续UI流程。组件通过不得抵扣最终正文双重比较、八卷实表、八类语义、持久化与重开检查。

## 追加核对08实施说明

本报告初稿后已读取 `08-volume-implementation.md`，并核对其所指最终定向日志、目标入口TypeScript结果和冻结清单。说明区分了真实RED、夹具/黄金值预期修正、产品修复、组件GREEN和未执行的真实整书验收，未把组件通过冒充全书通过；与本代理静态审核及独立LOTM-V结果一致。08的作者定向回归14项和本代理独立LOTM-V10项是不同命令范围，不能混成同一次执行或累加为不同业务项数量。代码审核结论保持通过。
