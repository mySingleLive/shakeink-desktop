# 连续证据失败诊断实施记录

日期：2026-10-28。按26方案及27补充复审实施；作者定向验证完成，待独立代码审核。合成诊断通过不代表真实整书导入通过，也不证明首叶语义问题已修复。

## 变更范围和原构建保全

生产只修改 `desktop/service/novel-import-ai.ts`；新建 `tests/unit/novel-import-anchor-diagnostics.test.ts`、本记录和 `evidence/anchor-diagnostics/`。没有修改生成器、RPC、接纳器、阶段模型、预算、白名单、main、renderer、既有测试及26/27标准。未操作应用、UI、模型、DB、构建或进程，未读取真实小说、journal、配置、Key、模型响应。

修改前已将service原字节备份到主代理指定的私有 `B4-before-anchor-diagnostics-source/desktop/service/novel-import-ai.ts`；实际assert SHA256等于静态 `build-identity-B4.json` 的同源记录：

- 修改前：`7229da8f8841317ba46d393914943aacbf1f99ad93449cf84501ecd8f3bd169e`
- 修改后：`ab7956120d2269a3db3d280d6beb66703aec438e36143a3351caf16e9dd61e0d`

原文件在Git中未跟踪，因此以真实原字节备份比较，不能以空Git diff声称无修改。可审核的源变更见 [service-change.diff](evidence/anchor-diagnostics/service-change.diff)。B4构建对应修改前源；当前checkout不能作为B4最终身份，由主代理处理暂停及B5重建。

## 实现契约

诊断必须同时具备精确开关 `SHAKEINK_IMPORT_ANCHOR_DIAGNOSTICS=1` 和非空绝对 `SHAKEINK_TEST_ROOT`。沿用原ordinary语义analyze、非reconcile、未取消、最终 `StructuredGenerationError/invalid_schema` 且完整issues全为四种精确custom evidence issue的既有分支。schema preprocess和每次generateText均清空本地候选；schema回调仅暂存前100条所需quote/unitId引用及reason，总issue数单独保存，不输出、不附加检索。最终失败才报告，成功/重生成成功/混合/类型abort/取消/无JSON/不完整/网络错误均无纯证据日志。

输出只用冻结prefix、12个固定键、目标枚举和0..1000整数，UTF8不超过768bytes。`issues`是完整问题数饱和值，`inspected`最多100；主原因、互斥次级分类统计被检查的条目，其余计入`truncated`。超长quote或预算不足的被检查条目同时计入`unclassified`和`truncated`。无原文、quote、任何ID/名字、配置、自由消息、hash或root字段。

次级分类仅对unknown-unit/no-match做literal检索，优先完整检索后的唯一其它单元位置，否则再检查合法连续相邻二单元真正straddle的位置；同一单元重复、多个单元重复、多个cross均不能报对应唯一类别。其它两种原因直接未分类。几何使用同fileId、非负safe整数start/end、end-start等于JS UTF16 text.length、左end等于右start；不允许任意跨三单元。quote上限2000 UTF16，每次桥接共享最多2,000,000 UTF16字符串搜索预算，完整单元按text.length计费，边界只扫描足以跨缝的suffix/prefix并按拼接长度计费。未完成的检索不报unique。

原错误分支仍只执行既有message改写并 `throw error`；诊断不改kind、invalidFields、feedback、请求、返回值或接纳结果。检索、编码、logger自身失败均本地吞掉。没有新增生产测试注入接口；测试仅使用原有generateText依赖注入，串行捕获console.warn/env并finally恢复。

## TDD与定向验证

全部原日志和结果索引在 [results.json](evidence/anchor-diagnostics/results.json)，保留失败而未覆写。执行测试命令：

```sh
node --import tsx --test --test-concurrency=1 tests/unit/novel-import-anchor-diagnostics.test.ts
node --import tsx --test --test-concurrency=1 --test-name-pattern='LOTM-E0[14]:' tests/unit/novel-import-evidence-batches.test.ts
```

- 初始真实RED：51 tests，22 pass/29 fail，exit 1。清理一个未实际执行断言的多候选成功测试，改成真实失败fenced primitive→有效对象候选后，最终RED为50 tests，21 pass/29 fail，exit 1；此时生产尚未修改。
- 最小实现第一次GREEN：50/50，exit 0。
- 补充真值缺省、三单元、预算临界、UTF16上限、扫描时机和JSON编码失败反例后，中间两次58 tests均56 pass/2 fail、exit 1（含父test失败）：先是三单元fixture声明来源缺失导致混合schema无诊断，修正后又发现默认来源意外含待检索字串。最终使用独立合成来源修正fixture，未因此修改生产规则；随后58/58、exit 0。
- 再补充“其它单元扫描完整但跨界扫描预算不足仍不得报unique”，随后将request工厂的合成model改成每次复制，避免secret反例污染其它测试fixture；最终交付 **59/59，exit 0**：[green-isolated-fixtures.log](evidence/anchor-diagnostics/green-isolated-fixtures.log)。
- 既有E01/E04：22 pass、4未选中skip、0 fail，exit 0：[e01-e04.log](evidence/anchor-diagnostics/e01-e04.log)。覆盖真实生成边界的两次生成上限、严格证据错误及RPC、二分白名单、无接纳/coverage及中止分支。
- 首次定向tsc CLI漏仓库路径别名并揭示测试unknown未收窄，exit 2，原日志保留。补测试instanceof收窄，使用继承仓库tsconfig、限定files/include且带既有 `desktop/shared/word-extractor.d.ts` 的配置；最终两次exit 0。实际命令为 `node node_modules/typescript/bin/tsc --project /private/tmp/shakeink-anchor-diagnostics-tsconfig.json --noEmit`，该临时配置原样留档 [targeted-tsconfig.json](evidence/anchor-diagnostics/targeted-tsconfig.json)。无全仓测试/全仓TS/构建。

DIAG01..05覆盖双门真值、成功/重生成/多候选、四原因、唯一位置与重复位置、非法几何/UTF16/三单元、secret与固定键/长度、混合第七条/类型abort、取消/新轮清空、100 issue及1000饱和、quote和共享扫描预算、检索/编码/logger故障、原有注入错误同实例及真实service拒绝边界。启用前后同类错误message/kind/invalidFields/feedback一致；内部最终catch同实例由源代码的同一 `throw error` 保持，未为测试增加内部错误暴露接口。

本轮真实模型调用为0。没有实际诊断模型请求，也没有实际全书验收结论；后续独审、B5构建和真实复测由主代理执行。
