# 555 · 导入时模型余额不足的错误提示 技术方案

需求：用户 2026-11-12。导入《诡秘之主》第一卷到「识别角色」时失败，界面只显示「模型接口请求失败（HTTP 402）」，用户重试多次仍失败。原因是 DeepSeek 账户余额不足（已充值）。要求改进导入过程中因模型余额不足导致的错误提示。

## 现状

- 主进程 `ModelService.start`（`desktop/main/model-service.ts:82-85`）丢弃供应商错误正文（可能回显密钥），只保留状态码，改写为 `模型接口请求失败（HTTP ${status}）`。供应商的 "Insufficient Balance" 原文到不了导入层。
- 导入层的结构化请求同样把 4xx/5xx 规范为该文案（`desktop/service/novel-import-ai.ts:826-828`）。
- 导入向导所有作者可见的错误都经过 `NovelImportController.safeError`（`desktop/main/novel-import.ts:2016`）：步骤错误 `w.stepError`（773、824、1156、1303、1398、1432 行）、任务错误 `task.error`（956、972 行）、复核分段错误（1472 行）、会话错误 `s.error`（2015 行）。
- `safeError` 对以「模型」开头且短于 180 字的消息原样放行，所以 402 显示为「模型接口请求失败（HTTP 402）」，没有说明原因，也没有说明重试无效。
- 图像生成的 HTTP 错误码是 `IMAGE_HTTP_${status}`（`desktop/main/image-generation.ts:38`）。`IMAGE_HTTP_402` 不匹配任何映射或前缀，显示为通用的「导入处理失败，请核对来源、模型配置后重试」，原因被掩盖。
- `safeError` 已有 `'Insufficient Balance'` 映射为「模型服务返回余额不足提示，请核对供应商账户」（NI-J05 覆盖），但没有说明下一步怎么做。
- 请求层不会对 402 自动重试：`network-retry.ts:132,184` 在 `classifyError(error).retryScope==='none'` 时停止，而 402 归为 `quota_provider`。本方案不改重试逻辑。

## 方案

只改 `safeError` 的映射，不改错误的产生、分类、重试和步骤状态机。

1. 文本模型 402：消息恰为 `模型接口请求失败（HTTP 402）` 时，返回
   `模型服务账户余额不足（HTTP 402），重试无法恢复。请到模型供应商充值，或在设置中更换模型后重试`
2. `'Insufficient Balance'`：改为同一句话，去掉「（HTTP 402）」：
   `模型服务账户余额不足，重试无法恢复。请到模型供应商充值，或在设置中更换模型后重试`
3. 图像模型 402：`IMAGE_HTTP_402` 返回
   `图像模型账户余额不足（HTTP 402），重试无法恢复。请到模型供应商充值，或在设置中更换图像模型后重试`

用「更换模型」而不是「更换文本模型」，因为复核阶段用的是复核模型（`executionBudget`，2069 行）。`safeError` 拿不到是哪个模型，文案不指名。

文案都不到 80 字，在 `stepError` 400 字上限内（`novel-import-wizard-state.ts:56`）。

## 不改的部分

- 界面按钮（「重新识别」「跳过此步骤」「重试」）保持不变。充值后用户仍然要点重试，去掉按钮会让充值后无法恢复。文案里说明「重试无法恢复」，指的是余额恢复之前。
- 其他状态码（401、403、429、5xx）的文案不在本次范围。
- 运行时判定（`SCENE_FATAL`、`settingsFailureClass`）匹配的是原始错误消息，不是 `safeError` 的输出，不受影响。全仓没有代码按 `stepError`/`task.error` 文案做判断（已搜索 `.startsWith/.includes/.match/.test`）。
- 已保存的会话里旧的 `stepError` 文案不迁移，重试后会写入新文案。

## 风险

- NI-J05 断言了 `'Insufficient Balance'` 的旧文案，需要同步修订。
- 新文案以「模型服务」「图像模型」开头，即使映射失效，也会经通用前缀规则原样放行，不会泄露路径或密钥。
