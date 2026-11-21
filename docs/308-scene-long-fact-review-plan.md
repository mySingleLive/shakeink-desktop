# 场景原生长文本事实的完整复核方案

2026-10-31。只处理R23已明确阻断完整复核的字段尺寸门；304/305准备阶段响应性方案暂缓，不合并其pause/barrier设计。本文件待独立审核，当前不编辑产品/测试、不构建、启动App或调用模型。

## 证据与原因

主代理报告R23真实结果：924场景全部成功，全部5589正文工作单元已复核，reviewFacts为0；返回verify且state为failed，stepError精确为“模型结构事实超过复核分片预算，请细分设定后重试”。场景facts最长值27529个UTF-16 code units；原冻结1M审核profile的characters为81920、pieceCharacters为16384。当前完整流程尚未通过，不把场景完成或正文复核完成写成发布成功。本方案作者未读取真实小说、私有journal或模型响应，以上运行数据来自主代理。

`desktop/core/novel-import-review-tasks.ts`当前对每个fact均以field.length+value.length超过pieceCharacters拒绝。pieceCharacters原用于artifact.text的连续切片尺寸，原结构facts保持单字段原子值；schema2场景新增exteriorDescription、interiorDescription、backstory、entryMethod四个原生自由文本字段，其原合同为字符串，未设此16K上限。因此已被原生成/原生字段门接受的合法值，仍会在全事实复核入口不可完成。这是可确定的后置合同不一致，修复不需要猜测模型输出或扩大额度。

## 最小范围与资料保留

仅artifact.kind严格为scene、artifact.schema严格为2、field精确属于上述四字段时，免除单一pieceCharacters事实尺寸门。仍将整个原字符串作为一个原子fact放入原piece：不切字符串、不trim、改字、删字段、搬到text或造factRange，不替换artifact。每个原evidence batch仍取得该完整字段值，投影fields/fullFactKeys、完整semanticHash、来源证据及原任务key/index算法保持。

建议在`desktop/shared/novel-import-scene-links.ts`增加只含四个字面量的readonly共享常量，review任务显式使用kind/schema/白名单双门。为避免两份字段表漂移，可让现有`IMPORT_SEMANTIC_V2_FIELDS.scene`引用相同常量，表内容及原接受集合保持逐值相同；不把“全部v2字段”或任意facts字符串当成自由文本。常量不改变现有反馈或provider协议。

其它kind、同名character.backstory、旧scene/缺省schema、以及scene的coordinates、知识归属、引用/身份和任何非白名单fact，均保持原field.length+value.length门及错误。原artifact.text切片、evidence批次、预算策略版本和已合法任务几何/keys一律不变。新增可复核的长字段此前没有完整可用任务序列，不伪造旧成功credit或给未复核字段补coverage。

## 保持实际请求容量与完成门

这一例外仅从“文字切片尺寸”中区分四个原子自由文本事实，不豁免真实请求预算。原reviewFactPackets/ai仍检查完整units字符与maxUnits、units+artifacts JSON不超过2×characters、完整payload不超过3×characters，以及全部metadata、projection、固定prompt/wrapper和实际审核role绑定。原授权/来源、有限生成次数、wave上限/排空/提交、body-facts屏障及最终publish条件保持，不扩大contextWindow、输出额度或换模型。

若完整原子字段及其证据/元数据仍不能装入原合法请求，沿原“单个设定复核分片及完整元数据超过模型预算”路径明确拒绝，保留原值、已有成功credit和未完成状态；不得裁值、换大模型或把未发fact标成已复核。iterator本身不代替controller的整包预算门；审计必须继续使用原完整taskKeys及coverage核验，不能以task可枚举就断言已复核。

## 实施与验收

308方案独审→309用例独审，且当前R23正常收尾之后，才进入独立RED/最小实现/GREEN与代码审核。仅改共享字段常量及review任务尺寸判断，必要时字段表引用去重；无响应性、provider、并发、prompt、projection结构或迁移变更。

先以合成长文本证明全部四字段原值、Unicode/CRLF、任务键/几何、真实controller复核及正常wizard检查/发布mock保真；真实过大任务仍零fact出站且不publish。再跑受影响预算、review/wave/semantic/发布定向组及类型/构建。合成发布mock不是实际保存/重开验收。

R23冻结源码/产物身份与原失败记录保留，不能热补运行构建、改写原sourceHash或声称旧轮覆盖新代码。后续须用记录新构建身份的真实验证覆盖全部场景、5589工作单元、完整reviewFacts、作者冲突门及正常保存/重开。正常关闭删除的草稿不能靠私有重构注入为publication；完整流程仍未完成。
