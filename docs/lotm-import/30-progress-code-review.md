# 小包进度与历史正文步骤文案：独立代码审核

日期：2026-10-28。审核者：独立子代理 `lotm_progress_code_review`。

结论：**本次两处生产改动通过代码审核，未发现需要修复的新增问题。** 独立定向执行 E03、E05 均通过。本结论不代表 B4 构建、真实旧草稿 UI 或全书导入已验收。

## 范围与差异确认

已读 28 技术方案/用例、29 方案独审；审核 `semanticAnalyzeUnits`、直接关联的 checkpoint/save/current/ai/step/kindStep/stopAction，以及 `ProgressScreen` 和 E02–E05、NI-U05 的相关源码。CodeGraph 当前不可用，按主代理明确给出的文件范围读取，未初始化索引。

两份生产文件在当前工作区均为未跟踪文件，不能用空的 `git diff` 证明没有变动。本审核独立使用 `diff -u` 对比主代理提供的 B3 留存源码目录 `/private/tmp/shakeink-lotm-import-20261027/LOTM-20261027-B1/B3-before-progress-source` 中相同路径的两文件。差异恰为：

- `desktop/main/novel-import.ts:621`：原成功叶 checkpoint 回调末尾加入对应 step 的 completed/total 同步。
- `src/components/desktop/NovelImportDialog.tsx:114`：原 `step.label` 改为按 body key 显示“导入正文”，其它 key 仍显示原 label。

没有生产代码的其它差异；未重置、改写其余既有工作。

## 关键判断

1. **与覆盖原子持久化。** 621 行在 artifacts、合并冲突与去重 coverage 更新之后，同一回调内更新计数；只调用原来的一次 checkpoint。350 行 checkpoint 在串行队列中校验 session/epoch 后执行回调，再调用 save；97 行起的 save 将完整编码快照写入临时文件、sync、rename，之后才通知 UI。因此该次持久化快照及通知中的覆盖与计数一致。这里沿用原有保存协议，不扩大为对任意磁盘故障的通用内存事务保证。
2. **总量正确，信用不虚增。** completed 取本 kind 已提交去重 coverage 的长度；total 取完整 `workingImportUnits(s).length`，没有使用剩余 pending、递归子包或返回 artifact 数。semanticWorkflow 在 636 行已取得完整工作单元，`prepareImportWorkingUnits` 对既有 workingUnits 直接返回，因此这里不会额外切分或改变工作几何。共享 scene/item、settings 步骤仍按当前 kind 计数，不将多个 kind 的覆盖相加。
3. **失败、暂停、授权变化仍受原边界约束。** 结果类型、来源、证据、语义 artifact、原生映射和锁校验均在提交前。失败父包进入原有二分路径，没有计数写入；普通错误、单单元失败及授权变化没有绕过校验的新路径。ai 返回后及 checkpoint 队列中仍校验 epoch，stopAction 在取消/暂停前递增 epoch，迟到结果不能取得这次成功提交。新增代码只修改 completed/total，不改 state；`step.state !== 'skipped'` 保护保留。
4. **冲突不会给未处理兄弟包记账。** 产生合法合并冲突的叶包仍按原协议提交 artifacts/conflicts/coverage，并在同一提交中反映已接受叶的实际计数；622 行随后停止进入冲突阶段，未处理兄弟包没有新增 coverage 或计数。此改动不改变冲突是否接受、暂停状态或复核时机。
5. **历史文案只做显示投影。** JSX 三元表达式读取 key/label，无赋值、持久化、迁移或额外 IPC；只对 body key 显示新名称，其它步骤仍用原 label。NI-U05 注入旧 label 后等待真实 React 新文案，并确认 fixture 原 view 的 label 仍旧，保留原暂停、恢复、收起、取消和完成关闭流程。

## 独立执行证据

命令：

```sh
node --import tsx --test --test-name-pattern='LOTM-E0[35]:' tests/unit/novel-import-evidence-batches.test.ts
```

结果：exit 0，pass 2、fail 0、skip 4，耗时约 1.52 秒。原始脱敏 TAP 见 `evidence/progress-healing-review-unit-green.txt`。测试只使用 mkdtemp 隔离的合成来源、合成模型/RPC 与合成发布回调，不访问真实 app、模型、DB 或 journal。

- E03 在右叶开始时读取实际已保存快照，核对左叶 coverage、completed 与完整 total；右叶失败和正常关闭/重开后仍保留计数，恢复不重放已覆盖左叶。
- E05 在右叶 held 时读取已保存左叶计数/全量 total；暂停排空迟到右叶后 coverage、completed 与 artifacts 数保留，未发布。

作者另报 E02/E03/E04/E05 12/12 与 NI-U04/NI-U05 2/2 通过，本审核没有将作者执行冒充独立复跑。未重新运行全仓测试或整项目类型检查；B4 的实际构建/类型验证由主代理继续执行。

本次审核时源码 SHA-256：

| 文件 | SHA-256 |
|---|---|
| desktop/main/novel-import.ts | `0676b4c84b21e6ce724d8a4e08503de5999b6a88450674030dc442b8043c49e8` |
| src/components/desktop/NovelImportDialog.tsx | `abd28f79dce781870614dd1515ef988300135b807990664df2f109ff5228a654` |
| tests/unit/novel-import-evidence-batches.test.ts | `6adf85be11c9527a177e16f3a7191f0508382337f7adc8982934912224c8a0c4` |
| tests/browser/novel-import.test.ts | `8b23c16e535f23f83d46ab7c02aadc9ebc944c805a1f375d2196049c70ba6aa9` |

## 验收边界

未操作真实 app/UI/模型/DB/journal，未读取小说或语义产物。旧 B3 不能绑定当前新增逻辑作为最终验证；仍须按 28 正常暂停/退出、构建 B4、恢复原 session，并观察真实旧 label 的新显示及成功叶后的计数增长。此次代码审核不消除 25/DREAM-* 语义问题，不抵扣其它目标、全局复核、原生持久化或全书文学验收。
