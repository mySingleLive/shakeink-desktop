# 自定义接口选择补充用例

日期：2026-10-24。前置：[补充方案](../plans/2026-10-24-explicit-relay-api-design.md)已由独立子代理 `audit_installed_transport` 审核通过。

| 编号 | 场景与预期 |
| --- | --- |
| WIRE-01 | 旧存储、公共快照、导入、引导缺少 wire 时正常解析；undefined/auto 对旧同名官方型号保留 Responses，对未知型号保留 Chat。非法枚举在持久化和配置测试前拒绝，不发请求。 |
| WIRE-02 | 新建 custom/OpenAI/TEXT 界面默认 Chat；旧记录编辑显示自动；明确选择 Responses/Chat 后，测试草稿和保存草稿均携带选项。选择不清 Key，不自动保存，取消不改变原记录；官方、Anthropic 和 IMAGE 不显示该字段。 |
| WIRE-03 | 同凭据作用域修改 wire，空 Key 保留原加密凭据，authRevision +1，旧租约、排队请求及读取中的响应撤销；undefined↔auto 不升 revision。保存关闭重开保留接口；已有默认模型 ID、审核/图像角色选择保持。 |
| WIRE-04 | 测试和实际 SDK 共用策略。custom 显式 Chat 的同名官方型号只请求一次 `/v1/chat/completions`，发送 messages，系统角色为 system，通用预算为 max_tokens，不继承 reasoning/access_programs/官方非流式能力；不请求 Responses。 |
| WIRE-05 | custom 显式 Responses 只请求一次 `/v1/responses`，发送 input、store:false，不继承官方附加能力。官方供应商和旧 auto 的官方行为保持。根地址仍规范化一次 `/v1`，原地址不重写。 |
| WIRE-06 | 实际 SDK 的正常文本、原生/文本降级纯工具调用、非流式模拟保持可用；空响应与异常结束守卫不退化。不可变 PublicModel 快照保留 wire，用量快照无需 Prisma 迁移。 |
| WIRE-07 | HTTP 401/403 经主进程→RPC→SDK→聊天，分别落固定认证/权限 code，status=failed，单次主动请求，无自动重试；嵌套 cause/RetryError/精确 HTTP_xxx 码均识别，任意供应商文案不用于猜测或展示。 |
| WIRE-08 | 用户取消、授权撤销优先；402/明确配额、429 保留原分类；wire 固定码不采纳外部原始错误文案，Key/URL/供应商正文不进入作者提示。 |
| WIRE-09 | 类型检查、生产构建、独立代码审核、核心回归与实际包资源/签名完整性检查通过，保留旧 app 恢复点；历史缺样本/未执行平台明确保留边界。 |
| WIRE-10 | 通过已安装应用 UI，将当前模型明确选择 Chat 后手动保存；既有 Key、endpoint、型号和128K容量保持。主动连接测试成功，再新短会话生成非空内容且正常结束，退出重开后仍可回读。若正确接口仍拒绝 Key，记录失败并停止猜测型号/自动切换，权限结论待作者/供应商处理。 |

TDD：新增根因用例先在原行为上失败，既有兼容保护保持通过；再实施。仅使用合成凭据与正文做自动化测试，真实认证仅由本机应用原有凭据完成，不复制或记录 Key、真实供应商原始响应和用户正文。真实验收仅主动触发次数可观测时，不宣称抓包或实际 HTTP 次数。

独立子代理 `audit_source_generation` 已审核上述补充用例，通过且无阻塞项，允许进入 TDD。
