# 有类型联合的静态诊断与条件产品修复

R54原R48正控HTTP200，原B′仍400，闭合原因是`invalid json schema field anyOf missing field type other`。当前代码可确认B′的items.anyOf包含一个自身无type的纯anyOf replacement节点，其三个分支本来都是type=object。此是已观察错误方向，尚不能宣称全部历史400只有一个原因。R49产品继续冻结，先做两次新的synthetic诊断，不重发小说、不重跑旧实验。

两例均由冻结R52 B′原schema复制，保持原prompt和共同witness：①只给那个纯anyOf replacement包裹节点追加`type:'object'`，其全部分支已静态证明object，未裁字段；②仅对items的纯anyOf树按关联律递归展开，保留每个完整叶及其范围/0/三种replacement表达，以对象键序无关的精确结构深等去重；不合并范围、不flatten带其它约束的节点、不改内层字段。原B′、①、②的Ajv见证及固定正负结果必须一致；输入原对象/hash不变。两例之间不夹带新字段/约束。记录各schema/prompt/wire SHA、原tuple位置验证及共同witness结果，不把更宽uniform联合当应用逐位置门。

PRIVATE新cases/helper/tests/builder沿用冻结R54安全161词原因投影、已证tee/SDK/mainGateway/正常退出/700600wx/每例1全局finalfetch硬2/maxNetworkRetries0/readonlyUsage。词表及流行为不改，无开放错误正文、Key/headers/URL/真实prompt/source落盘。旧R48/R50/R52/R54源/CJS与R49保护368均不变；424独审后root才运行这两例并记录425事实。新helper `dist/review/scene-native-typed-branch-probe.cjs`，manifest同名前缀，`run({root,destination})`、新目录`native-typed-branch-r56-UUID`。原B′唯一待补type位置固定为`/properties/answers/items/anyOf/1`，①不对其它任意节点猜补。

条件产品准入：必须先有候选②实际HTTP2xx、stop、直接完整JSON、本地候选schema及原tuple A/共同witness均通过、实际wire/schema/input SHA吻合、只读/正常退出/保护hash无变。候选①单独成功不能自动批准②；失败/不确定时不实施、不补试。本例成功也不证明供应商strict普遍可靠。上述独审批准后，满足实际条件可直接进入本节已审TDD，不需重写一份相同方案。

产品范围仅`desktop/service/novel-import-scene-roster-bound-decisions.ts`的`sceneRosterBoundNativeSchema`构造函数及针对测试：从原相同fields/三种严格record直接生成完整内联的、有typed叶的同质items联合；纯anyOf关联展开与精确重复叶去重，没有definitions/$ref/tuple-array items/additionalItems。选择范围/0资格/三个完整replacement分支及各字段上限逐值保持，不缩原表示集。tasks为0时仍只允许answers=[]，items可用单个typed整数占位（maxItems=0，不产生新可接受元素）；tasks为1或多条均保原完整union表达。原本地按冻结task位置解释、旧repairs各分支、claim/source/retention/owner/版本/全量canonical门不动，首轮及root恢复native schema不动，四代/模型/thinking/输出cap不变。不得从供应商忽略子约束推导可省本地验证。

产品GREEN冻结前需新构造与从原构造明确派生的homogeneous-union基线做内联/flatten前后Ajv正负等价，另保留原tuple逐位置门的应用负控。新homogeneous union本身会比旧tuple容许更多跨位置组合，不能声称二者Native接受集完全相同；原应用冻结task位置门必须继续拒这些组合。还需真实SDK完整wire，以及原CI16K和实际130 first+R46全77/R47全59历史代的完整prompt/schema/fixed/context预算零API验证。不得升65536字节（64KiB）fixed reserve、16384字节wrapper或v1余量，不能裁材料/draft/current/全部choices/keep/任务方案；如真实预算不满足，保持未准入并回报，不能拿字节估计作通过。产品代码独审后root才fresh全书；静态诊断通过不等全书通过。
