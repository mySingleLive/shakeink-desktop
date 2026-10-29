# 《诡秘之主》整书向导导入：测试用例

日期：2026-10-29。范围仅为指定 TXT 经 22 步导入向导的完整真实导入、本任务 11 类内容，以及执行中实际需要的自愈。所有用例初始为 NOT RUN。

## 判定规则

- 状态只用 PASS、FAIL、BLOCKED、NOT RUN。机械持久化与文学语义分开判定；未执行、无法证明或有关键问题不得写 PASS。
- 必须使用当前源码构建的 Electron（隔离 `LotmVerification.app` 运行时）、正式向导界面、真实模型和真实 PGlite。文件与目录选择为受控选择（替换 `dialog.showOpenDialog` 返回固定路径），证据中注明“非原生对话框”。
- 不得直接写 journal 或数据库、替换模型响应、缩短输入、关闭目标或跳过步骤。清单步骤保持默认全选。
- 冻结基线：`/private/tmp/shakeink-lotm-local-20261028/expected-chapters.json`（9 卷 1402 章）、`expected-body.txt`、`non-narrative-ordered.json`、`semantic-minimum.json`。基线若被独立证据证明有误，保留旧版、记录原因、重新独审后修正。
- 精确目标 11 类：`outline/theme/style/character/item/scene/world/foreshadow/trope/worldline/narrative`。金手指不选。
- 只运行本文用例和实际修复所需的定向回归，不运行全仓测试。

## 用例

| ID | 操作 | 通过条件 | 证据 |
|---|---|---|---|
| LW-IN01 | 只读重算来源身份；第 2 步查看文件行 | 字节数、SHA 与冻结值一致；显示 GB18030（自动识别），无确认编码；4,803,440 字符；运行前后原件 SHA 不变 | files.json、截图、前后 hash |
| LW-CLS01 | 本地分类（D1 回归） | 从行中间开始的单元不按首行判断资料标签；探针中的 9 个误判单元在修复后为 body 或 unknown，不再出现“物品/场景 识别到”；行首真实标题仍能识别 | 定向单测 RED/GREEN、修复后探针 kinds.json |
| LW-FLOW01 | 新会话经第 2→3→4 步 | 新 UUID，`wizardVersion=1`，createdAt 晚于本轮构建冻结；作品名与空目录确认；无旧 artifacts/coverage | 会话身份、构建身份 |
| LW-FLOW02 | 第 4 步：保留正文，推断勾选 11 类，取消金手指；有未分类片段时点“允许识别” | selected 仅含 body（不含误判资料）；targets 与 11 类相等；infer=true；AI 分类后 sourceReady=true；分类结果中非叙事区间（站点头、简介、卷末作者说明、完本感言等）不进入 body | kinds 前后检查点、分类统计 |
| LW-VOL01 | 第 5–6 步卷章树；必要时用“手动调整卷章”补卷名 | 9 组 1402 章：小丑 213、无面人 269、旅行家 250、不死者 214、红祭司 204、逐光者 116、倒吊人 87、愚者 41、番外 8；顺序、标题、start/end 与基线逐章相等；没有“未分卷”或“导入内容” | 树截图、structure 与基线对比 |
| LW-BODY01 | 第 6 步全选并允许；第 7–8 步后及发布后比较正文 | 物化后 1402 章内容拼接 SHA 等于 `expected-body.txt`；发布后每章 Chapter 内容与基线逐字相等；workingRevision=0 | 检查点、只读 SQL 导出比对 |
| LW-CHAR01 | 第 9–10 步角色 | 清单含克莱恩·莫雷蒂（主角）及冻结清单中的重要角色；全部任务 done，无跳过；Character 行的身份、别名、关系、状态有原文依据；多身份（克莱恩/夏洛克·莫里亚蒂/格尔曼·斯帕罗/道恩·唐泰斯/愚者）正确关联；关系 ID 可解析 | 清单、任务状态、Character 表、语义核对 |
| LW-SCENE01 | 第 11–12 步场景 | 廷根、贝克兰德等主要地点存在；父子层级正确；全部任务 done | Scene 表 |
| LW-ITEM01 | 第 13–14 步物品 | 重要物品与封印物存在，归属、能力有原文依据；全部任务 done | Item 表 |
| LW-WORLD01 | 第 15–16 步世界观容器 | World 容器归属合理，不错拆并列世界；设定均归属已导入世界 | World 表、检查项 worlds |
| LW-WORLD02 | 九类子设定 | LEVEL_SYSTEM、POWER_SYSTEM、CONCEPT、FACTION、MAP、SOCIETY、CULTURE、GEOGRAPHY、WORLD_HISTORY 每类至少一条原生 Setting，内容有原文依据且类别不错分；22 条途径/序列结构体现在等级体系中 | Setting 表按 type 计数与抽查 |
| LW-SET01 | 第 16 步主题、文风、爽点/泪点 | Theme.synopsis 非空且有依据；仅一条 STYLE Setting；Trope 中 SATISFACTION 与 TEAR 两类都存在；notFound 不含这三类 | Theme/Setting/Trope 表 |
| LW-WLINE01 | 第 17 步世界线 | PlanningDocument 世界事件覆盖八卷与番外，顺序与因果正确，不造日期 | PlanningDocument、事件抽查 |
| LW-NARR01 | 第 18 步叙事线 | 讲述卡 chapterIndex 指向存在章节（含番外），refs 指向存在事件；检查项 lines 通过 | PlanningDocument、检查项 |
| LW-OUT01 | 第 19 步细纲及大纲 | 1402 章 Chapter.outline 全部非空且与本章内容相符；检查项 outlines 显示 1402/1402 | Chapter 表、抽查 |
| LW-FORE01 | 第 20 步伏笔 | Foreshadow 至少 5 条，含已回收与未回收；触点可在正文定位（检查项 touches 通过）；抽查 5 个引用经 `resolveReferenceAnchor` 定位成功 | Foreshadow 表、检查项 |
| LW-VERIFY01 | 第 21 步校验 | 8 项检查全部 ok；无未处理冲突（有冲突时作者决定并记录）；notFound 不含任一所选类别 | verify 检查点、截图 |
| LW-PUB01 | 保存作品 | 单次发布完成；作品写入所选空目录；导入记录存在 | completed 检查点、发布回执 |
| LW-PERSIST01 | 关闭应用，复制作品库只读审计；再正常重开 | 只读审计与最终检查点一致；原库、原件未被改；重开后在业务面板看到正文、角色、场景、物品、世界观、伏笔、两线 | scratch SQL、重开截图 |
| LW-SEM01 | 语义核对 | `semantic-minimum.json` 45 项逐项判定，引用原文位置；除机械通过外另给出文学结论；无法证明的项目不写 PASS | 语义台账 |
| LW-SEC01 | 证据审计 | 证据目录无 Key 模式（`sk-`、`Bearer `、`api_key`）；仓库文档不含长段原文；未复制 session/state 到仓库 | 扫描结果 |
| LW-HEAL01 | 每次真实失败的自愈 | 保留原始失败；区分来源/模型/产品/驱动；产品修复走方案独审 → RED → 修复 → GREEN → 代码独审；之后回到同一会话复测；不降低校验或改预期迁就结果 | 每轮记录 |

## 最终判定

全部用例 PASS 才算整体通过。若来源本身限制权威文本认证，结论只限“对指定 TXT 保真”。任何必需步骤被跳过、类别缺失或语义未核对，总结写 FAIL/BLOCKED/NOT RUN。
