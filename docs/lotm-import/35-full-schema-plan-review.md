# B5完整schema安全诊断方案独立审核

日期：2026-10-28。审核对象为34方案/用例、26/27/32/33既有诊断契约，以及当前 `desktop/service/novel-import-ai.ts`、`src/lib/ai/generate.ts` 中相关边界。为确认方法及签名，只读本地已安装 Zod 4.6.5 的声明和实现，并参照既有合成诊断测试。当前没有 CodeGraph 工具，直接读取指定文件，未初始化索引。

**结论：最小方向与局部safeParse包裹可行，有条件通过。**下列精确边界须在进入RED前落实到34或作者冻结记录及用例；无需放宽schema、改generic生成器或新增全错误fallback。本审核未实施生产代码、修改测试、运行测试/构建/真实请求，未操作UI、DB、网络或进程，未读取真实小说、journal、模型配置、Key或响应。

主代理提供的B5失败、rev118、前六路径、旧诊断0条、无二分以及198/56保留状态作为本次问题背景，未在本独审重新读取真实运行材料。前六条和旧日志缺席都不足以判断完整issues是纯证据还是混合错误；新诊断GREEN也不能消除真实结构FAIL或抵扣整书验收。

## 包裹的可行性与不可变契约

当前桥接对ordinary semantic analyze创建本次局部 `z.preprocess(..., base.check(...))` 实例。旧 `base.check` 因类型abort被跳过时，`safeParse` 仍能返回包含结构问题的失败结果；因此观察外层实际返回结果可覆盖旧hook盲区，不能通过额外check强行运行hook来替代。

本地 `node_modules/zod/v4/classic/schemas.d.ts:27` 的签名为 `safeParse(data: unknown, params?: core.ParseContext<core.$ZodIssue>): parse.ZodSafeParseResult<core.output<this>>`，不是只接收data的接口。`classic/schemas.js:140` 使用接收者 `this` 调用现有解析器，所以必须先 `schema.safeParse.bind(schema)`，再仅在该局部实例上遮蔽方法。`Parameters<typeof originalSafeParse>` / `ReturnType<typeof originalSafeParse>` 可表达参数与返回值；作者应以仓库实际定向TS检查确认推导，不用 `any`、断言伪造结果或另建验证器。

包裹顺序应是：先清空本次schema候选；原方法以原参数调用恰好一次；只读汇总其失败结果；返回原结果对象。原方法调用应在吞诊断异常的try/catch之外，或在catch中原样重抛同一异常；成功结果、失败结果和失败结果的error都不复制、不重排、不改写。不得调用新的 `safeParse`/`parse`、调用 `_zod.run`、改Zod原型、替换schema为另一验证器或改异步路径。

`core/parse.js:41` 的原safeParse只运行一次解析；失败结果的 `error` 是延迟构造且缓存的getter。观察 `.error.issues` 会提前触发一次现有生成器随后本就会读取的错误构造，重复读取返回同一error；不要为保存身份而重新构造ZodError、格式化/flatten整个错误或保存该结果对象。新增保留状态只含固定整数桶。类型abort必须由真实Zod合成输入覆盖，不能仅用手造issues声称已覆盖。

原safeParse抛错的“透传”只针对包裹边界：现有 `parseJsonOutput` 会吞掉候选的解析异常再尝试下一候选，这一既有行为必须保持，不能改成桥接直接抛该异常。其 `invalidFields` 和feedback取最后实际失败校验的前六条；新候选也只能来自当前生成的最后一次实际safeParse返回。若后一次safeParse自身抛错或观察失败，候选应为空，宁可不输出，不继承前一次计数。

## 进入RED前须冻结的补充

1. **字段分桶给出精确定义。**根路径严格等于单段 `['artifacts']` / `['notFound']` 才记对应根桶。artifact字段路径须为数组，至少三段，首段严格为 `artifacts`，第二段为非负安全整数number；第三段只允许 `id,kind,name,text,facts,evidence,sourceUnitIds,origin` 这八个真实artifact字段。其下任意更深路径仅记已知父字段桶，不遍历或输出深层内容；例如动态facts键属于facts，evidence下quote错误属于evidence。`['artifacts',0]`、字符串/负数/非整型/不安全索引、artifact下notFound、未知字段和其它根路径均为other。每条被检查issue恰好一个fields桶和一个codes桶；索引判断与旧纯证据判断一致。使用switch或自有键检查，不能使 `__proto__` / `constructor` / `toString` 命中继承属性。
2. **knownEvidence仅为有界观察值。**仍需精确custom code、路径长度严格4、两个安全number索引、固定artifacts/evidence字面量和四条固定message之一；只比较固定常量，不存或打印message。它仅统计前100条，不能据 `knownEvidence===inspected`、饱和后的issues或truncated推断全部纯证据。是否走纯证据分支仍完全由原有完整issues分类决定，不能用新计数替代。
3. **清空与异常边界。**每次新generate与每次safeParse原调用前清空新候选；只在成功完成有界汇总后整体替换候选，观察/计数异常后维持为空。现有evidenceReason与ANCHOR候选的清空及完整分类不改。最终成功、取消、网络、invalid_json、incomplete、原方法抛错或观察失败不使用旧计数。局部方法安装/启用判断的诊断故障亦不能使原请求失败；不增加全局状态或生产测试注入接口。
4. **最终报告位置。**在现有纯证据分支之后、角色结构错误既有转换之前，检查ordinary、未取消、原StructuredGenerationError/invalid_schema和新双门后最多报告一次。纯证据即使只打开SCHEMA也不能输出新prefix；两个flag均开时，纯证据至多旧prefix一条，非纯分支至多新prefix一条。角色现有Error转换保持，不应为满足“同一错误”口号而移除；开启前后的错误行为应以当前桥接为基准。
5. **预算与输出字节。**`issues=min(1000,完整issues.length)`；`inspected=min(100,完整issues.length)`；`truncated=min(1000,完整issues.length-inspected)`，其余固定桶仅计实际检查条目并饱和至1000。不能先slice/映射全部issues、递归遍历path或展开unrecognized_keys的keys。路径只读长度及前四位置；code与message仅固定枚举/常量比较，不检索原文，不输出原始值。严格键集合、ImportTarget枚举及安全整数必须在真实输出断言中验证；新prefix加JSON及实际换行的总UTF8字节不超过768，过限不报告。无需改变旧ANCHOR的实现或字节判定来实施本轮。

## 必需的定向TDD断言

34的SDIAG01..05可以承载本次范围，建议保留原ID并将以下反例具体化。先实际RED，再最小实现、独立code review和必要定向验证；本审核没有执行结果。

| 用例 | 补全后的必要断言 |
| --- | --- |
| SDIAG01 | SCHEMA与绝对隔离root的缺省、仅一门、空值、非精确flag、相对/空白root组合；legacy/review/classify/reconcile；成功、重生成成功、取消、网络、invalid_json/incomplete均无新prefix。对照开关前后请求/输出/既有错误字段及生成次数一致。 |
| SDIAG02 | 六条精确证据custom后第七条facts非string真实类型abort，完整issues总数及codes/fields均可见；另测origin/kind invalid_value、strict unknown keys及非白名单custom。纯证据×SCHEMA/ANCHOR四flag组合验证旧分支与合计最多一条，不能仅检查新日志数。 |
| SDIAG03 | 同一输出的多个有效JSON候选中前一个混合后一个不同失败、前一个失败后一个成功；下一生成成功/invalid_json/incomplete/网络/取消；后一次safeParse抛错/观察失败不得沿用旧计数。核验原方法单次调用、参数完整转发、成功/失败结果及error身份、原始throw身份；不可通过额外parse构造“对照”而掩盖重复验证。 |
| SDIAG04 | 0/1/100/101及超过1000 issues的总数、检查数、截断数；动态秘密分别置于facts键、unknown keys、message、深层path、quote、ID及合成配置。严格验证全部顶层/fields/codes键、枚举、安全整数和含换行768字节；前100条外的秘密不得被访问分类。补未知code、特殊继承名、非法索引及根/父字段分桶反例；观察/编码/byteLength/logger故障保持原行为与调用数。 |
| SDIAG05 | 真实generateImportAiJson桥接和runImportAi必要拒绝边界，失败无接纳/coverage；原DIAG01..05的59项以及E01/E04直接必要回归逐组记录实际执行结果。保持两次生成上限、旧证据message/错误协议、反馈、二分白名单、请求/预算与阶段不变。 |

透明性中可直接从最小包裹源码核验的身份/单次调用，应由独立code review明确核对；如测试需观测，不应为此扩大生产接口或改全局Zod原型。测试中的env/logger/临时故障桩均串行且finally恢复，fixture只用合成数据。

满足上述补充后可以进入本轮RED/TDD。真实固定计数仍须由主代理后续在隔离B6会话取得；本结论不授权作者读取真实运行数据、重试模型、操作当前应用或构建。
