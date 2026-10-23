# 自定义 OpenAI 接口选择补充方案

日期：2026-10-24。关联：[中转兼容性方案](../design/2026-10-24-relay-compatibility-fix.md)、[验证记录](../testing/2026-10-24-relay-compatibility-results.md)。

## 新证据与目标

用户已亲自完成 macOS 密钥串授权。修复版使用原配置主动测试一次，界面显示 `PERMISSION_DENIED` 的固定文案；另一次新短会话的实际生成明确失败，没有伪成功。

中转自身公开的 `/api/pricing` 元数据为 exact `gpt-6.1-sol` 声明 `supported_endpoint_types: ["openai"]`，同一响应将 `openai` 明确映射为 `POST /v1/chat/completions`，没有列出 Responses。当前软件却按官方同名型号元数据选用 `/v1/responses`。这构成接口不匹配的直接证据；公开目录不证明当前 Key 的调用权限，后续仍须真实请求验证。

补充修复目标是使作者可明确选择中转提供的接口，并让配置测试、实际聊天、正文生成和摘要使用同一选择；不换型号、不取出密钥、不增加失败后自动切换 API 的付费调用。

## 方案取舍

推荐增加可选 `wire: "auto" | "chat" | "responses"`。旧记录缺失等价 `auto`，完整保留原有选择与能力行为；新建自定义 OpenAI 文本配置默认 `chat`，旧记录编辑显示自动。当前原模型将在修复版界面明确选 Chat 后手动保存。

全局将 custom 强制改成 Chat 的方案更小，但会破坏已有依赖 Responses 的配置；按生成失败自动重试另一 API 可能重复计费，也不能可靠判断权限错误原因，均不采用。

## 数据、授权与界面

- `modelSchema`、`ModelDraft`、`ConfigurationDraft` 与派生模型引导草稿接受可选 wire；非法枚举拒绝，旧状态无须迁移或重写。原配置导入导出只迁移角色引用，继续保持该边界，不扩展为跨机复制模型授权或接口配置。
- 界面复用现有字段及原生单选下拉，仅自定义/OpenAI/文本显示“OpenAI 接口”，提供自动（兼容原配置）、Chat Completions、Responses；新建默认 Chat，编辑缺字段时显示自动。配置测试不保存，保存后才生效。
- wire 变化属于调用语义变化：保留同供应商、协议、地址、类别下的原加密凭据，但增加 authRevision 并撤销旧执行。undefined 与 auto 视为同义，避免无效撤销。更改供应商/协议/地址/类别仍须明确重输密钥。
- 公共快照与用量记录携带已选 wire；现有任务默认只引用模型 ID，无须新增另一份可漂移的接口字段。模型解析继续使用不可变快照。

## 共享调用策略

新增共享纯策略函数，由 `ModelConfigurationService` 和 `instantiateModel` 使用。

- 官方供应商及旧 custom/auto 行为保持。
- custom/OpenAI 显式 Chat/Responses 只采用明确接口，不继承官方同名型号的 reasoning、access_programs、streaming 等特性；测试使用通用有限输出预算。
- 显式 custom Chat 同时关闭 SDK 自身按官方型号推断 reasoning 的行为，使用 `forceReasoning:false` 和 `systemMessageMode:"system"`，避免它再次隐式改写系统角色与预算字段。
- Responses 的 `store:false` 仍保持。Chat 发送 messages，Responses 发送 input，流式正文和纯工具守卫保持。
- 其他协议、图片、根地址规范化、授权路径范围与密钥保留逻辑维持现有边界。

真实聊天另发现 HTTP 401/403 落入通用内部错误。补充固定、可操作的认证失败/资源拒绝诊断，禁止自动重试，不透传供应商正文；取消和授权撤销优先，额度与限流保留原有分类。

## 实施与验收

本方案独立审核后，先形成补充用例并独立审核，再按 TDD 实施；独立代码审核、定向及核心全量检查、类型检查、构建、包校验，最后通过原生界面将当前模型明确选择 Chat 并手动保存，验证连接、短文本正常结束及重开回读。原程序和上一轮修复包保留；保存新字段前在仓库之外的私有目录保留加密配置恢复点。旧版 strict Schema 不识别新字段，程序回退还需恢复对应配置，不能单独换回旧 app。

如正确接口仍拒绝当前 Key，如实记录返回结果，不猜测其他型号或修改凭据授权范围。

独立子代理 `audit_installed_transport` 已审核本补充方案，通过且无阻塞项。补充用例须覆盖接口切换撤销、真实 SDK 参数及认证分类优先级。
