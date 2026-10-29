# 导入作品分步向导：代码审核问题修复记录

日期：2026-10-29。依据：[09-code-review.md](09-code-review.md)（F1–F24）以及修复后独立子代理复审发现的 N1–N6。环境：Node v24.18.0。

## 结论

- F1–F23 已修复，每条都有对应测试。F24 未修复。
- 复审新发现的 N1–N6 已全部修复。
- 本记录只说明代码路径层面的结果（C/S/B 层，使用假模型、假图像、假发布）。R 层真实目标用例（R01–R11）没有执行，台账中不得标为通过。

## 逐条状态

| # | 处理 | 测试 |
| --- | --- | --- |
| F1 | 只导入资料（不含正文）的会话跳过第 5–8 步；清单按资料标题生成；无模型时只拷贝资料；不含章节也能发布 | NIW-C06、NIW-C83 |
| F2 | 向导专用的 apply-patches 改为按偏移平移章节与 `materializedVolumes`，不重新检测章节；补丁跨章界时拒绝；保留授权范围与清单，从第 9 步重新导入；重启校验改用 `assertWizardSessionChapters` | NIW-C19/F2、NIW-U45 |
| F3 | 在本轮之前已修复（tsc 通过） | — |
| F4/F5 | 来源核验每步共享一次；核验失败或其他全局错误时，中止全部在途文本与图片请求，并等全部 worker 结束后再抛出 | NIW-C46、NIW-C47 |
| F6 | 运行中允许对单项重试或跳过，epoch 不变；调度器读取实时任务列表 | NIW-C31/F6 |
| F7 | 跳过标记每次按第 4 步的选择重新计算；作者后来做出的跳过（清单为空或主动跳过）会被清除 | NIW-C65b、NIW-C67b |
| F8 | 第 16 步在没有任何世界观时也运行其他设定（主题、文风、金手指、爽点）的任务 | NIW-U05 |
| F9 | 第 17–20 步在不推断时拷贝资料中的条目 | NIW-U05、NIW-C83 |
| F10 | retry-kind 清空并重算第 17–20 步；没有暂存触点时不删除已有伏笔；第 20、21 步失败后可以重试 | NIW-C62b |
| F11 | 实体请求只附该候选自己的资料块切片；第 21 步复核只发送被引用的资料片段 | NIW-C12s（已做变异验证） |
| F12 | 第 5 步暂停或重启后，重新征得同意，然后重新识别卷章 | NIW-C12b |
| F13 | 继续导入时不再由界面自动代作者同意；文本与图片授权分别要求重新允许，界面说明发送范围与模型名称 | NIW-C36、NIW-C82 |
| F14 | 在本轮之前已修复（快照回滚） | NIW-C72 |
| F15 | 新增 `runtime.json`：原子写入，最多 64 条、64 KiB；暂停证明中加入可选的 `imageOperations`；初始化时清理崩溃残留的临时文件；丢弃草稿时删除 | NIW-U43、U44、C48–C52 |
| F16 | 关闭应用与所有暂停路径都先中止图片生成 | NIW-C16b |
| F17 | 向导会话拒绝旧流程的 `start` 动作 | NIW-C84b |
| F18 | 实体结果的类型、所属世界、上级、关系 id 都必须与作者的清单一致 | NIW-C40b |
| F19 | 字段结构不合法时附结构提示重试一次 | NIW-C41 |
| F20 | 第 17–19 步显示章数进度；删除未使用的参数与方法；图片类型标签改用共享常量 | NIW-C05/C11 |
| F21 | 返回"作品与目录"不递增 epoch，返回后回到原步骤和原状态；按 C68 仍然撤销图片授权 | NIW-C66 |
| F22 | 触点与引用改用 `createMany` 写入；arcStages 的 label 改为面板使用的"第 n 卷 卷名 · 第 n 章 标题"格式 | NIW-S07 |
| F23 | 导入记录只保留非清单类资料的原文；清单类只保留作者选中的条目 | NIW-C12s |
| F24 | **未修复**：草稿无法恢复时仍没有任何提示（需要新增视图） | — |

## 复审新发现（N1–N6）

| # | 问题 | 处理 | 测试 |
| --- | --- | --- | --- |
| N1 | 步骤结束时，作者的重试可能被搁置，任务停在 waiting | 在同一个 serial 回合中判断步骤是否结束；判断时若有可运行任务，就再跑一轮 | NIW-C31/F6 |
| N2 | `runtime.json` 的迟到写入与丢弃草稿竞争 | 会话已结束时不再写入；`discard` 与 `stopAction` 先等待写入完成 | NIW-C47、NIW-C51 |
| N3 | 重启后，非暂停状态的会话在没有分析授权时直接开始导入，悄悄改为只拷贝 | 会启动后台工作的向导动作改为先等待授权；`resetLaterSteps` 按模型配置而不是授权计算跳过 | NIW-C36b |
| N4 | 世界观子项按名称跨世界匹配，可能取到另一个世界的同名子项 | 先找到所属世界，再在其中按名称匹配 | NIW-C12w（已做变异验证） |
| N5 | 暂停或停止时校验 revision，后台保存后常报"导入版本已过期" | 暂停与停止不再校验 revision | NIW-C52 |
| N6 | retry-kind 之后仍保留已删除任务的跳过记录 | 跳过记录与任务列表同步过滤 | NIW-C62c |

## 验证

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit -p tsconfig.json` | 通过 |
| 向导四个测试文件（U/C/S/B） | 128/128 通过，连续运行 3 轮 |
| `tests/unit/novel-import-*.test.ts tests/integration/novel-import-*.test.ts tests/browser/novel-import*.test.ts` | 714/717 通过。3 个失败都已列入 [evidence/baseline-failures.md](evidence/baseline-failures.md)：LOTM-L-ID04 是改动前就存在的失败；LOTM-L-C04 与 CP-F01/CP-L02 是负载相关的不稳定用例，单独运行通过 |
| `npm test`（全量） | 2919/2975 通过。56 个失败中：11 个 `lotm-import-audit` 与 1 个 `lotm-local-import-audit` 是改动前就存在的失败；2 个 `byok-catalog` 在 HEAD 上同样失败；3 个导入用例（LOTM-L-ID04 为改动前已有的失败；LOTM-L-C04 与 NI-LB07 为负载相关的不稳定用例，在上一行的导入回归中均通过）；其余 39 个来自 `work-lease-main*`、`root-maintenance-main-review`、`root-migration-ipc-review`、`file-export-main*`、`configuration-files-review`、`closed-work-lease*`、`close-task-timeout-review`、`recovery-export*`、`backup-removal*`、`desktop-backup-removal-ui`、`application-metadata-main`、`release-optimization` |

关于最后一组 39 个失败：

- 它们与本轮修改无关，是 10-25 至 10-26 的导入集成改动（`desktop/main/index.ts`、`desktop/service/index.ts`、`DesktopApp.tsx`、`scripts/runtime-dependencies.mjs`）引起的。这些测试从源码中截取代码片段并注入固定的依赖后执行；集成改动引用了新的变量（`novelImport`、`novelImportRepairing`、`importJobs`、`useNovelImportSourcePickerStore`），测试没有提供，因此报 `ReferenceError`。
- 在 HEAD 的临时 worktree 中运行这些测试文件，只有 2 个 `byok-catalog` 失败。
- 这些测试的依赖注入需要随集成改动同步更新，属于后续任务。

## 尚未完成

- F24。
- R 层（R01–R11），以及 `scripts/verify-novel-import-wizard-lotm.mjs`。
- 07 中仍没有对应测试的用例：S01–S05、S10–S13（图片发布）、S16（基准）、C53–C59、C84–C86、B09、B11 等。
- 05 §8.1 规划的 `novel-import-wizard-scheduler.ts` 没有拆出，调度器仍内联在控制器中。
- 上面提到的 39 个集成测试的依赖注入。
