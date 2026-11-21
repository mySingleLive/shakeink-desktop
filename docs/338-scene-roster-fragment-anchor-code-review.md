# 场景清单片段与提及名称编码：独立代码审核

结论：**限定范围通过，无阻塞。**336方案和337用例已由另一审核者按序通过。本轮审核新增纯helper、payload/service接线及FA/RC定向用例；未修改产品或测试，未构建/启动App、调用模型或读取小说、真实模型回复、Key。CodeGraph工具未暴露，依据已定位源码。

## 实现核验

- `desktop/core/novel-import-scene-roster-fragments.ts:6`严格限定新v1/analyze/roster/scene/mode roster。发送副本只将单位text替换为fragments并加当前数组unitIndex，保留其它metadata；原单位与请求不变。第9行按完整Unicode码点和固定句/分句、换行边界切分，CRLF一起保留，索引连续且每片非空。首尾、纯空白、连续标点、无标点文本不删改；空单位仍在目录，fragments为空。
- 第21行还原只解释当前units和当前算法；严格三own-key、非负安全整数、当前unit和半开非空区间均校验，越界/反序/空单位/额外键失败。没有按旧ID或旧目录缓存，没有改绑、补字或跨单位拼接。还原产生的仍是原Anchor `{unitId,quote}`，未将索引本身当作唯一性或语义证明。
- `desktop/service/novel-import-ai.ts:70`的generation schema整份strict wire先解析。anchor为原raw或新三索引的严格union；record为原完整name/aliases分支或primaryMentionIndex分支的严格union。混键、额外键（含own undefined）不能被另一分支吞掉。形状失败后的分支重解析仅用于安全诊断，之后仍返回`z.NEVER`，不参与接受。
- 只有整份shape成功后才编译副本：逐个还原全部mention/context/link anchors；新record只取自己实际存在的primary mention.literal为name，其余不同literal按首次出现exact去重为aliases，不trim/NFKC/跨记录收集，不删重复literal的mentions。旧完整record保持显式name/aliases，错误值不会从mentions自动修复。
- 编译后仍调用原`validateSceneRosterRecords`，其内部原canonical record schema及完整校验保留：quote在声明单位内唯一、literal在quote内唯一、全部名称/别名覆盖、每条context包含、links及总引用容量。派生aliases超过20仍整体拒绝，不截断。成功仍只编译一次原公共roster与完整sidecar，public canonical schema、service-final与main门不变，不暴露新wire控制字段。
- 失败反馈继续使用固定字段/当前安全数组索引与静态说明，最多6项、每message不超过原250 UTF-16 code units。新分支的名称问题映射回实际primaryMentionIndex/mentions，不要求填写其不存在的name/aliases。非唯一quote只给连续片段扩展指导，literal仍须恰一次；旧坏raw不fallback、不改字、不取首。
- `desktop/core/novel-import-ai-payload.ts:33`仅在精确scope使用fragment发送副本；原text没有重复发送，全部片段、index与metadata进入同一serializer，controller fits和worker看到同一材料。新增prompt完整计入原fixed reserve，16KiB wrapper reserve、原role/thinking/cap/两代及并发均未改。非scope仍使用原单位表示，原exact-scene review的unitIndex协议不变。

## 独立执行

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test tests/unit/novel-import-scene-roster-fragments.test.ts tests/unit/novel-import-scene-roster-correction.test.ts tests/unit/novel-import-scene-identity-service.test.ts tests/unit/novel-import-scene-identity-session.test.ts
```

实际**106/106、exit0**，日志`/private/tmp/scene-roster-fragments-independent.txt`。其中FA29和RC17共46已包含在106内，不重复计数。实际JSON桥对照旧合法raw与新wire完整canonical一致；长Unicode/CRLF引文、全部mentions/context/links与输入clone保留。严格union、坏后项/后证据、范围/primary越界、双唯一失败、旧显式坏名称、21个其它literal及直接undefined等均拒绝；首坏→预置好仅两代，持续坏两次仍拒绝。

FA01实际逐字符concat、连续index、无surrogate/CRLF切口、同ID改text/交换当前unit顺序；FA03检查发送单位只有fragments、无重复text且其它metadata逐值全等。实际text/review角色完整payload边界N可生成，新增一字符超界0 generation；不能裁单位、片段或提高预算。原输入未改变。

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test tests/unit/novel-import-request-schema.test.ts tests/unit/novel-import-wizard-prompt.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node node_modules/typescript/bin/tsc --noEmit --incremental false
git diff --check
```

旧请求/提示组实际**54/54、exit0**，日志`/private/tmp/scene-roster-fragments-old-scope-independent.txt`。完整类型检查实际exit0，日志`/private/tmp/scene-roster-fragments-independent-typecheck.txt`为空；diff检查实际exit0。不与作者232项或主代理另跑组合相加成新的独立覆盖数。旧RC03只按根授权更新新roster发送表示期望为完整fragments重建及metadata全等，原非scope断言未减弱。

已核作者原RED日志`/private/tmp/scene-roster-fragments-red.txt`：实际23节点、17通过6失败。原合法raw baseline通过后，新合法index/primary经真实generation桥两代仍拒绝，构成功能RED；不是把helper模块缺失当整条功能失败。FA01 helper module-missing、direct generation schema函数不存在分别单列；别名上限反馈目标断言未满足；FA03仍收到旧text表示而失败。FA02在首个新wire成功断言前失败，后三个子用例未注册；FA03同样在发送表示处先失败，其预算/非scope三个子项未注册。GREEN实际29节点后才达到这些六项，不倒填旧RED覆盖。旧代码对不支持的新wire负例的17项拒绝，不冒称已执行新索引范围的目标门。

## 冻结身份与R30诊断准入

以下五项执行前后SHA256一致，核对记录`/private/tmp/scene-roster-fragments-independent-before.sha256`：

| 文件 | SHA256 |
| --- | --- |
| desktop/core/novel-import-scene-roster-fragments.ts | a4e63b8122bd4e3ddafcbd8ed8c63a43ee9f616138470df0b81e231d0aebe2ac |
| desktop/core/novel-import-ai-payload.ts | a3039d427c522f7bdcd3eef43d4b141bf1ad1d877ffabf72e42008825dae182d |
| desktop/service/novel-import-ai.ts | 62a270555f2d1fef507521d53c30946e99931b1d2f460cf183434373c2466b69 |
| tests/unit/novel-import-scene-roster-fragments.test.ts | 754d04e4b27174031ad6aa4f6b60b9f30cb099d98a349d468afd99b5fd52d256 |
| tests/unit/novel-import-scene-roster-correction.test.ts | 63db3ad847d4185f7c8e69fe205c681cca39895ebe306c7b061d9c2139610260 |

只读核对私有R30 helper相对已审R29 helper的diff：新增实际generateText入口`options.prompt`的SHA256及长度，不保存options或prompt；删除公开rawShape噪声，仅更换私有raw/canonical捕获前缀，wx/0600保留。runner改用新重建request与另名新bundle，旧helper保留；原隔离wrapper、bootstrap root匹配、固定text role、授权/快照、只读usage、拒绝业务数据库/模型元数据写入、state hash及normal quit0门未变。两份私有源脚本权限600，runner独立`node --check` exit0。审核者没有执行runner或模型调用。

该单包准入无阻塞，但须按最新stageRequests重新规划完整fragment metadata预算，不能强塞原94单位或称旧payload同hash。主代理另行报告的重建包/新bundle身份属于其执行证据，本审核未读取私有request内容。实际探针仍须通过原完整门；索引编码不证明地点语义正确，不能以单包或合成成功替代fresh全文、全部场景、作者处理、发布及重开验收。
