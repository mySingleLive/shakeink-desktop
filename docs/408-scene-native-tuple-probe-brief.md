# Native items 编码兼容性：两次静态诊断

仅PRIVATE诊断，产品保持R49冻结，不重新发小说。407已证17首轮completed、13新修复轮HTTP400；同轮32实际inputSHA复原一致，但HTTP400正文当时已被主进程取消，不能据推测认定items数组是唯一原因。安装SDK保留Draft7 tuple的items数组；DeepSeek Responses文档未列schema方言，故用单变量静态对照补证，不承诺上游strict约束或全文通过。

两个例均从**当前**`sceneRosterBoundNativeSchema`构造：固定两tasks（selection有2方案、不可reject的完整replacement），choiceCount=3。A保持当前完整schema（items tuple、definitions和refs原样）。B只将`answers.items`改为`{anyOf:去重后的A.items}`并移除同一answers节点的additionalItems，其余深等，包括defs/ref、min/max、原replacement三支。结构去重需JSON对象键序无关，不取首N。共同见证为`{answers:[1,{mentions:[{literal:'合成室',evidence:{choice:1}}],context:[],links:[]}]}`，同一明确静态prompt要求该见证；两个schema先Ajv验证可满足且有本地反例，无法通过不发网。

复用已审R48同当前ModelRepository/ModelService/Gateway、真实SDK及Native工厂授权。每例直接generateText一次，`maxNetworkRetries:0`，each最终fetch硬限1、全局硬限2（下一次网络副作用前拒绝）；两例固定顺序，各一次，不补试/不循环。与正常用量差异明确为readonlyUsage，禁止配置/模型元数据/数据库写；凭据只由原vault/gateway正常内部使用，诊断不inspect/read出Key、headers或URL。root负责实际一次调用，410独审前不启动App/API。

固定新700目录/files600/wx。每例留schema/prompt/实际wire(type/strict/schema/input)SHA、实际fetch/代次计数、finish、直接JSON与Ajv结果以及必要合成reply；不返回reply到公开工具输出。A/B共同模型/输入/参数，出站校验与expected一致。HTTP失败的schema校验记not-run，不伪造输出。不把A拒/B收外推任意约束保证，也不追认历史请求；两例都是新的独立观察。

## 错误体观测仅作安全投影

最终fetch拿到原Response后立即delegate同一对象，只对non-ok启动后台clone观测，不await读取或cancel来阻塞原返回/throws。读上限64KiB、固定1000ms超时；UTF8跨块解码，达到上限/超时/读取或clone失败如实标记不完整。结束时fire-and-forget cancel并吞其拒绝，不让挂起cancel阻塞原链；stop仅等待有界诊断任务，不等待无限cancel。原业务与授权/释放仍通过原ModelService。

**任何HTTP错误正文、开放message/code/param/type/stack/header/URL/Key都不落盘**，也不整体JSON.stringify错误对象。内存中只投影：status、body状态(parsed/unparsed/truncated/timeout/read-failed/clone-failed)、knownCode（invalid_json_schema/invalid_schema/invalid_request_error/bad_request/none/other）、knownParam（text.format.schema/text.format/response_format/none/other），以及schema/items/array/object/tuple/unsupported/definitions/ref/additionalItems这9个固定关键词的布尔‘提及’值。未知串只other，不回显。关键词只说明出现过该词，不能当确定根因；截断不伪装完整。无需读Key后脱敏，因为根本不保存任意provider串。

所有settled/clone任务有界drain后关闭broker，原正常quit timeout不能被cleanup0覆盖。before/after核R49产品/bundle、helper、状态hash及activeCount=0。TDD/410独审及root冻结后，最多两次实际静态请求；保持原产品全部来源/保留/owner/四代/预算门不变。

tee执行澄清：立即delegate同一Response不等于原body.cancel零延迟。原ModelService对non-ok执行await原body.cancel，可能等待clone分支至最多1000ms诊断deadline或64KiB上限后取消；实现与真实链控制必须证明此等待有界、原cancel/transfer/close均可settle。不await clone.cancel只是observer自身不等待，不能据此声称原链不等待。原底层source.cancel若本来永不settle，须以未安装observer的baseline区分并报告原失败，不承诺observer修复它。
