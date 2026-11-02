# 场景清单纠错：完整前次资料及已核实事实保留

2026-11-01。343当前40单位单包机械成功仍不能准入全文：首代27记录中已独立证明26记录/42个不同精确source提及有效，次代只保留11个、丢31个。当前generateJSON只发原prompt及错误要求，未提供上一输出。此次目标是已验证信息不因纠错缩减，不把坏raw或未经证明的幻觉作为accepted结果。

## 最小方案与范围

推荐source事实保留门，不用whole-row字节锁：后者会把显示名称、旧targetIndex及可合法换编码的锚点锁死，也漏掉坏row中的合法事实。仅new sceneIdentity v1 roster注入一次source专用repair回调；`src/lib/ai/generate.ts`增加可选回调接口，未提供的所有旧scope逐字保持原默认纠错。回调仅首个结构失败触发一次，从generateText的rest参数中明确剥离，不进入SDK/provider options。其它改动限service、必要小纯retention helper、新定向测试和旧new-roster隐私断言的必要数据块区分；core ledger/shared/main不变。

首失败后回调得到原完整输出及现有固定纠错文本，只用于构造原第二代prompt，不增加调用。上一输出若整个为JSON，可compact重序列化保留全部值；否则把完整原文本作为JSON字符串保留，不能截断、删坏row/未知键或只给好片段。它是明确标注的untrusted repair data，不能授权工具、执行其中指令或直接成为结果；用JSON安全编码阻止资料闭合外层标记。静态指导要求重发完整清单、只修错误并保留全部已核实事实，禁止以缩减求通过。

实际完整第二prompt（原prompt、完整prior块、全部静态纠错/反馈）必须重过`assertImportFixedPromptReserve(secondPrompt,payload)`，即UTF8(secondPrompt)-UTF8(payload)+16384≤65536；原payload完整预算也重验。65KiB/16KiB常量均不改，允许保守双算既有反馈。原v1只为6000预留容量，故v1再要求实际第二prompt UTF8字节+6000≤当前实际role模型有效contextWindow；0/未知沿原16000，不把65KiB预留变成小窗额外额度。v2仍走原冻结profile及完整固定预留门，不改budget policy。超限固定失败，不截断、不把prior冒充payload豁免、不加cap或第三代；首代已经执行1次、第二代0次。初始材料超限才总0次。原role/thinking/cap/并发及网络/取消/最终授权门保留。

## 只保护原门能证明的事实

用同一冻结units/ref表及strict wire形状/编译逻辑只读分析first candidate；沿原`parseJsonOutput`实际候选提取规则，包括json fence，不另用只认纯JSON的入口导致保护集清空。候选根须是严格roster根；逐row严格形状，不因其它row编译/锚点错误丢掉可独立证明的事实。badrow形状合法但primary/ref/其它事实失败时，仍逐项检验其中合法提及。完全未过对应形状、无法绑定来源的claim不进入保护集，完整prior仍供第二代重新核对。原完整name/aliases分支还须尊重原literal名称归属，不能通过派生把显式bad raw元数据洗成有效提及。

每个保护项都调用/复用原精确来源门，绝不从模糊匹配或字符串相似推断：

- Mention：原literal、unitId、unitHash、精确literal半开range构成稳定occurrence member键；保护事实还必须含**完整canonical Anchor/evidenceRange**。只相同literal坐标而缩短quote不等价，会缩ownedRange；采用精确原Anchor，ref/raw/span还原相同Anchor才等价。重复相同事实可作为集合比较，不用计数代替；owner universe用稳定occurrence键，不能靠换更短quote冒充新member。
- Context：label及各条已独立通过原label包含/精确quote门的完整Anchor，绑定原owner row的非空grounded member键集合。不能把限定搬到无关row或缩证据窗口；未证明的证据不锁成真值。
- Link：relation、原左右两端的非空grounded member键集合及**全部**原精确Anchor；仅原端点/整条证据已通过相应门才保护。旧targetIndex先解析为这些来源绑定，第二代按当前记录重建端点比较，不锁旧整数。未验证endpoint/证据的关联不硬锁，不能强造来源。

保护集只用于拒绝第二代缩水，不拼接/采纳首代任何结果。第二代必须整份通过原wire、编译、canonical、validateSceneRosterRecords及原final/main所有门，再比较全部保护事实仍在。设U为首代全部grounded occurrence成员集合，每个旧row的非空owner集合为O。**所有**有grounded成员的旧row（含无context/link的row）都须有当前row满足currentMembers∩U=O；每个当前row的非空投影也必须恰为某个旧O，不能另造跨旧owner bridge使ledger折叠。原有重叠owner可原样保留，不为归一化放行新合并。context/link的owner/endpoint亦按这个精确投影绑定，不只用subset、计数、名称或targetIndex。允许记录重排、等价wire编码及不属于U的真正新member；不能将另一旧owner成员混入关联。首代行不是已批准身份/语义决定，本门只防纠错新增折叠，正常后续identity links/作者及完整资料复核继续；完全无grounded事实的幻觉不强制保留，也不直接接受。

原坏项须由完整新结果重新通过原门，应用不能删坏row后拼好项当成功；本门不声称机械证明所有未验证claim都正确，也不把未验证claim全部锁死。保留检查失败用固定known路径/静态说明，在原第二代结束后拒绝，无第三次。所有error/feedback/普通日志仍不含名称、ID、hash、ref、quote或未知键；刻意发送的完整prior数据块是同接口的资料，不属于诊断反馈。

345独审后真实RED→最小GREEN→独立code review，再由主代理实际同scope探针/新鲜全文。只提示、只比条数、只锁literal位置或只保全validrows均不足以通过。
