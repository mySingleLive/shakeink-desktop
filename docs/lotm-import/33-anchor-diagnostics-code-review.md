# 连续证据失败诊断独立代码审核

日期：2026-10-28。结论：**通过，未发现本次变更范围内需要修订的阻断问题。**

审核限定为 `desktop/service/novel-import-ai.ts` 的诊断增量和新增 `tests/unit/novel-import-anchor-diagnostics.test.ts`，以26方案和27补充复审为标准；只为确认生成候选语义、必要定向回归而只读相关既有生成器和 E01/E04 测试。没有展开其它既有修改，没有读取真实小说、journal、配置、Key或响应，没有操作真实应用、UI、模型、DB、运行进程或构建。本次会话未提供 CodeGraph 工具，因此使用指定文件的直接只读内容和原字节 diff 审核，未用 grep 重建符号关系。

## 源码边界

以指定 B4 原 service 字节备份直接比较，独立确认 SHA256：

- 变更前：`7229da8f8841317ba46d393914943aacbf1f99ad93449cf84501ecd8f3bd169e`
- 变更后：`ab7956120d2269a3db3d280d6beb66703aec438e36143a3351caf16e9dd61e0d`
- 新测试：`2d8f81c064523f0f6d967bc234340b8189063fbec1f8a9d8cb8f9ecbae7766fe`

增量仅增加本地诊断函数、最终失败候选的有界暂存/清空和原 catch 分支中的一次报告。接纳器、schema 的接纳条件、生成器、重试次数、请求/预算、RPC、错误协议、控制器白名单均未修改。未增加回写或模型请求。

## 核验结果

- `novel-import-ai.ts:64` 要求精确诊断开关和非空绝对测试根同时成立。`119–144` 沿用 ordinary semantic analyze、非 reconcile、未取消、最终 `StructuredGenerationError/invalid_schema` 和完整四类精确 custom evidence issues 的边界。每次 schema preprocess 和新生成均清空候选；结构 abort、混合 issues、下一轮 invalid JSON/不完整/网络错误不继承诊断。schema 回调只保存前100条原引用，不检索、不输出；最终 catch 才调用报告。成功和取消均无诊断。
- `66–108` 只构造冻结的12个键、固定目标枚举和有界整数；完整 issue 数及截断数饱和至1000，检查最多100条。最终整行 UTF8 长度再次限制为768字节，最多调用一次 logger。原文、quote、ID、文件/实体名字、路径、配置、动态字段/自由错误消息及 hash 没有进入 record。
- `74–99` 只对 unknown-unit/no-match 做原样检索。其它单元统计按位置，重叠命中亦计数，达到两个后饱和；所有待检查单元都完成预算检查后才可能报告唯一。没有唯一其它单元时才检查相邻接缝，次级结果互斥。too-short/ambiguous 保留未分类，诊断未被用来修复、重定向或接纳证据。
- 相邻要求原数组相邻、同 fileId、非负安全整数 start/end、`end-start===text.length` 和左 end 等于右 start。只拼能跨缝的两侧 suffix/prefix，命中须真正 straddle；不同来源、gap/overlap、倒序、长度不符、三单元拼接不能借此算相邻唯一。长度/offset 全部使用 JS UTF16，未转换为 code point。
- 每 quote 上限2000 UTF16，每次桥接共享2,000,000的附加字符串检索预算。单元扫描在检索前按全文长度计费，边界只按有界 suffix/prefix 拼接长度计费；预算不足立即返回截断/未分类，已有一个命中也不能冒充唯一。测试覆盖其它单元和边界尚未完整扫描的反例以及多 issue 共享预算。
- 诊断、编码、logger 异常都被局部 catch 吞掉。原分支仍执行既有 message 改写并 `throw error`，保持启用前同一异常实例及 kind/invalidFields/feedback；未把候选或诊断内容附着到异常或结果。开启前后字段对照和注入原异常的身份由合成用例验证，内部最终 catch 的同实例由原样 `throw error` 源码核对。
- 新测试只使用既有 generateText 注入，env/logger/临时内建函数替换均 finally 恢复。工厂复制模型配置，避免秘密样本污染其它 fixture；动态秘密、结构混合和编码/检索/logger 故障反例均未产生原值输出。未新增生产测试接口。

## 独立执行证据

使用 `/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node`（v24.18.0），两组分别执行，未合并计数：

| 命令（均 `--import tsx --test --test-concurrency=1`） | 退出码 | tests | pass | fail | skipped |
| --- | --- | --- | --- | --- | --- |
| `tests/unit/novel-import-anchor-diagnostics.test.ts` | 0 | 59 | 59 | 0 | 0 |
| `--test-name-pattern='LOTM-E0[14]:' tests/unit/novel-import-evidence-batches.test.ts` | 0 | 22 | 22 | 0 | 0 |

第二组的 E02/E03/E05/E06 四个顶层用例未匹配，本次 Node 24 runner 未将它们计入 tests/skipped；因此没有照抄作者报告的26 tests/4 skip，也没有声称运行了这四组。独立日志和含准确命令、退出码、源码身份的索引见 [independent-review/results.json](evidence/anchor-diagnostics/independent-review/results.json)、[diag.log](evidence/anchor-diagnostics/independent-review/diag.log)、[e01-e04.log](evidence/anchor-diagnostics/independent-review/e01-e04.log)。未跑全仓测试、全仓TS或构建；作者定向TS记录是作者证据，本独审未重复执行或冒称独立通过。

本结论只证明本次最小安全诊断符合已批准边界及上述合成用例/必要回归通过，不证明首叶语义问题已修复，不抵扣真实整书导入。当前源已不同于 B4，不能将仍运行的 B4 当作此源码的最终构建或验收；后续由主代理按授权处理 B5 构建、显式双门和真实复测。
