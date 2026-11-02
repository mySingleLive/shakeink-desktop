# 条件方案用例：同质 bound Native items

仅在 412 按序独审及其 R50 启动条件成立后执行产品 TDD。所有新增单元/SDK 用例先用合成数据、假最终 fetch；不提前调用真实接口，不读书或 Key。414 负责独立代码审核。

| ID | 有意义夹具 | 必须断言 |
| --- | --- | --- |
| HN01 原 schema 并集 | 当前工厂 0 task、重复同一 task schema、单种及多种 selection/replacement/可 0 分支 | 非空新结构先在旧实现真实 RED；零 task 仍仅空 answers 且不出站；单种直接 items 对象，多种 anyOf，递归无 tuple items 数组；对象键重排可去重、数组顺序不同不能去重。以原每位置 schema 的完整结构独立比对并集，保留不同 maximum/0 资格、min/max 数量及完整 definitions/$ref。不能只查 required/关键词。 |
| HN02 实际 SDK wire 正控 | selection 与完整 replacement 混合，及三个原 replacement 编码；使用与旧 tuple schema 同时合法的预定答案 | 实际 SDK → Gateway → 假最终 fetch 的 text.format 仍 json_schema/strict，实际 schema SHA 等于新工厂，无 items 数组；原 prompt/input、控制目录、模型参数、cap 与生成次数保持。新旧 schema 的同一合法答案及原最终结果深等；replacement 三分支逐字段、CF/choice 几何和原 metadata 全留。 |
| HN03 union 通过但位置不合法 | 某 selection 放合法 replacement 对象、局部选项越界但属于另一 task 上界、某位置放仅别处可用的 0 | 先证明整份答案可以过新的同质 schema，再证明真实逐位置 decode/生成桥仍严格拒绝，绝不移位或默认修正。另保留缺/多答案、负数/小数/字符串/非法 choice、不可 0、错误 replacement 类型、未知字段/own undefined、mixed answers+repairs 等原负控。显式旧 repairs 原合法/非法路径不变；无非法结果写入或发布。 |
| HN04 全后置与预算 | 原有 source、完整窗口、资料保留、owner、good-row incoming link/dangling、版本和取消；现有真实字节边界及历史材料 | 原联合后置门全部保留，不能因 Native 过而省略。实际新 schema 字节计入原固定 65536/额外 wrapper16384、实际 role、v1 +6000/未知16000 等现行门；原 CI16K、N/N±1 和预算失败零/首代次数保持。主代理 0API 重算 130 首轮+136 历史代次全部完整材料，结果不能删包/取样；可额外检查 R49 32 代。记录新 SHA、新字节和真实接受/拒绝，不冒称旧 hash 或新供应商结果。 |

去重/单项优化只减少重复 schema 表达，不可裁 task、choice、draft、current reply、keep、来源或任何合法字段；staged 完整 replacement 的既有预算回退保持原义。四代、非 stop 立即失败、网络/权限/取消不进入格式恢复、generic 默认行为沿用原回归。

若 R50 不满足 412，以上仅保留为条件草案，不启动产品实现；若实际新预算或负控失败则停止，不调高额度、不放宽门。最终完整小说导入、所有复核、发布及重开须用最终新构建另行真实验证。
