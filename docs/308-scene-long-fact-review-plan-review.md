# 场景原生长文本事实复核方案独立审核

2026-10-31。审核者：独立子代理`structured_generation`。本轮未参与308方案编写或对应产品实现。核对308、当前`novel-import-review-tasks.ts`、预算几何、原scene v2字段表及controller的`reviewFactPackets`/`requestFits`路径；未读取真实小说、私有journal/响应或配置，未调用provider，未运行产品或测试。

**方案通过，无设计阻塞，可继续309用例独审及RED。** 这是对四个原生自由文本事实的后置尺寸合同修复，范围足够明确。R23实际计数及27529字段长度来自主代理，本审核未独立重放该真实运行，不据此认证完整导入通过。

- 当前iterator对全部facts套用`field.length+value.length>pieceCharacters`门，而pieceCharacters为原冻结profile的五分之一，1M profile下是16384。schema2场景四个原生文本字段的字符串合同没有这个上限。允许这四项保留完整原子值进入原预算组包，符合原业务资料合同；不需要切事实或引入新range协议。
- 实施判定必须同时满足精确kind=scene、schema=2和四个字面量白名单。不得按字段后缀、包含backstory、全部v2字段、origin或任何字符串类型扩大范围。其它类型/字段/schema维持原guard及错误；artifact.text的连续分片和证据分组不改。
- 共享常量可以引用到原v2字段表，但必须保留四项内容和顺序。iterator继续按原Object.entries和piece顺序推入完整facts值，原key/index/semanticHash计算不改。旧合法任务的keys与geometry不应因去重常量发生变化；以前被完整拒绝的长字段不能获得虚构成功credit。
- 原controller仍以完整单位、JSON、payload、投影及实际review角色的冻结profile决定能否发送。尺寸例外不等于请求预算例外；真正过大的原子字段继续在原完整packet fits门失败，不裁值、不换模型、不扩额度或heap，也不放宽生成/原生字段schema。
- 保留原body/facts屏障、review wave与原子保存、来源/授权/取消、完整coverage和发布冲突门。iterator可枚举不等于已复核；必须实际发送所有合法任务并以原完整taskKeys核对成功credit。

304/305响应性方案与306/307来源版本方案均不并入本改动。当前R23已由主代理确认正常退出后，方可按TDD继续；后续普通新构建与真实全流程验收另记，不能把合成发布mock、旧轮场景/正文阶段通过或本审核当作发布及重开通过。
