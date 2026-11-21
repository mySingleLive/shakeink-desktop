# 角色识别提速与进度计数 验证（240）

日期：2026-10-30。方案 `docs/238-roster-speed-plan.md`，用例 `docs/239-roster-speed-cases.md`，审核 `docs/238-roster-speed-plan-review.md`、`docs/239-roster-speed-cases-review.md`、`docs/241-roster-speed-code-review.md`。

## 真实目标系统（RR）

- 环境：macOS，隔离数据根 `/private/tmp/shakeink-lotm-runtime-20261027/app-data-roster-20261030-r8`（复制原测试根的模型配置，不含旧草稿），`LotmVerification.app` Electron，文本模型 DeepSeek-V4.1-Flash。文件/目录选择器由驱动替换（`scripts/run-lotm-wizard-import.mjs`，`LOTM_ROSTER_ONLY=1`），其余点击均为界面按钮。
- 来源：《诡秘之主》全书，GB18030，1402 章，工作正文 5589 个单元。
- 证据：`docs/evidence/240-roster-speed-real/`（`roster-timing.json`、`events.jsonl`、4 张截图），为最终构建的运行（r8）。只记录名称和计数，不含正文与 Key。

| ID | 结果 |
| --- | --- |
| RR-01 识别时长 | 从点击"允许分析并导入"到步骤变为等待作者：**37.8 s**（驱动计时）；59 次识别调用从第一次开始到最后一次结束 32.4 s。59 次全部成功，覆盖 5589/5589 单元。通过。各次运行：r2 33.7 s、r3 30.8 s、r4 42.8 s、r5 42.4 s、r6 40.7 s、r8 37.8 s，均低于 60 s；差异主要来自供应商响应时间 |
| RR-02 计数可见并递增 | 识别中采样 24 次：338→339→368→…→533→539→557，单调递增；截图 `005-detect-char-running-338.png`、`006-detect-char-running-464.png`、`007-detect-char-running-557.png` 显示"已识别 N 个角色"。通过 |
| RR-03 结果可用 | 步骤为等待作者，候选 557 个，未出现草稿保存错误。克莱恩·莫雷蒂为主角；阿蒙、兰尔乌斯、真实造物主为反派；简、兰德、戴里克·伯格、奥黛丽、佛尔思等为配角（截图 `008-detect-char-done.png`）。前 40 名：主角 1、反派 4、配角 35。通过 |

对比改动前同书记录（`app-data-wizard-20261029`，思考强度 high、串行）：36 批平均约 115 s/批，全书 59 批估算约 1.9 小时，且两次因"角色字段结构无效"失败。

召回对比（改动前只覆盖了 3324/5589 单元）：本次前 40 名中反派 4 个；改动前 344 个候选中有 70 个反派。关闭思考后模型更倾向标为配角，角色类型可在清单中逐个修改。

运行中发现并修复的问题：第一次真实运行（r1）中，主角合并后的别名超过 50 个，超出草稿上限，保存失败（`ImportWizardStateError`）。已修复为最多保留前 50 个别名（RS-06），此后各次运行不再出现该问题。r4–r6 还发现主角被显示为配角、显示名变成"周明瑞"：共享称号（"魔术师""海神"）和个别批次的误标把主角与佛尔思、卡维图瓦等合并成一组，配角票数超过主角票。已改为更严格的名称合并规则（方案"审核处理"末条，RS-06c/06d），r7 存档离线复算与 r8 真实运行均正确。r1 的 Electron 被强制结束后，未保存的草稿已按"中断即删除"规则删除。

## 自动化

Node v24.18.0。

- `npx tsc --noEmit`：通过。
- 定向：`novel-import-roster-ai`（RA-01–09、RT-01–03、WP-04）、`novel-import-stage-batches`（SB-01/02）、`novel-import-wizard-prompt`、`novel-import-wizard`（含 RS-06、RS-06b/c/d）、`novel-import-request-schema`、`novel-import-wizard-session`（含 RS-01×2、RS-03、RS-04、RS-04b、RS-05、RS-05b、RS-07、RF-01）全部通过。RS-05b、RS-06b、RS-06c、RS-06d、RS-07 已确认在去掉对应修复后失败。
- 浏览器 `tests/browser/novel-import-wizard.test.ts`：24/24 通过（含 RB-01/02/03）。
- 全量 `npm test`（最终代码）：3046 项，2990 通过，56 失败。基线（同一工作区改动前）3022 项，59 失败，名单 `/tmp/roster-baseline-fails.txt`。与基线相比无新增失败。此前几轮全量中 `CP-F01/CP-L02` 与 `model-configuration`"saved authorization revoked during key read…"各偶发失败一次，单独重跑均 3/3 通过，与本次改动无关。
- 上一轮全量发现 `NI-J01`（检查 `defaults.generate` 最后一句直接返回 `generateImportAiJson`）因识别分支失败，已调整语句顺序，行为不变，本轮通过。
- 代码审核（`docs/241`）M1、L1–L3 修复及名称合并规则修改后，重新构建并真实运行（r8，见上表）。
