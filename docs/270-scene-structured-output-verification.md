# 场景结构化输出修复与全文验收

日期：2026-10-31。当前为实施中记录；真实全场景导入、保存与重开尚未通过，不以局部成功代替整书结果。

用户已明确允许使用当前 DeepSeek 接口发送本次隔离测试所需小说片段及提取资料。R12在976候选中完成810项后身份/父级失败；R13的1014候选中检测到两节点父级循环；增加有据上级纠错后，R14的1038候选中完成315项后资料字段格式失败。三轮均未跳过失败项、未发布，均正常退出。完整现场只在私有隔离目录。

针对失败分别完成了静态关系反馈、上级循环有据纠错、13字段严格校验及完整固定字段说明。原失败目标的只读复测仍出现字段集合失败，故按[268方案](268-scene-structured-output-plan.md)和[269用例](269-scene-structured-output-cases.md)接入限定模型/阶段的服务器结构化输出，继续保留canonical最终全部校验。

首轮5项RED及扩展预算/有限重试/最终授权门RED已记录。独审另发现非目标目录身份元数据覆盖、显式review角色使用text模型预算两处问题，分别补RED并修复：同ID四身份字段精确一致才合并；能力与预算复用实际role对应pin，缺pin固定失败。普通source-copy仍先继承可信目录；context-only首次插入保留。最终[271独立代码审核](271-scene-structured-output-code-review.md)通过，无遗留阻塞。

| 本地检查 | 结果 |
| --- | --- |
| 首次宽定向组 | 357/358通过；唯一失败是旧测试对源码文字`schema,resolvedModel`的断言。改为AST确认实际generateJSON参数含schema与resolvedModel，保留原运行时验证，未修改产品迎合文字串。 |
| 最终受影响定向组 | **289/289通过，0失败**；包括全部scene、structured、AI/schema、语义、角色兼容、模型授权与发布相关组。已通过且源码未再改的长wizard-session组不无谓重跑；不累计重复用例为新数量。 |
| 结构化专项 | 最终SO-01—09含两个SO-07分支，10/10；独审独跑10/10。实际SDK验证json_schema strict、reasoning none、store false及同授权网关。 |
| TypeScript noEmit/incremental false | 通过 |
| 桌面构建 | 通过；只有既有MODULE_TYPELESS_PACKAGE_JSON提示 |
| 两个验收脚本语法、git diff --check | 通过 |
| 全仓测试 | 未运行 |

完整wire纯合成实际探针、失败目标只读复测及新的全文全选导入依顺序执行。单字段能力探针及历史局部用例不能认证新协议或整书成功。运行构建身份见[13项源/产物hash](scene-import-verification/build-identity-r15.json)，与真实运行后再次比对。

## 实际接口验证

完整wire纯合成探针已通过真实当前DeepSeek接口：`/responses`、同modelID、json_schema strict、reasoning none、store false，确认父级和输入保持，恢复两条证据；配置hash不变、Electron正常exit0。证据：[完整探针](scene-import-verification/full-structured-probe.json)。

R14原失败目标在本构建下三次独立只读请求全部成功，每次一项资料，配置hash不变、Electron正常exit0；不保存模型响应或原文到公开记录。证据：[三次只读复测](scene-import-verification/r14-target-after-structured.json)。这不是整书验收。

R15新会话已完成原件全部1402章/5589单元识别，默认全选982场景全部done，资料ID/任务/候选一致、0失败/跳过/丢弃/映射警告，场景阶段245730.637833ms（约4分6秒，达七分钟要求）。但后置verify首个review请求约303秒后因`no-match`证据定位失败，driver exit2、Electron exit0，未发布或重开。不能将该场景阶段通过称为完整流程通过。[场景阶段证据](scene-import-verification/r15-scenes-completed.json)、[后置复核失败](scene-import-verification/r15-review-incomplete.json)。

当前继续按[272复核证据方案](272-scene-review-anchor-plan.md)/[273用例](273-scene-review-anchor-cases.md)修复：把同一末端定位谓词前置到已有两生成纠错桥，不放宽证据、不绕过复核，再以新构建、新会话完成全部验收。
