# 场景资料正文指导独立代码审核

2026-11-01，独立审核者`scene_fix_review`。依据已通过的314/315，仅审核structured-scene固定指导、text.description、新SPG测试及WG03允许差异；未参与产品/测试实现，未构建、启动App、调用API或读取真实小说、配置/Key、私有模型响应。

**审核通过，无遗留阻塞。** 独立五文件组68/68通过，普通SDK prompt隔离断言补强后另独立SPG8/8通过。结论证明指导送达及原合同/门保持，不证明供应商遵循、历史长尾原因已消除或整书验收成功。

## 窄实现核对

`desktop/service/novel-import-structured-scene.ts:16`只新增共用静态`TEXT_GUIDANCE`；`:102`将它放入服务器schema的`properties.text.description`；`:119`替换原native场景prompt中“完整非空白正文”的歧义说明，并保留非空白字符串要求。指导明确当前目标的完整资料说明，全部不同有据事实、相关跨人物/地点关系、历史、时间、归属及必要上下文仍完整保留；只排除与当前目标无关的逐段剧情复写，没有字数上限或摘要替代要求。

独立反向移除上述三处增量后，整个模块SHA-256精确回到R24冻结值`25e90e20c71a4e8a175dcc41a067dfd4db0659cf94e4eeb92b48b76e25baf0fa`。这证明能力/endpoint/model/thinking选择、payload、完整目录/引文、strict wire与canonical适配、知识/Unicode/证据/父级校验没有夹带修改。

只剥schema副本的`properties.text.description`后，原type/pattern/required/enum/range/additionalProperties文法仍逐值相同。WG03保留原payload哈希`19ffb8999d7e722f5375a19c79bd462fa740b8dd6f085366f05ac698421e4fb6`和剥唯一注释后的原schema哈希`50e3f7d1effaaaff725c58c814ac9914ccba9d502769b7343d0366e4c062aa34`，没有删除其它字段/字节断言。

## 原数据及生产门

- 实际generateImportAiJson→generateJSON→SDK MockLanguageModelV4边界收到相同业务指导的schema与prompt；完整units、target、typed目录、8项引文选项和payload不变。合成大于27529字符的text及四个长字段、前后空白、CRLF和非BMP字符逐值保留，8项证据全部还原；没有截断、搬字段或丢引用。
- 完整可解析JSON的length结束仍被拒绝；首length→合法stop只用原第二生成恢复，持续length两次后失败。既有controller三生成恢复/四生成失败、知识/证据、严格坏值、授权/快照/取消等SO/WG/SB负例继续通过，没有新增重试或接受length。
- `desktop/service/novel-import-ai.ts:304`将完整schema（含description）与payload交原预算门，完整prompt/schema交固定说明reserve；`:309`仍用实际role pin的完整UTF-8输入、wrapper reserve和32768 headroom决定是否设置cap。新增说明没有豁免字节、删材料、扩大窗口或借用text模型容量。SPG05实际使仅新增注释跨过原预算时，生成调用数为0；原OC容量边界继续通过。
- 普通review及不具native能力的模型保持原通道。按独审建议，SPG05已改为检查实际SDK prompt不含完整native description，同时保留非JSON responseFormat及默认cap断言；该补强后另独立复跑8项通过。没有改变7分钟验收门、并发或保存行为。

## 独立执行证据

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test tests/unit/novel-import-scene-profile-guidance.test.ts tests/unit/novel-import-scene-wire-guidance.test.ts tests/unit/novel-import-structured-buffering.test.ts tests/unit/novel-import-structured-scene.test.ts tests/unit/novel-import-scene-long-fact-review.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test tests/unit/novel-import-scene-profile-guidance.test.ts
```

五文件组**68/68节点通过，0失败/取消/跳过，退出0，约7.63秒**，合成日志`/private/tmp/scene-profile-guidance-independent-review.txt`。补强SDK隔离后SPG另跑**8/8通过，退出0**，日志`/private/tmp/scene-profile-guidance-independent-isolation.txt`；不将重复执行相加为新增用例。主代理的无增量tsc/diff退出0属其执行，本审核未重跑类型检查或其余292项。

作者RED8节点中5通过3失败，含一个父级；两个leaf在旧代码缺description处真实失败。SPG01后置长值/引文保真、SPG05后置预算拒绝尚未到达，不冒称它们已执行RED。GREEN独立确认这些后置门实际通过。

R26旧prompt同目标只读复测的52/56完整unit复写、首length后合法stop，仅为主代理报告的当次标量证据；本审核未读取私有响应或重发请求，也不认定该复测与历史出站逐字节等同。预定mock输出不证明真实DeepSeek行为。后续须新冻结构建、原接口实测及全新默认全选全部场景、完整body/facts复核、作者冲突门、正常发布/退出/重开；R25/R26未完成结果保持，不用局部指导或合成GREEN替代完整通过。
