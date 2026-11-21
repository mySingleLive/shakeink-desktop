# 普通分析输出合同显式绑定唯一kind：方案与限定用例

日期：2026-10-26。待独立技术/用例审核，未编码。

## 真实依据与边界

S02新通用指导后rev76物品仍失败，错误为`模型返回结构不完整（artifacts.0.kind、artifacts.1.kind、artifacts.2.kind、artifacts.3.kind、artifacts.4.kind、artifacts.5.kind）`。独占`item-kind-schema-failure-rev76.json` SHA671648efb8e4250aac3305b905d68c8147f85a2ed36dcb149df0998980f7c3ba；12已有产物及三类cov6、原文/14章与58严格相等，无item信用。没有raw，不能断言实际值是中文、子类型、遗漏或其他原因，也未再次随机点击重试。

runtime记录phase analyze/kind item，主进程ordered循环将同一kind传stageRequests→requestSnapshot；requestSnapshot保留request.kind，serializer把kind放payload。没有发现目标在传递中丢失的证据。当前普通sem1输出合同只说“仅指定kind”，实际唯一值仅在不可信payload；固定native说明同时涉及多个类别。已有请求schema明确z.literal本次kind及origin inferred，原一次纠正也给唯一值，但初次固定输出合同没有直接写出它。

## 唯一生产变化

仅`desktop/core/novel-import-ai-payload.ts`，在semanticVersion1、phase analyze、非reconcile的输出合同中显式说明：每项artifact.kind必须逐字等于本次合法目标（以JSON字符串表达），origin固定inferred；不得翻译/缩写/改写为子类型或复用上下文其他类别，未发现仍走原notFound空数组合同。

目标只从既有IMPORT_TARGETS白名单匹配生成，不直接拼接任意request.kind，不包含unitId、原文、模型输出或自由指令。未知/缺省kind在prompt helper不新增别名/默认目标、不回显到固定段，保留原helper行为；真正runImportAi仍在模型解析前由既有factory拒绝非法目标。legacy、classify、review、patch、reconcile全部逐字不变，73指导原样保留。

不改变输出字段、schema/晚门、payload/source/单元/上下文、重试、网关、预算、模型、授权或已有信用。这里只显式表达既有约束，不新增更宽或更窄的业务语义，也不把提示强化说成真实模型已服从。

## 限定用例

仅`tests/unit/novel-import-ai.test.ts`新增NI-A08。使用真实runImportAi的DI生成接点，遍历全部12合法targets，独立断言固定输出合同恰好写出该唯一kind与origin，不含其他目标绑定；引用source/payload/role/signal及raw返回保持，notFound正常；非BMP/转义输入下原固定/JSON wrapper预算不变。普通source不被作为固定约束，非法/缺省kind不进入固定合同、不产生默认目标，既有J02继续证明零解析/零生成拒绝。

对semantic review/patch/reconcile/classify与legacy，在修改前真实基线取得独立固定hash/literal保护，不拿当前输出自证。A07继续保护73通用指导、8组旧阶段payload字节与投影/锁门。J01–03继续保护生产bridge原一次纠正和严格唯一目标/来源/证据门。

先保存真两文件基线、新A08在原生产真实RED；最小实现后GREEN并独立代码审核。仅两精确命令，不全量：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[78]:' tests/unit/novel-import-ai.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-J0[123]:' tests/unit/novel-import-request-schema.test.ts
```

必要类型及desktop build另记，无UI/worker变更不全量构建或重测。通过后同S02正常退出/新构建重开、原目录和同模型分析范围重新授权，核对12已有产物/覆盖/正文/14章/预算保持，仅从未完成物品继续。所有实际失败与文学待修永久保留，真实物品及整书效果另验；若继续失败仍定位，不增加无上限重试或投喂本书答案。
