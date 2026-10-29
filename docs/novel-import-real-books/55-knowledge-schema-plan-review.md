# 知识字段前置校验方案与限定用例独立审核

日期：2026-10-26。审核者：`remaining_books_oracle`。仅审核54与已知service factory、core知识规则、main.safeError接点；没有实现、执行测试、应用、模型、用户库或journal，没有修改原件、oracle与失败快照。

54 SHA-256：`89b734d6fd09f22e3386222998f86565e9bf15191c4aa2e05c1452d2582bf0e3`。

**技术方案：PASS。限定用例：PASS。** 无方案级必须修订项。允许在指定三个文件、原J01／J02内进入实施前行为RED→最小GREEN及独立code review；不代表真实主题已成功或实际失败原因已确定。

## 同义规则与接线

core `novel-import-semantics.ts`第88–92行明确三类知识错误：若提供reliability，必须精确属于四个既定值；有效非客观值需要非空归属；strict世界事件／叙事必须有可靠性。第110行对所有kind执行知识检查，仅worldline／narrative为必需。当前service facts仍为字符串字典，这些语义约束直到生成后的core校验才出现，无法进入真实generateJSON既有纠正。

54只在newsem1普通analyze的facts字段前置同一接受条件，范围与现有request-bound factory一致。非worldline／narrative省略可靠性继续合法；省略时不能因归属为空而新增拒绝。若可靠性已给但为空或未知，必须拒绝，不能删掉、映射为合法值或默认客观事实。三个非客观合法值要求归属trim后非空，但trim只用于判断，输出字符串、temporalScope及其余合法facts原样保留。worldline／narrative仍须显式给可靠性。

新增issues使用固定facts.reliability／attribution路径、固定四值及说明，不能回显坏值、ID、原文或动态目录。与kind／source错误同现仍须完整拒绝，不能把某个issue缺席当作成功。字段级位置能够在其它artifact字段失败时提供该事实约束，但不承诺任何错误组合都在一次纠正中修好。

defaults共用生成桥、真实generateJSON、生成后的同schema解析及原core／native／evidence／links等后置校验保留。没有扩大到legacy、其它phase、reconcile或source-copy；不覆盖nested narrative refs和全部native语法。prompt、网关、预算、共享schema、scope／plan／semantic hash、工作单元和发布均不改，也不引入默认字段或迁移旧检查点。

## 安全提示边界

main.safeError当前第270行仅认可固定前缀及长度，三条知识消息的开头均不在其中，确会变成通用失败。54仅为三条完整静态Error.message添加精确映射，输出固定安全文字，是明确可修的可见性缺口。

实现不能扩大原前缀正则、按包含／startsWith匹配知识错误，或在新提示后附原异常。近似知识消息、secret后缀和普通未知异常应继续由原安全规则处理；非Error对象不能因含message属性获得新信用。原有受控安全错误行为保留。这里只调整失败提示，不新增raw日志／遥测，不影响资料、产物或授权身份。

实际safeError可从controller原型隔离纯调用，或使用受控依赖的controller但不initialize；不需产品测试hook、真实PDF client／worker、目录读取或真实配置。新增测试应证明确实调用当前生产方法，而非复制一份映射表自测。

## 限定用例

J01／J02内部增量覆盖与生产变化直接对应：

- 真实生产同桥／generateJSON，仅用既有generateText DI：无效或空reliability、有效非客观值缺失或纯空白归属、worldline／narrative缺可靠性，首坏后好恰2次；两坏恰2次拒绝，首好1次。反馈只含固定字段与合法值，追加纠正段不泄漏合成秘密或原输入。
- 正例保留普通theme省略可靠性、客观事实无需归属、三个非客观值带归属、原字符串与空白不变；未知枚举不丢弃、不规范化。类别／来源混合错误、raw绕过、所有原后置校验、legacy／其它phase／reconcile继续受保护。
- 实际safeError隔离调用验证三条完整消息的固定输出，后缀秘密／近似消息／未知异常无新增泄漏，原受控提示保留。不initialize、不触发PDF或IO，不读用户状态。

已有一次纠正是上限，不能因同时错误较多新增轮数。只认可54列出的原三条精确命令，不新增测试编号或suite：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern='^NI-J0[12]:' tests/unit/novel-import-request-schema.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[356]:' tests/unit/novel-import-ai.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-SEM0[1234]:' tests/unit/novel-import-semantic.test.ts
```

本审核未执行这些命令。实施者须先在53冻结行为上保留真实RED，再最小实现GREEN；独立代码审核核对三个文件最终SHA、生产接线及日志。必要typecheck／构建另记，不扩成其它suite或真实调用。

## 真实证据与恢复

两失败快照只证明theme两次应用调用rejected，并保留14完整产物、五类coverage、源／工作单元、正文2723／`b636…`与检查点身份；没有raw响应或原始异常。54未把静态缺口写成实测根因，也未排除网络，72.198秒不能推导超时或供应商尝试数。无需额外付费再现即可修复该同义契约与安全提示缺口。

两旧FAIL继续保留，内部次数／tokens／cost仍未知。独立代码审核和组合构建后，同C1通过原UI重新授权，先逐项核对14成功数据不变，再恢复未完成目标；若仍失败，应保存可辨识的固定错误后定位，不盲目重抽。真实主题、其余目标、完整复核、独立文学语义、发布／查表／重开仍须另行实际验收，合成GREEN不能代替。
