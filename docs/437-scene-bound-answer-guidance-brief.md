# 场景绑定答案的编号与纠错反馈

R61 全文正常导入失败，60 个真实生成的输入 SHA 在零接口回放中全部匹配，7 个 RPC 的修复事务仍不合法。当前代码在 answers 解码或替换结构失败时回传“本轮只返回 repairs / 逐字 choiceRef”，但同一提示结尾要求 answers；selection 的 options 又是没有印出方案号的数组，而共享证据 choices 已印有另一组编号。独立诊断继续区分每包实际原因，本方案不声称这些解释全部失败。

只改模型可见的任务显示与失败后的闭合反馈，不改任何接受门。保留原有私有 tasks、bindings、options 及解码器，新增显示投影：每项显式印出 answerNumber（1-based），selection.options 每项为 `[optionNumber, 原完整 assignment]`；完整编号连续且一一对应，不截断、重排或预选。replacement 仍显式印出 canReject/boundCanReject 与原 slot。共享 choices 八列保留。答案合同仍为按任务顺序的 answers 数组，selection 回局部 optionNumber；replacement 的 evidence.choice 回共享 choices 号。原任务、方案编译、原来源资料、keep、原失败全文与旧协议兼容资料全部保留。

active answers 分支失败后使用专属闭合指导，不再要求 repairs/choiceRef。最多六项安全诊断只说明已知 answerNumber、任务类型、要求的完整个数、合法局部范围或 replacement 三种互斥结构；绝不回显模型提供的键、字符串、literal、label、ref、quote 或错误消息。按原真实拒绝顺序定位：数量先失败就只报数量，不将未到达的越界、类型或来源门称为该代首因。诊断只在原严格门已拒绝后运行，不能决定接受、修改答案或默认值；原来源、保留和成员归属门的安全反馈仍保留。旧 repairs 兼容分支仍按原门及原反馈；answers/repairs 混根仍拒绝。未进入 active 的首轮、根恢复及其它业务不改。失败 UI 保持“修复事务”静态类别，仅以新增可信完整指导精确匹配。

替换结构指导需写明三者只能选一：mentions/context/links；或加 primaryMentionIndex；或同时加 name/aliases。mentions 每项 evidence 必须是单个 `{choice:共享号}` 对象，context/link 的 evidence 才是非空对象数组，不能用旧 ref 字段；缺少三数组或把 mention evidence 写成数组仍由原严格门拒绝。R61 的九个 replacement 首拒中六代为 mention evidence 数组、一代为旧 ref 字段、两代缺三数组并有额外字段；该观察补充明确指导，不改变协议或任何接受门。不能把 Native 提示的宽松字段集合当成本地接受合同，也不能用删除资料、自动补字段或宽松解析修复模型答案。

TDD 先证明显式编号显示可无损还原整个私有任务并冻结、选择多个不同局部方案时仍按原门产生同一结果、全负例仍拒绝、已拒绝答错的后续提示得到相应安全诊断且无旧协议冲突、三种替换正例及 mixed/partial 负例、旧 repairs 路径与首轮不变。真实业务桥测试保留原 oracle 与所有约束，仅测试显示读取器适配新显示格式并有独立坏格式负例。

验证先跑本改动定向用例与独立审核；对原 130 首轮请求及 R46/R47/R61 捕获回复驱动的新完整提示逐代重算全部原预算，不把新提示称为旧输入 SHA 相同或新供应商行为通过。不抬预算，不裁资料；超过则先修改显示编码或反馈体积。类型、桌面构建、根定向回归、独立 code review 后冻结新构建，再以新的正常隔离全文导入检验；未完成所有场景、资料完整性、发布及正常重开前不得宣称修复完成。
