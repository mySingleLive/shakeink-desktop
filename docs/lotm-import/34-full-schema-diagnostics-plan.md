# B5未分类结构失败的完整schema安全诊断方案/用例

日期：2026-10-28。状态：待独审，未实施。B5真实首包于20:14:37Z前失败、rev118，错误只列前6条artifacts.N.evidence.M路径，覆盖仍198/5587、大纲56项。现有纯证据诊断0条，控制器未二分：不能据前6条推断完整issues全部是纯证据，也不能仅凭0条就认定是混合错误。保留原失败快照、禁止盲目重试/放宽校验。

## 问题与最小方案

原generateJSON将issues显示为前6条；原本地base.check在类型abort时不执行。需要只读观察**实际最终safeParse结果的全部issues元数据**，不能重新验证、重排/删问题或修改返回对象、schema、接纳器、模型、预算、RPC、正文、分块、错误类型/字段/message/feedback。

候选实现限desktop/service/novel-import-ai.ts、新专用定向测试及实施记录：在generateImportAiJson本次局部schema实例上包一层safeParse透明观察（先绑定原方法、每次只调用1次，原样返回同一结果/错误对象，不改全局Zod原型），只在新显式开关与隔离根同时成立且ordinary语义analyze时启用。不得用base.check追加问题/强行执行失效hook、代理替换成另一种校验器、重复parse或修改generic生成器。具体Zod方法与TS签名需独审确认，若不可透明实现应先报告。

每次safeParse前清空候选；成功后无候选，失败后只汇总前100条code/安全字段分类，不保存原value/message/path/quote/id。重新generate前亦清空，候选必须来自最终输出最后实际解析结果。未知code/path仅计other；已有纯证据bridge分类仍独立、完整、原样保留。类型abort也必须可观测。

## 冻结安全门与输出

- 两门：`SHAKEINK_IMPORT_SCHEMA_DIAGNOSTICS=1`及非空绝对`SHAKEINK_TEST_ROOT`。默认/仅一门/relative根不输出；不改变现有ANCHOR开关语义。
- 最终catch、未取消、ordinary semanticVersion1 analyze非reconcile、StructuredGenerationError.kind=invalid_schema，且**未走现有纯证据分支**才最多输出一条。pure仍只由旧ANCHOR诊断处理；两个flag同时启用时合计最多一条，不能重复。invalid_json/incomplete/network/取消/后续成功均无此日志。
- 前缀`[novel-import-schema-diagnostics] `；顶层严格键`version:1,kind:<ImportTarget>,issues,inspected,truncated,knownEvidence,fields,codes`。fields固定键`artifacts,id,kind,name,text,facts,evidence,sourceUnitIds,origin,notFound,other`；codes固定键`invalid_type,invalid_value,too_small,too_big,unrecognized_keys,custom,other`。其余全部0..1000安全整数，饱和计数；总issues为完整.length饱和值，最多观察100条，剩余truncated（饱和），不外推未观察字段。整行UTF8<=768bytes（包含换行前缀），过限不输出。
- fields：合法artifacts数组项路径第3段命中固定字段才计对应；顶层artifacts/notFound计相应，其余other。不将动态path字符串用作输出键。codes只固定字典，不打印错误message、values、keys数组、path、quote、unitId、实体名/ID、hash、root、配置或Key。knownEvidence只数完整4段custom且message精确匹配既有四条固定证据反馈。
- 附加工作最多100个issue、每个路径最多读固定前4个位置/code并对固定字典判断，无原文检索/编码/额外模型请求；不遍历任意深层path或unknown keys。诊断/观察/编码/logger出错都吞掉，原方法抛错原样透传，不能替换原校验异常。

## 本轮必要用例（不跑全仓）

| ID | 条件 | 必须满足 |
|---|---|---|
| LOTM-SDIAG01 | 两门组合/legacy/review/classify/reconcile/成功/取消/网络/invalid_json/incomplete | 无新增日志；既有结果/调用次数/错误不变 |
| LOTM-SDIAG02 | 前6纯证据+第7facts值非string/type abort；非证据origin/kind/unknown keys；纯证据 | 完整失败总数/前100固定桶准确，abort可见；未classified纯证据才新日志；两个开关同时合计最多1行，纯证据仍旧行且白名单不扩大 |
| LOTM-SDIAG03 | 多候选parse、首轮纯/混合失败后次轮成功/其它错误 | 每次parse/gen清空，无陈旧归因；透明safeParse原样单次调用 |
| LOTM-SDIAG04 | 大量问题/秘密样本分别藏动态字段名、message、路径/quote/id/配置；logger/观察故障 | 仅固定键/枚举/整数、100上限/饱和、768bytes；零原值/秘密；原错误/结果与safeParse调用数保持 |
| LOTM-SDIAG05 | 真实bridge及既有DIAG01..05/E01/E04 | 纯证据59项不退化、错误身份/反馈/二分/预算/阶段保持；无接纳、无新增coverage/请求 |

先独审方案/用例→实际RED→最小实现→独立code review→定向验证。作者不得读真实小说/journal/配置/响应，不操作app/进程/网络/DB/构建；只可读B5静态build身份与当前service源并先核SHA备份。主代理负责正常退出B5、B6 desktop构建（保留已验证UI）、双诊断flag隔离启用、同一完整会话/源/八目标重试以取得真实固定计数，再据实际分类制定最小业务修复。

诊断GREEN仅证明安全可见性，不消除本次B5结构FAIL、25或DREAM-*问题，更不能计作完整导入通过。
