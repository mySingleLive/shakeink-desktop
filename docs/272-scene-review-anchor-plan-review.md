# 场景复核证据定位方案独立审核

日期：2026-10-31。审核者：独立子代理 `scene_hierarchy_review`。审核272及已定位的service/schema、原定位函数和主流程review请求构造；未读取实际小说、配置、Key或私有日志，未调用模型，未参与实现。

**方案通过，可进入用例独审及RED。** 已有源码支持所述原因：`importAiResponseSchema`在非analyze阶段直接返回原base；review的missingTargets及conflicts只在`runImportAi`后部调用`anchorEvidence`。将同一失败谓词前置到现有两次生成的schema纠错入口，不需要放宽证据门或新增controller重试。

实施须保持以下边界：

- 精确限定semanticVersion=1、phase=review、selectedTargets长度为1且唯一项为scene。生产review请求没有kind，不得额外要求kind=scene而漏掉实际路径。其它协议、目标、混合目标及阶段保持既有行为。
- 对通过原base形状的conflicts和missingTargets，逐条调用原`anchorEvidence([entry], request.units)`并只取成功/失败；不可使用analyze专用的`rebindEvidence`，后者允许某些引文移到其它单元。新schema不采用定位函数返回值，不改变quote/unitId，也不修改或筛选任何证据项。
- 原末端`anchorEvidence`、`validateImportEvidence`、missing projection/范围、冲突引用、阶段及末端授权/快照/取消门全部保留。唯一排版恢复仍只在原末端按原规则进行；“不修改quote”指本次新增前置检查，不得误删既有末端恢复行为。
- 每个失败项使用固定路径和原四种原因的静态指导；不把quote、unitId、实体ID、模型原始错误或任意cause插入说明。未知结构键继续由原严格形状门拒绝；本次新增定位说明不能回显它们，也不能以修改通用base接受规则实现此修复。不要把本次承诺扩写成已全面审计其它历史错误分支。
- 原generateJSON两次生成、审核模型、思考、预算和并发不变。前置证据错误可进入已有一次纠错；网络、授权及取消不转为schema错误，不新增外层review恢复或绕过完整复核。

R15的场景阶段成功与后置复核失败必须分开记录；仅凭场景完成、一次复核恢复或局部只读成功，不能声明已完整导入。后续仍须完成实际完整复核、发布、正常退出及重开逐项/逐章验收。本审核未独立执行或认证R15真实运行结果。
