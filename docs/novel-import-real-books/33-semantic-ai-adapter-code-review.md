# 语义 AI adapter / payload 增量独立代码审核

日期：2026-10-26（Asia/Shanghai）。审核者：独立子代理 `unified_picker_review`。

**结论：本阶段代码审核通过，无剩余必须修订项。** 五阶段非空输出权限、严格新native值/引用、bounded修订片段与完整hash责任、missingTargets及新元数据预算均有代码与指定合成用例依据。结论仅涵盖adapter/payload及纯primitive增量；main/shared/controller/publish尚未接线，不能视为21整书功能、source-only流程或真实导入/语义验收完成。

## 范围与冻结身份

对照21/24及已通过31纯helper基线，只读审核以下当前文件；未改生产或测试：

| 文件 | SHA-256 |
| --- | --- |
| `desktop/core/novel-import-semantics.ts` | `708d1c1ed623dde51a71b1b3e02dcb666ff139e47a5ad44b37dede40045cb5c8` |
| `desktop/core/novel-import-ai-payload.ts` | `9e26d2c5751550b6410b3b6d00a3e220e4b917ac7b5124fad493e25b75e76051` |
| `desktop/service/novel-import-ai.ts` | `52b17dc6e8eee386d1e49ba41891d75c47286689131ae11bf45d40b5701e70cb` |
| `tests/unit/novel-import-semantic.test.ts` | `dd7dcd873399b1f2a389206c92a370865a750366631e0c1342a64f5ba1f882fc` |

未操作应用/UI/CUA、真实模型/Key、用户数据库、原小说或真实journal。生成器依赖均为隔离合成返回，仅真实执行runImportAi解析/校验路径；“零信用”在本阶段指无成功adapter结果，实际controller checkpoint仍须后续接线验证。

## 审核判断

| 接点 | 独立判断 |
| --- | --- |
| 版本与请求模式 | 缺semanticVersion的请求不能偷偷携intent/reconcile/locks/selectedTargets；未知版本/结构拒绝。reconcile仅analyze、目标必须在所给artifacts、workingRevision相符、fragment目标唯一、长度/字段范围及锁定基础值校验。无效上下文在调用生成器之前失败 |
| 五阶段权限 | semanticSchema只是解析超集，之后独立非空白名单：classify仅classifications，普通analyze仅artifacts/notFound，reconcile仅artifactEdits/conflicts，review仅conflicts/missingTargets，patch仅patches。错阶段非空字段拒绝，notFound=true只允许普通analyze；无操作空数组保留，不把旧空classifications问题重新引入 |
| 新native与类型引用 | ordinary analyze的实际新值均经31严格validator；角色类型、PLACE、WORLD/SETTING、九类content与非空实质门、TropeKind等不因confirmed或新模式跳过。完整可信catalog校验typed parent/world/MAP、实体ID身份、角色/关系/事件及循环；catalog-only条目不伪造role/content。真实新值不能用只剩材料的未映射对象充当有效native实体 |
| 知识与两线 | 固定提示使用通用转述/时间范围/因果/未知契约、真实业务字段与显式reliability/attribution；新两线与refs走严格validator/已知引用。章节索引保持全书语义，payload只筛相关章节且保留原index。结构校验不宣称文学解释有据，后续全文复核与独立原文验收仍必须 |
| 差量primitive | `applyImportArtifactFieldEdits`只承担已有base/目标/锁/证据/精确before/range/sparse set-unset操作，无workingProse入口。完整 `applyImportArtifactEdits` wrapper仍追加全目录native/引用复验；31两个缺口未被提取绕开。adapter对实际修订结果另走strict native和typed目录，空content及unset TropeKind继续拒绝 |
| bounded fragment | 请求携带原完整baseHash、global start/end及字段范围，模型仅见所给text shard。adapter将验证副本的文字坐标转换为局部范围、对已见内容验证before/UTF-16与fields；返回仍保留原完整hash/global edits，未把局部hash冒充完整提交身份。未知目标、超出文字/字段范围、旧transport hash拒绝。完整artifact变更/原子聚合仍由controller后续全hash wrapper门负责，不以单片返回记整对象完成 |
| missingTargets | 只限request.selectedTargets，所有unitIds必须真实且唯一、reason非空、引文锚定输入原文；声明unit集合与证据unit集合完整对应。跨目标/外部unit/伪quote/空范围拒绝，无oracle输入。任务去重、耐久轮数与关联两线失效尚未由本adapter实现 |
| payload完整预算 | 新semanticVersion/intent/reconcile/decisions/锁/selectedTargets及typed目录字段进入实际JSON；相关目录包含必要引用、parent/world祖先闭包，不靠删所需依赖降低payload。源B、reconcile来源/artifacts/新增上下文2B、完整JSON3B及固定提示64KiB预留均在生成前执行；超限明确失败、不截断/调大B。实际模型snapshot/auth前后校验与取消路径维持 |
| legacy兼容 | 仅semanticVersion=1进入新prompt/输出合同。旧请求serialize分支/字段顺序、原黄金完整分类prompt SHA `67b3b38985543a7d149d71dd02d61c8b9d37a97bb181a425a251411743e5b158` 在同名测试中精确相等；旧NI-A03证据/类别/引用保护单独通过。新字段没有默认补到旧payload或旧共享session |

后续main构造请求时，应维持这里的输入契约：typed目录来自已确认身份的本书条目，未映射原材料不得伪装成有效WORLD/SETTING；fragment元数据和锁由可信完整artifact生成；所有成功片段聚合后仍按完整baseHash、作者锁和整书引用门原子提交。这里通过的是该接口与adapter行为，未审不存在的控制器接线。

## 独立限定执行

只执行主代理明确授权的两个精确命令：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-SEM0[1-5]:' tests/unit/novel-import-semantic.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A03:' tests/unit/novel-import-ai.test.ts
```

实际均退出0：**SEM01–05 5通过、0失败、0跳过，约197.3ms；NI-A03 1通过、0失败、0跳过，约132.4ms。** 没有全文件/全suite、其他旧NI、browser/package或真实模型/DB。

SEM04内部实际执行五种合法模式与错阶段非空输出矩阵，包含空数组兼容、无效请求零生成、来源/目标错误拒绝、锁定字段、typed父引用、全空content/TropeKind修订拒绝、bounded fragment原hash/全局坐标返回及完整wrapper旧hash拒绝。新修订元数据可独立触发2B门，完整instruction触发3B门，固定提示保留预留核对。先前31全部纯helper正反例继续执行。

因此可以把**adapter阶段权限与本次payload/primitive增量**记为通过；不能据此把SEM06–10、SEM-P01–03、主流程source-copy警示/0AI兼容、持续同hash冲突、两轮停止、真实native发布或整书语义标为已通过。后续取得共享文件单owner并按21接线、定向TDD/独审及真实新run验证后再组合验收。
