# 场景wire字段说明独立代码审核

日期：2026-10-31。审核者：独立子代理 `scene_hierarchy_review`。依据292/293，只检查structured-scene固定说明增量及其专项，独跑必要structured-scene回归；未参与实现或测试编写，未读真实小说、配置、Key、journal或模型返回，未调用provider/API。

## 结论

**审核通过，无遗留阻塞。** 变更只补充已有封闭字段集合的说明，没有放宽/收窄接受规则或改变资料内容。主代理完成最终定向/类型/构建后，可进行同范围真实只读复测及新的正常全文完整流程；局部恢复不等于全书通过。

## 最小实现核对

`desktop/service/novel-import-structured-scene.ts`从既有textFields生成FACTS_GUIDANCE，列出八字段及字符串/未知空串、应用控制身份/父级、references关联和其它有据描述保留text的分工。native prompt和facts strict错误复用同一常量，不插值来源、实体或模型值。

strictWireObject仅增加可选guidance参数，默认仍为原WIRE_GUIDANCE；仅facts调用显式传入新说明。原record.safeParse布尔形状门、strictObject字段及字符串/可靠性/归属检查不变。其它根、引用及证据对象的默认指导保留；没有过滤unknown key、补值、搬移字段、修改原对象或捕获非法值转成功。

服务器jsonSchema、payload、不可变完整目录、索引及证据恢复、canonical/原生/授权门均不变。原预算和输出headroom仍使用完整contract.prompt，因此新说明的实际UTF-8字节被计入；未改模型/端点、server strict、输出额度或次数上限。

## 独立执行证据

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test tests/unit/novel-import-scene-wire-guidance.test.ts tests/unit/novel-import-structured-scene.test.ts
git diff --check
```

**33/33通过，0失败、0跳过，退出0，约7.39秒**：WG8项及必要structured-scene25项；diff检查退出0。未运行全仓测试或累加历史重复执行。主代理记录原RED执行5项、3通过2失败，WG03早期失败使其后3个预算子项尚未执行；不把最终8项回写为已执行8项RED。

- WG01原Zod明确以facts/unrecognized_keys拒绝首个合成额外key，真实generateImportAiJson→generateJSON→runImportAi第二生成恢复。实际纠错段保留同一完整八字段说明、<=250 code units且无未知key/value、来源/实体/正文回显；完整合法结果与原输入逐值保真。
- WG02实际controller对持续额外key及坏字符串类型均保持两请求四生成、目标failed、零该目标产物，未跳过或丢弃条目。相关非record/undefined额外key及其它严格反例仍由既有structured-scene组覆盖。
- WG03用明确旧结构和黄金hash验证完整payload与server schema字节不变，而非仅与变更后函数互比。payload hash为19ffb899…，schema hash为50e3f7d1…。新说明完整出现在prompt；实际review pin窗口少1字节不增加额度、恰等则32768，且原payload预算通过后确实生成；整体超限零生成，未裁材料。
- structured-scene25项继续通过真实Responses SDK与合成主网关的strict schema/相同模型端点/reasoning none/store false/原cap出站检查，以及完整目录/父级/证据、严格拒绝、有限恢复及最终授权/快照/取消门。

原失败轮未保存的四次结果仍不能据此还原具体额外字段；本次只确认静态说明与相邻实证类别相符。R22若沿用291已审的数字-only observer/完整驱动且仅改变证据标签，应继续保留正常产品身份、默认全选、完整verify/publish、正常退出及重开字段/正文/章界比对，不把R21局部内存改善或本次合成GREEN当最终结果。
