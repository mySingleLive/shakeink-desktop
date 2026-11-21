# 具体地点清单：精确片段ref及首提及记录

2026-11-01。R30/R31均为当前接口只读诊断失败，未发布；新鲜全文仍止于R28。24单位小包第二代仍有4个明显半开尾界差1及一次错片选择，不能以缩包或原半开说明已解决。此次仅消除数字换算及重复primary字段，不放宽任何原语义门。

## 材料与精确ref

范围仍仅336的新scene roster。文件限现fragment helper、payload、service及FA必要表示适配/新定向测试；core ledger、shared、main不变。保留原完整units、顺序和全部片段文字，发送目录的每个fragment保留index/text并新增不含业务词的`ref`；unitIndex及旧半开备选仍原义。空单位继续保留fragments=[]。

ref固定为`ef`加SHA256摘要前16个小写hex字符。摘要输入用固定序列JSON编码：`["scene-roster-fragment-ref-v1",unit.id,unit.fileId,unit.start,unit.end,textHash,localStart,localEnd]`；textHash为完整unit.text的UTF-16LE字节SHA256，localStart/localEnd为本片在原text的UTF-16半开范围。无标题、地点词或正文内容进入可见ref。整当前包建表时任何重复ref一律静态拒绝，不覆盖、不取首，不尝试改变nonce或加长ref求通过。切分及所有原文/空白/Unicode/CRLF规则仍336。

新增纯`createSceneRosterFragmentTable(units)`：捕获当前units的副本，返回冻结的显示目录及私有Map精确resolver；不得暴露可修改Map。目录数组/单位/fragment和用于绑定的快照不可被外部改写，resolver每次返回新Anchor副本。无全局缓存；id/fileId/start/end/text或原顺序改变时重新建当前表，不能按ID复用。ref不解析前后缀、不trim/normalize、不转大小写、不猜索引/邻片、不找近似。

## 严格wire增量

evidence新增第三个互斥分支`{ref:string}`，只按当前冻结Map精确恢复**一片**原unitId/quote，不隐式拼接邻片。不存在的ref必须拒绝；不接受wire自填目录或其它控制字段。原`{unitId,quote}`和`{unitIndex,fromFragment,toFragment}`的合法集合、半开语义及显式坏raw拒绝保持；多键/混键/own undefined拒绝。别包的ref只有其精确来源本就出现在本包表中才有当前含义，不能声称识别模型的外包意图。

record新增第三个互斥分支`{mentions,context,links}`：mentions仍至少一项，只从第0条literal生成name，按本记录原mentions顺序收集其它exact distinct literal为aliases；全部mentions/context/links不删、不排序、不trim或normalize，aliases>20仍原门拒绝。第一条坏提及不能跳过改取后面的好提及。原完整name/aliases分支绝不派生或修复；原primaryMentionIndex分支仍精确使用其声明索引，单mention却primary=1仍拒绝，不能回退到首条分支。新格式不证明全部提及属于同一具体地点，原身份及知识归属审核继续。

整份wire strict形状通过后才在副本中还原所有anchor并编译各record分支，然后原canonical schema、`validateSceneRosterRecords`双唯一/名称覆盖/context/links/容量及service-final/main所有门完整执行。外部canonical仍只有原Anchor与完整name/aliases/mentions等，不出现ref/primary控制字段。合法ref不替代literal在quote中恰一次、quote在整个声明unit唯一；重复片段即使ref各不同也仍须拒绝。

## 指导、预算与准入

prompt及安全固定纠错首选复制显示的`{ref}`和`{mentions,context,links}`，主要称呼放第一条；不要计算编号。若单片不能同时满足quote/literal唯一或literal跨片，显式使用原半开连续范围或raw窄引文备选，不自动扩大/修复ref。失败路径只含当前wire已知字段，首条派生name错误映射mentions.0.literal，别名问题映射mentions；沿原最多6项/每message≤250 UTF-16字符，不回显未知ref、名称、ID、quote或未知键。

全部ref metadata及片段文字进入原serialize、planner fits和worker完整预算，不重复text、不丢片段/单位、不人工缩包；新planner可能改变包大小，实际探针重建当前合法包并记录新hash。原role、thinking-off、cap、两代、并发、16KiB wrapper reserve不变，不加native结构化请求。341独审后真实入口RED→最小GREEN→独立code review；主代理再作实际单包及新鲜全文，不把Mock或探针替代完整导入/发布/重开。
