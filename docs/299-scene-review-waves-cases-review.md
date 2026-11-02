# 场景复核有界并发用例独立审核

日期：2026-10-31。审核者：独立子代理 `scene_fix_review`。依据298和原review/main ai/runtime/long-task代码审核299；只写本审核及298方案审核，不改产品、测试或构建，未启动应用、调用网络或读取真实资料。

## 结论

**补充后审核通过，无遗留用例设计阻塞。** RW01—04现覆盖并发上限、逆序返回、阶段屏障、部分成功、迟到取消、真正提交时失效、原子保存、精确范围和thinking保真；可进入RED。下面列出初审补强及实施时应保持的实际断言，不能用测试标题代替执行。

## 已补充并确认的关键反例

1. **RW02覆盖facts部分失败再补前位空洞。** 已加入facts中间失败、后位成功、重试补前位并断言最终`reviewFacts`严格等于原任务全序。实际夹具需至少三个facts包，断言后位成功已保存、失败包无credit及成功包零重发；正常全成功RW01本身不能捕获原`:1572`追加方式的乱序。

2. **RW02覆盖fulfilled但late validation失败。** 已明确`ai`成功后证据/`semanticMissing`末端校验失败，证明其余合法包仍按序保存、坏包无coverage、后续wave零请求；不能只用`ai`直接reject代替。facts引用门应保留并在定向回归中覆盖，数据、facts、父关系及正文仍逐值不变。

3. **RW03覆盖真正提交排队期间失效和持久化失败。** 已加入serial排队期间失效、runtime写失败、candidate保存失败无内存/磁盘新credit及post-rename阻断。实施须在所有调用settled后、取得serial提交权前受控撤权/改来源或epoch，断言失效wave不增加coverage/conflicts/missing；失败重试仍请求未提交包。取消用真实`cancelAi`及runtime pending集合证明排空，不仅计数已resolve的mock。post-rename只证明已保存但被阻断，不能错误要求磁盘从未提交。

4. **RW04证明可验证的wizard边界。** 已加入main内部`executionLane`字面量、schema限制及service标记加普通scene包双门，无标记/作者解释保持原slot。实际还需证明main只有wizard1/semantic1/目标恰好scene的普通review产生标记，非wizard、旧协议、组合/其它目标保持原行为。实测`runInsideLongTask`作用域内是否绕过共享队列，同时断言完整resolved model及providerOptions不变，防止只测谓词而实际仍受默认2名额限制，或误用light模型降thinking。

5. **正常重试不借助清冲突。** RW02已明确无初始pending conflict；可正常重试的分支也不能在失败wave制造pending conflict，否则原`runVerify()`会跳过review。RW01另验证本轮新冲突不终止pool、原对象/决定保留，verify和publish仍被真实门阻止。不能将直接调用私有review或清数组称为正常产品重试。

## 保留现有断言

RW01的第32包尚未启动、正文/facts完整逐值几何对照、原任务顺序及全部字段保真应保留。比较对象应来自原串行planner/固定期望，不能只用新helper自身生成期待值。RW03继续覆盖早成功等到wave末端失效，RW04继续覆盖模型thinking及共享聊天设置不变。最多一wave在内存的惰性消费宜由受控generator计数断言，无需墙钟或RSS阈值。

## 审核证据

只读`cat`299/298及定位源码`sed`/`rg`，补充后再次完整读取两份文档；重点依据`desktop/main/novel-import.ts:666`、`:1106`、`:1192`、`:1553`、`:1569`、`desktop/service/novel-import-ai.ts:522`、`desktop/core/novel-import-runtime-proof.ts:3`及`src/lib/long-task.ts:44`。未执行RED/GREEN、测试或构建，不声称真实系统性能、模型结果或全文复核通过。

## 首版测试草稿复核与执行限制

随后只读审核`tests/unit/novel-import-scene-review-waves.test.ts`首版及主代理执行的`/private/tmp/scene-review-waves-red.txt`，本审核者未重复执行测试。该日志报告14测试节点、1通过13失败，其中包含父级测试节点；不能等同于13个独立业务反例。RW01与RW02三个子项先在串行基线中因删除`wizardVersion`却保留`wizard`而触发journal状态校验，尚未到达各自并发/保留信用断言；RW03除runtime正控外在31请求屏障失败，后续故障断言未到达。修正夹具后须重新取得有效RED，不得通过放宽产品journal校验消除夹具错误。

首版的facts恢复直接调用私有controller `review()`，应记为受控controller重试，不能记为普通UI重试、journal重启恢复或真实用户流程通过。普通未发布journal恢复仍受既有产品生命周期约束，本方案没有新增恢复能力。

已向主代理报告需补实的断言：成功body单位与成功facts包的精确credit、facts成功包零重发；末尾body保持在途时facts零启动；真实pause/cancelAi及runtime排空；main非wizard/旧协议/组合目标不产生lane标记。首版post-rename以全局`owner()`第三次调用判定时点，会受同时运行的runtime journal写入干扰，须改为精确在candidate `save()`的`onCommit`成功回调后注入，再验证`candidateBlocked`。这些是测试实现审核反馈，不改变以上已批准用例设计，也不预先认定尚未运行的断言通过。
