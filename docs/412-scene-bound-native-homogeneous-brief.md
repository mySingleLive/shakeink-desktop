# 条件方案：bound Native 使用同质 items

状态：仅准备方案，尚未实现。R50 尚未执行或尚无符合以下条件的结果时，不准入产品 TDD，也不将 tuple 作为已证根因。

## 唯一启动条件

须由 411 记录本次 R50：A 为当前工厂完整两任务 schema，HTTP400；B 仅把同节点 items 改成同质对象并删 additionalItems，HTTP 成功且完整 SDK/直接 JSON/共同合法答案与本地校验成功。两例实际 wire schema/input 与预定 SHA 一致、原授权/每例一次及全局两次 fetch/无重试/只读状态/安全投影/正常关闭等 408–410 保护门全部成立。缺任一项则不实施本方案，记录不支持或证据不足；不追加猜测性产品改动。

此对照只支持本次 items 编码兼容差异，不保证供应商遵守任意 schema，不追认 R49 原错误正文。

## 最小产品改动

只改 `desktop/service/novel-import-scene-roster-bound-decisions.ts` 的 `sceneRosterBoundNativeSchema` 内 schema 构造，签名和调用不变。先按原 task 顺序生成每个位置的原 schema，再按递归对象键排序、数组顺序不变的 JSON 结构键做**精确去重**，保留首次顺序，不做合并、放宽范围或取首 N。

- 无 task：仍只是不可发送的原占位，answers 的 minItems/maxItems 均为 0，items 为 `{}`；仅空 answers 合法，不因该占位新增网络调用。
- 去重后一个 schema：items 直接为该原 schema。
- 两个以上：items 为 `{anyOf:[全部不同的原 schema]}`。删除同一 answers 节点的 additionalItems；不再生成 tuple items 数组。

answers 的原精确任务数量、definitions/$ref、replacement 三个严格分支、字符串和数组上限、所有原 0 资格分支及其他字段均保持。去重只能删除结构完全相同的副本，不能删不同 maximum、不同 0 资格或任何 replacement 分支。

这是 **advisory schema**：同质 union 可能允许某位置使用另一位置的值。原 private deck 的逐位置 decode 必须继续独立检查类型、局部选项上界、是否可 0、完整 replacement，并经过全部既有 source/canonical/retention/owner/引用/版本/权限/提交门。不能凭 Native/Ajv 通过直接采用答案，也不自动挪位、改成 0、选首或修正答案。显式旧 repairs 兼容入口和 mixed-root 拒绝不变。

不改 prompt、task/choice 控制表、源窗口、Native scope/模型/端点、输出 cap、四代/非 stop/取消边界或任何预算常量。实际修改后的 schema 字节继续走原 planner/worker 共用预算；没有预算豁免。

## 顺序与验收

412 独审通过 → 413 用例独审通过 → 确认上述 R50 条件 → 真实功能 RED → 最小 GREEN → 414 独立代码审核。主代理再跑受影响组、类型/构建及完整真实目标系统验收。

必须重算现有 130 首轮及 R46 全 77/R47 全 59（合计 136）历史材料的**新 schema/新 prompt**完整预算；不得沿用旧输入 SHA 冒称相同。可另用 R49 已捕获的 32 代补测容量，但不称新的供应商行为。所有事实/来源/保留门和现有容量均不改。历史预算或静态对照通过均不是全文导入、发布、重开通过。
