# 场景资料字段集合独立代码审核

日期：2026-10-31。审核者：独立子代理 `scene_hierarchy_review`，未参与实现。范围为265/266及其审核、shared固定facts指导、service单场景facts输入门和strictObject、main对应外层纠错、SF合成测试。未读取小说、模型响应、私有journal、配置或Key，未调用模型；仅写本审核记录。

## 结论

**最终代码审核通过，无未解决阻塞问题。** 新门提前表达原最终已限制的scene schema2字段集合；保留原字典输入接受条件及全部最终门，不以删除字段或覆盖显式错误通过。可以继续主代理的类型/构建确认、只读目标复测及新session全文验收。本结论不是整书成功证明。

## 已核对

- `desktop/service/novel-import-ai.ts:100`复用原`z.record(string,string)`仅取safeParse成功布尔值，不输出其data或issue；随后对`importFactFields('scene',2)`全部13字段使用strictObject、可选字符串和固定错误说明。facts对象整体仍必需，无strip/coerce/trim/default。未知键（包括undefined值）不会被删掉后接受。
- 分支同时要求唯一selected目标、semantic/analyze/entity及kind=scene；普通scene、roster、sceneParents、角色及其它类别继续原逻辑。所有四个业务字段、coordinates、知识归属、三引用和控制字段均在表中，合法字符串原样保留。
- 原reliability/attribution、Unicode/原生schema2、PLACE/非空parent、完整目录及身份、引用和证据门继续执行。可信缺省元数据在parse后补全，模型显式值仍在最后并严格验证，不覆盖坏值；无父级目标不制造父级。末端授权复核没有增加新return或跳过路径。
- `desktop/shared/novel-import-scene-links.ts:2`固定指导独立实测为**220 UTF-16 code units**，13字段全部在内。SF-01检查实际第二次生成的纠错部分及最终feedback，完整说明未被250限制截断，未知键/值哨兵不进入新增反馈或公开错误。
- main仅在完整固定“场景字段格式”错误匹配时复用同一指导，未扩大前缀白名单或重试次数。SF-02实际controller→runImportAi→generateImportAiJson恢复精确2请求/3生成，持续非法精确2请求/4生成后failed，目标无伪成功artifact或skip。

## 审核发现并已修正

初版strictObject会将Date、Map、Set等非字典实例当作空对象。独立合成比较确认旧record拒绝Date，而初版完整runImportAi会在清空该对象后补PLACE并成功，违反“不放宽形状、不丢数据”约束。已报告主代理及实施代理，未自行改实现。

最终增加原record布尔门，保留旧输入类型及每值字符串的拒绝行为，同时不传播旧record可能含动态键名的诊断。SF-03补入Date、Map、Set、boxed String、自定义实例及known-field undefined反例，均继续拒绝；合法全部13字段和缺省控制元数据正例保持。此问题已解决。

## 实际执行与范围

明确运行时：`/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node`。

`node --import tsx --test tests/unit/novel-import-scene-facts.test.ts`

最终 **4/4通过，0失败、取消、跳过、todo，约5.06秒**。`git diff --check`独立通过。另独立计算指导长度220及完整13字段，结果一致；不将这些检查累计为新增正式用例。

本审核未重复主代理的其它定向回归、TypeScript或构建，未执行真实模型复测。R14固定路径不能确定具体坏键，本审核不作该推断；只读失败目标成功也不能替代随后全文、全章、全部候选、零失败/跳过/丢弃/映射警告、正常保存退出和重开逐项比较。
