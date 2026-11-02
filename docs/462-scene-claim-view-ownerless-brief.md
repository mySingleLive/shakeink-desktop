# 完整claim视图压缩与无旧归属行的显式决定

461及其独审记录R67实际失败，20请求18成功/2失败，34份完整捕获及输入SHA一致。全文导入、发布、重开和420000ms完成均未通过。用户已授权当前DeepSeek/原小说及按真实地点分开；本方案不新增授权问题，不运行全仓测试。

零API实际首因：3a0a…首稿19行/47个mention引用，44个为空半开范围，原来源门正确拒绝；绝不将空范围推断成单片。原初始修复42任务(37selection/5replacement)，Native25596B合规、prompt-fixed72776B超限。原fallback第8次为Native61650/prompt65654，仅fixed超118B；第9次fixed65312合规但Native66238超702B，后续转换只恶化schema。a3bb…两行strict firstRecord合法、各无已证mention、含1context/0links，现资格保护导致完整replacement，模型四代持续选错有源限定的窗口。其原范围/标签/归属校验均保持拒绝。

私有可行性均不是模型成功。A单独减少重复claim说明可过预算，A+B联合全部19点不fit（最终fixed69274），该失败证据保留。完整A+B+C联合对同一实际首稿、相同首输入SHA，在原fallback第2步通过：47任务(44selection/3replacement)、Native16580B、fixed64403B、contextNeed384842/1048576；源payload314243B不变。613处CF引用逐点反投原rows精确一致。另B对a3bb原首稿产生4selection任务，明确反事实选择均为1，经原完整业务入口7记录通过，Native375B/prompt30774B；不计实际供应商成功。

A只改发送副本：selection任务不重复发送claims元数据，仍发送slot、claimIndexes及全部options/局部编号/assignment；claimIndexes为原patch.claims的零基下标，按task.slot查targeted.rows中slot相等的行，再依序取patch.claims。不得把bad-row数组位置当slot。private tasks、编译器、选项顺序、fallback排序、Native和decoder均保持；完整元数据仍在targeted目录。

C只作发送副本的类型化引用表示：candidates[].choiceRefs、keep.mentions/context[].choiceRef、keep.links[].choiceRefs、patch.claims[].eligibleChoiceRefs对应CF改成完整choices表中的共享整数，并以choice/choices/eligibleChoices明确命名。CF身份仍完整保留原8列表第2列，各共享号为原第1列1..N。rr/pc/literal/label/sourceRef/原来源/所有metadata及候选、keep、eligible顺序和重复项都保留。不做全文字符串替换、局部重新编号、取首、去重、排序或截域；引用缺失/重复/非双射必须failclosed。显示构造不改private plan，按显示行+原完整表逐字段反投必须等于原plan.rows。当前来源/保留focus、错误反馈及所有旧输入协议保持原表示。主要输出仍原keyed answers，未更改供应商wire/schema，不做新Native能力猜测。

B仅扩展原strict firstRecord三数组、没有旧proof mentions且links=[]的行之patch资格。所有未证mention须由模型显式选择原合法单unit候选或按原无源资格拒绝；不改hasSource、requiredSpellings、可用发生位置数量和oldMembers借用禁令。每个无原proof的context evidence位置也必须显式claim，即使原raw窗口可定位，也不能变成anchor基底/pending冻结或宣称已证。未知键、metadata分支、部分类型、重复原raw位置、跨unit有源无合法候选、发生位置不足等仍走原fallback；有旧owner/含links路径原义不动。原完整group联合验证、256/4096/65536编译阈值及整组fallback、whole-owner图、最终来源/canonical/retention/归属全部保持，不直接删除空owner保护而留下暗冻结路径。

所有原来源文本、旧证明、完整CF域、模型用量与授权/版本/四代限制保持。A/C不改变任务实际选择，B仅把完整replacement改为明确有限决定，应用仍按原claimpatch组装、执行全部原门。不得用原始空范围或错误窗口自动生成已接受结果。

历史验证需修正口径：B以及原fallback停点变化可能改变任务分组/编号含义，旧数字即使碰巧通过也不能当新供应商成功。保留224个实际历史请求/452份捕获及原exact receipts。每次复用旧后续答之前，须证明旧实际输入绑定，并比较最终激活deck的完整语义指纹：kind/slot/claimIndexes与claim绑定、每个option完整CF assignment及共享号到CF/窗口。仅任务数量相同不足。绑定相同才可离线复用；不同或无法证明只测已准备的next完整prompt/schema预算，并在SDK前停止，余捕获标unused-contract-changed/unknown；提前接受的余项另标unused-earlier-accept，无历史下一答仅preflight/noSDK。used及互斥unused各类合计452，不能叫452次新调用或承诺原接受数不变。更后代完整资料预算用真实业务合成失败做N/N+1及2/3/4代控制，明确不是历史实际回复。全部新129/旧130首轮及所有历史首稿准备请求完整预算均须通过，当前3a预算拒绝必须得到明确修复证据。

按技术独审→用例独审→TDD→独立code review。拟hierarchy owner负责bound provider view、AI唯一mapping说明及roundtrip/预算测试；AI owner负责claim-patch资格及严格负控/业务桥测试；最小调整现有测试helper读取新视图，保留其原领域断言。主代理组合、完整预算、types/desktop build/diff及真实R68 fresh正常流程验收，原计时不重置。完整场景/复核/发布/正常退出重开/全DB比较未完成前不总结成功。
