# 场景关联校验纠错独立代码审核

日期：2026-10-31。审核者：独立子代理 `scene_fix_review`。范围：259补充实施、`desktop/shared/novel-import-scene-links.ts`、service/main本轮关联反馈增量及新增SL用例。未读取小说原文、私有journal、配置或Key，未调用模型，未修改产品或测试。

## 结论

**实施通过独立代码审核，未发现阻塞问题，可按既有授权继续正确应用身份下的新session全文验收。** 本审核实际在Node v24.18.0执行SL文件，**6/6通过，0失败/取消/跳过**，约9.27秒。合成测试和本审核不能认证R13整书或性能成绩。

## 实现核对

- `validateSemanticLinks` 继续使用原catalog构建顺序、`fromArtifact`、`typed`、目标身份比较、父级/循环和锁定字段校验。没有另建裁剪目录用于接受判断。三个引用仍先执行原 `typed`；只有其原固定异常、单scene entity、本次目标ID同时满足时，才抛带固定field枚举的内部 `SceneLinkValidationError`，原Error.message保留。合法完整entities、上下文artifact和自引用的成功集合保持。
- parent分类位于原身份冲突已成立的分支内，额外要求替换本次scene目标、原catalog父级等于可信目标确认值、结果父级确实不同。目录内另一个合法PLACE、外部父级、根目标新增父级均继续拒绝；未证实parent错配的身份异常保留原通用错误。错误entityType、原生字段、证据、循环及锁定字段的原门没有放宽。
- 生成桥仅在原校验拒绝后，将内部固定field映射为 `artifacts.0.facts.<固定字段>` 和共享静态说明。最终公开分类同时匹配最终 `StructuredGenerationError` 的完整已知路径及相应说明；未新增跨生成保留的引用失败标志，最后一轮其它关联/结构/网络/取消错误不会继承前轮标签。
- 共享模块只含四项静态label/guidance，不插入ID、名称、原文、模型值或未知键。controller通过完整错误消息相等匹配返回相同静态guidance，第二请求保留具体字段和目录类型说明；额外后缀和未知类别不获得重试。原第二请求仍在catch之外，最多2请求/4生成；权限、网络、取消、预算、持久化的重试边界未扩大。
- 本轮分类谓词均限定semantic/analyze/entity/scene。角色、普通scene分析、item/world及review/reconcile未获得新分类；其中普通scene负例由SL实际执行，其余范围由本次精确谓词/差分审核核对，不把未运行的各阶段用例计作通过。

“场景身份与上级关系”仍是既有通用类别，单凭最终该标签仍不能推断具体坏parent；只有本轮生成桥的固定路径/说明才证明已确认的字段原因。R12错误不得据此追溯认定为某一具体引用或父级值。

## 实际验证与证据来源

独立执行：

`/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test tests/unit/novel-import-scene-links.test.ts`

6项均通过。SL-01/02的9组独立输入覆盖三个引用各自不存在ID/错kind、目录内错误父级/外部父级/根新增父级；成功结果完整等于合法资料，持续非法两次生成后拒绝并保留固定字段诊断。SL-03/04实际controller→service→生成桥分别精确2请求/3生成恢复、2请求/4生成失败，持续失败没有同目标伪成功artifact或skip。SL-05覆盖provider payload外的完整目录条目、仅上下文artifact提供的合法地点及自引用、request不变，最后轮次不同关联/其它结构/网络/取消分类隔离。SL-05b证明未知/后缀静态标签每目标仍只有一次请求。

已读取公开RED日志 `scene-import-verification/link-correction-red.txt`：初始5项中1通过、4失败，与缺少精确字段/外层指导的预期一致；没有把后来补充的第6项追记为初始RED。已核对主代理公开定向GREEN日志 `link-correction-scoped-green.txt` 最终汇总为50/50、fail/cancelled/skipped/todo均0。本审核未重复执行该50项整组，且SL6包含于其中，不能相加成为56项。

主代理报告本轮tsc及desktop build均exit0，构建仍有既有MODULE_TYPELESS警告；本审核未重复构建。独立执行 `git diff --check`，exit0。未运行全仓测试。

审核提出的非阻塞测试补强已落实：SL-03/04第二请求改为明确断言包含“sceneId必须使用可信实体目录中kind为scene的id”，替换原 `sceneId` / “场景”宽泛断言。已只读核对该修订，产品代码未变；主代理正在复跑修订后的SL6项。本审核上述实际6/6命令记录对应补强前的同一产品实现，不将其冒充为已独立执行修订后断言。

真实全文验收仍要求新session、正确LotmVerification应用身份、全1402章、全文覆盖和默认全部本轮场景；最终未过滤任务/候选/资料ID及确认父级逐项相等、零失败跳过丢弃映射警告、源/正文完整、正常发布退出及重开逐字段/逐章一致。R12的810项部分完成和1项失败仍保留未通过结论，不以本次局部纠错成功替代整书验收。
