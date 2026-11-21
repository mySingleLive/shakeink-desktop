# 本地引用展开诊断用例

先审414再审本用例；仅PRIVATE合成TDD，原R50流/投影/硬门/产物与R49产品不可改。

| ID | 固定夹具 | 必须断言 |
| --- | --- | --- |
| RP01实际schema | 冻结R50工厂原A/B，各展开本地纯引用 | 原hash不变；展开无$ref、无root definitions/$defs；全部原字段/limits/顺序及同prompt/witness保留；两展开差异仍仅items/additionalItems。每例Ajv原/展开正控通过，错数量、错位置/类型、extra、choice边界等反控结果一致，不把B的宽接受说成原tuple位置门已过。 |
| RP02拒绝不完整变换 | external/unresolved/cycle/$ref sibling/$id/$anchor/dynamic、节点或深度越界 | 全部0fetch固定setup失败；不忽略sibling、不猜相邻定义、不取首、不截断；含合法~0/~1指针的受限本地键正控，输入对象不被改或冻结。 |
| RP03真实SDK | 新case/helper→冻结R50 matcher/executor→真实SDK/main/gateway→fake最终出口 | 精确2例serial/each1/global2/retries0；wire schema/inputSHA匹配展开结果，全部refs真的不出站，thinking/defaultcap不变；synthetic reply仅private。fake A400/B200或反例只表测试控制，不能叫供应商结果。保留原tuple/witness验证字段，两个实际新reply不自动修复。 |
| RP04资源/投影复用 | 既有R50真实tee/安全投影/取消/写失败/quit控制 | R50源与CJS的hash逐字不变，直接复用已审模块；新wrapper每case/context静态绑定不串。0700/0600/wx、新目录、保护368/只读state/active0、closeFailed等原字段及0fetch初始化失败均守。不得为多收关键词新开clone路径。 |

root实际R52另记最多2generate/2fetch、App0及保护hash；A′/B′均为新静态资料，不回放小说、不追认历史HTTP正文。HTTP失败校验not-run，未知仍unknown/other。若结果未区分不能继续循环probe直到想要成功；新产品方案另行独审与完整预算/全文验证。
