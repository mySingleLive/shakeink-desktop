# 422 独立方案审核

结论：通过，当前仅准入 PRIVATE 合成诊断 TDD。产品路线是附明确实际启动条件的条件准入，尚未执行、尚未满足；候选①单独成功不准入产品。实际两次请求仍须 424 独审及主代理冻结。

审核版本：`422-scene-native-typed-union-brief.md`，最终 SHA256 `4c40ab6106374a32632f52cc376c3361a73fca49ef7507c9f91549fbd14713f3`。原字节文案已准确写为 fixed65536 字节（64KiB）/wrapper16384 字节，无常量或范围变更。

诊断范围可执行：①只在已证三个 object 分支的固定纯 anyOf 包裹节点加冗余 object 类型；②只对 items 的纯 anyOf 按关联律展开，完整保留有约束的叶、三种 replacement、范围及 0 分支。带 siblings 的节点不展开，精确去重不合并范围。相同 prompt/witness、原/两新 schema 的完整 Ajv 正反控及原对象 hash 约束了数据保留。复用 R54 的闭合投影、真实 tee 收尾和全局两 fetch 硬门，无新来源或观测机制。

条件产品范围足够小：仅既有 Native 构造函数，由同一实际 fields/record 生成完整内联、typed 叶的同质 union；调用、prompt、任务和选择表、全部材料及本地门保持。typed 单叶可直接作为 items，多叶保完整 anyOf；0-task 仍仅允许空 answers 的**不可发送占位**，不得因此新增请求。不得把受限构造扩为通用 schema 优化器。

uniform 前后等价不等于与旧 tuple 的 Native 接受集相同；跨位置组合仍须由原逐位置 decode、来源、保留、owner、0 资格、引用、版本/权限及完整 canonical 门拒绝。候选②实际成功且所有已列保护/原 tuple/witness 门通过后才可执行已审产品 TDD；失败或不确定则禁止实施，不补第三次。产品最终仍需原 CI16K、130+136 全新实际字节预算、独立代码审核及 fresh 全流程。

本审核仅文档，未运行 App/API、未读取真实小说、请求或 Key。诊断/条件方案均不是全文验收通过。
