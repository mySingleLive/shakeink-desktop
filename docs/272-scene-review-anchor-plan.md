# 场景导入后复核证据定位方案

日期：2026-10-31。R15新会话原件全文1402章/5589单元、默认全选982场景全部成功，场景阶段245730.637833ms、0失败/跳过/丢弃/映射警告。但进入verify后首个review请求约303秒后以固定`模型证据无法定位（no-match）`失败，正常退出2/0，未发布或重开；不得把场景阶段成功改称完整导入成功。

## 已证实原因与最小改动

`desktop/service/novel-import-ai.ts` 的生成schema只对analyze阶段提前核验evidence，review阶段的conflicts与missingTargets引文只在runImportAi末端由`anchorEvidence`核验；因此JSON形状合法但引文不匹配时，越过了generateJSON已有的两次生成纠错入口，首个模型结果直接终止复核。R15固定no-match来自这条末端门，不能据此推断具体模型原文值。

仅在semanticVersion=1、phase=review、selectedTargets恰好为scene的场景定向复核请求中，对已通过原base schema的conflicts[].evidence[]和missingTargets[].evidence[]运行同一个末端`anchorEvidence`谓词。只添加静态、安全、可定位到证据项的Zod问题；不修改quote/unitId、不移动到其它单元、不补证据、不修改结果、接受集合或原末端门。使用原四种固定定位原因指导复制本次声明单元的真实连续原文，仍由既有generateJSON最多两次生成纠错。其它目标/阶段、旧版协议和原模型/预算/并发/思考配置保持原行为。

首轮错引用第二轮有效应恢复；持续失败保持两次生成且零结果落盘，不新增controller外层review重试；网络/授权/取消仍一次。固定错误与纠错反馈不得泄露原文、quote、ID、未知键或任意原始cause。完整units、artifacts、全部字段和证据项均不减少或删除坏项。

独立方案审核→用例审核→RED/GREEN→独立code review→受影响定向回归/类型/构建。再对真实失败review范围只读复测和新会话整书全选场景、真实完整复核、发布、正常退出/重开核对。R15保留为场景阶段通过而完整流程未通过，不绕过复核或用局部结果替代保存。
