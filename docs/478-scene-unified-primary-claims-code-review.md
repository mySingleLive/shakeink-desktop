# 478：统一主生成表示代码独审

结论：按476/477通过限定代码审核，可由主代理冻结后执行正常fresh全文验收；没有新静态API探针要求。本次不是全文、七分钟、发布或重开通过，475原失败和473原静态outer false保持。

## 最终源码

| 文件 | SHA-256 |
| --- | --- |
| `desktop/service/novel-import-scene-roster-bound-decisions.ts` | `b7dcacf08cd24bd36c323da516b898f7e42729f0081f76185fdd46752158166c` |
| `desktop/service/novel-import-scene-roster-targeted-repair.ts` | `dae43d26e675b81b818d56f0145d4ab538cc55898c62985b020167a8ba93a13f` |
| `desktop/service/novel-import-ai.ts` | `e80eaa89fa1d3d438542ae79fd8e40f63d6f6a39adf3fd467a0d8e138c6b156a` |

claim-patch原`880a07c7…`未改。独立对照哈希已核的R70原稿：AI逆替唯一describe段后整文件精确恢复；bound原六函数（完整编译器、旧Native、keyed读取、两provider投影、拒后诊断）及make至函数末尾的decode/activate/advance/legacy逻辑逐字相同。targeted仅增加可信资格集合及fresh内部策略接线，原引用/proof/来源、apply、owner、retention和角色/usage/四代门保持。

fresh完整且不可整行拒绝的patch直接完整claims；兼容工厂省略内部strategy仍枚举旧selection。新claims不猜整数、singleton数组或selection wrapper，原完整域/局部顺序/不可变基底和联合门不减少。准备只可claims→完整replacement一次，旧路径最多两次；激活后冻结不变，策略没有进入公开请求参数。

primaryRejectOnly由完整patch、原raw称呼保守hasSource全false且非空、三类proof/keep空及canReject建立；bound再核good incoming和boundCanReject。未知、metadata、partial、无称呼、任一proof、跨unit存在、空候选但实际有源均不能取得资格。该标记只影响Native主0叶，decoder/apply不读标记；要求模型显式0，不自动补答/删行。新称呼真实有源的完整bound/legacy replacement仍实际通过原全门，坏来源仍拒；bad-row引用被拒目标的remap仍实拒四代。

原合成六任务Native完整schema仍19491 bytes、SHA `e3b3997558bfc48b647b12b75c36dff3c9c50b12c83c36daa01370529eba9c52`；主0叶逐值等于此前实测的`{type:integer,enum:[0]}`。这些等价证据不外推新提示的供应商遵从或全文成功。静态指南按可信任务是否包含selection决定是否解释option；原完整raw/current/source/keep/CF/域/位置资料及所有预算调用未改。

## 验证与边界

- 独立最终13文件186/186、无失败/取消/跳过；日志私有`scene-primary-claims-478-independent-final.txt`。新PC/PG及原protocol单独40/40，是上述范围的子集，不相加。
- 主代理最终49文件868/868，全类型检查、desktop build、diff check均exit0；`r71-build-gates.json`已落。复核49测试、25 helpers、57源逐SHA与当前文件相符。首轮860/868及独立125中121/4的旧表示失败证据保留，不写成首跑全绿。
- 旧测试仅适配fresh claims表示、静态文案及当前fixture的最紧g2 N−1预期；g3/g4、原固定桶、完整资料/域/原source-proof-owner断言保持。独立最终复跑覆盖这些受影响文件。旧selection完整oracle/阈值改由明确兼容工厂执行；新fresh真实桥另核同一来源结果，不能以非法旧wire假绿。
- 历史预算335请求/660捕获：353使用＋307未用（25合同改变、282绑定未知），558个可达准备提示、新129/旧130首轮全fit，57源当前及收据均同。无盲用不同任务的旧数字，原实际结论不重分类。
- 三个指定真实首稿加完整新synthetic坏答的四代12提示全fit，0API；max fixed65391、schema13709、最小context余677495。v1工具用JSON.parse不能读取原markdown fence的失败保留，v2用原parser，不改产品。三首稿新明确反事实3/3、原输入SHA及全部原证明保留另有收据，不替代这项四代预算，也不称新的供应商成功。

无剩余代码审核阻塞。正常全文仍须原按钮/420000ms、无skip/drop、全部场景及资料复核、发布、正常重开和DB比较；沿已审逐文件状态取证，draft内容变化必须逐值审核。本审核未改产品/测试、未App/API，未公开小说、实际回复或Key。
