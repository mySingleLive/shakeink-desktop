# 导入角色引用失败修复方案

日期：2026-10-30。范围：用户截图中的第 10 步导入角色；用指定《诡秘之主》原件验证全部角色任务。只运行相关定向测试，不运行全仓测试。

## 根因与实现

`desktop/main/novel-import.ts` 的 `importEntity` 向每个并行请求提供完整已选 `entities` 目录；服务端 `validateSemanticLinks` 据此校验角色关系。`runEntities` 分批提交 artifact，允许关系目标尚未提交，步骤完成后 `resolveWizardReferences` 再校验完整集合。但 `requestSnapshot` 无条件先执行 `importNativeMappings(s.artifacts)`，即使请求已给出 `entities`；因此先提交的合法前向关系会阻塞后续请求，报“导入实体引用类型或归属无效”。现有 NIW-C38 只有三个角色，一批提交后没有后续请求，未覆盖此路径。

只在需要从 artifacts 生成默认目录时求 `importNativeMappings`。显式目录请求使用自己的可信目录，不在组装快照时校验无关的临时部分集合。保留服务端每个返回值的严格字段、类型、身份、目录归属与证据检查，以及步骤末和发布前全量引用校验。不得添加伪造角色占位、不删合法关系、不放开外部引用、不禁用校验。

## 验证与边界

先独立方案审核，再编写和独立审核用例，RED → 修复 → GREEN → 独立代码审核。新增 >6 个角色、多批次、循环/前向/双向关系；真实 `runImportAi` 服务校验链；未知 ID、错类型仍拒绝；暂停恢复和跳过保留既有语义。

真实 macOS Electron 从源码构建。原件只读，完整正文、默认全选角色、真实已配置模型；隔离数据根，密钥只保留原加密状态，不输出。受控文件/目录选择器必须注明。记录全部任务 done/failed/skipped、角色 artifact 和引用一致性、源 hash 前后相同、无页面错误，截图到达下一步骤即停止，不继续其他类别或发布。真实模型的瞬时网络/结构问题若出现，保留错误并修复/重试，不能跳过或把未执行写为通过。真实正文和 journal 仅留隔离 /private/tmp，仓库只收计数和脱敏结论。

当前工具列表没有 CodeGraph 工具；`.codegraph` 已存在，本轮用具体源码阅读定位，不重复初始化索引。

## 真实运行补充：单实体目标契约

第一轮真实运行保留在 `/private/tmp/shakeink-character-import-20261030/incident-r2-summary.json`（原 journal 仅同目录私有副本），622 个全选角色中已完成 3 个，2 个返回“模型未返回该项内容”，主动停止。原引用错误未再触发；不能据此宣称整批成功。

代码显示 `intent=entity` 仍使用普通批量 artifacts/notFound 契约，目标 ID 仅存在于被固定提示声明“不可信”的自由 instruction 中；响应 schema 没有约束只返回该目标。补充结构化 `entityTarget={id,aliases,roleType?}`，由 controller 从已选清单构造。服务端仅允许 analyze/entity 使用、必须指向唯一且 kind 一致的目录项；缺少或伪造目标在生成前拒绝。序列化始终包含目标目录项，即使 canonical name 只以别名在正文出现。固定 entity 契约要求恰好一个目标 artifact、ID/name/kind 精确匹配；角色类型沿用作者确认值，稀疏证据不猜字段，不因缺少可选信息而省略已有真实目标。

同一响应 schema 在生成阶段和最终解析阶段执行，因此错误 ID、多角色和 notFound 会进入既有结构修复重试，不在 controller 之后才突然报失败；严格证据和全部引用门保持。普通 analyze、roster、review、reconcile、structure 的 payload/prompt 保持字节不变。保留现有有限字段重试，不对网络/授权错误无限重试。不从原文硬编码任何作品或角色信息。

新增用例先审核再 RED/GREEN：CI-05 结构化目标请求/响应非法阶段、缺失/外部/错 kind、notFound、多项、错 ID/name/kind 均拒绝；CI-06 别名出现时目标始终可见、固定 entity 单目标契约与可信角色类型、普通提示 hash 不回归；CI-07 使用真实 generateImportAiJson 的受控 generateText，首次多项/错 ID/notFound 可通过既有结构反馈修正，最终保留关系/证据。修复后重新从原件发起隔离完整角色测试，不注入旧 journal 或伪造模型响应。

## 真实运行补充：服务层字段错误的有限纠错

第二轮（r3）560 个全选角色已完成 3 个，观察到“模型返回的角色字段结构无效（可靠性、来源单元）”，驱动及时暂停并保留私有现场；不能判整批通过。检查 `importEntity` 可见其已有的一次字段纠错只包围 `validateImportSemanticArtifact`，而 `await this.ai` 与 `accept` 都在 try 外，服务端两次结构生成仍无效后直接变成可见任务失败，未进入已有字段纠错。

将同一有限纠错边界覆盖“获取模型结果→目标检查→原生字段检查”。仅当已取得经授权/来源检查的响应，或服务层返回固定的结构错误（角色字段结构无效、角色结构无效、模型返回结构或类别无效）时允许第二次请求，附固定纠错说明与已净化字段标签。授权/模型变更、预算、网络、取消及运行时持久化失败原样抛出，绝不重试。第二次请求仍走完整服务层 schema、证据与引用校验；持续非法最多两次请求、每次既有两轮结构生成，不转换/删改非法值制造成功。

entity 专属固定提示同步明确：可选 reliability 未知须省略，提供时只能为既有四值；sourceUnitIds 与 evidence.unitId 必须逐字来自 units[].id，不能取 fileId、实体 ID 或编号。普通阶段提示字节保持。保留全部合法字段及关系，不新增占位、不降低未知单元/不实引文的拒绝规则。新增 CI-08/09 先用例审核，再 RED/GREEN：真实 controller→runImportAi→generateImportAiJson 的前两轮非法、第三轮有效可恢复；持续非法四轮后停止；模型授权、网络、取消和运行时持久化错误不进入纠错。
