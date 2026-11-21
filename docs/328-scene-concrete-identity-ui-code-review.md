# 场景身份分配界面独立代码审核（328）

2026-11-01，审核者`structured_generation`，未参与本轮renderer/bridge实现或UI测试编写。只读实际组件、受控组件用例及作者RED记录后，独立执行定向测试；未改UI/产品，未启动App、浏览器或模型。

**本次UI分配行P2修复通过，未见该限定范围遗留阻塞。** 该结论不认证尚未冻结的core/main，不将受控IPC组件测试当作真实界面、全书或出版验收。

## 已复核的问题和修复

修复前，`SceneIdentityDetails`的分配列表只显示`member.literal/sourceName`和select；F1两处literal同为“书房”时，可见标签和aria-label相同。上方只读提及页有原文入口，但其cursor与分配cursor独立；分配到第51项后仍不能从上方首50项可靠找到本行出处。这是按真实原文作完整partition的可操作性缺口，不能用“另一书房”的不同标签正控替代。

最终`src/components/desktop/SceneIdentityDetails.tsx:111`逐行显示已加载的真实context labels和明确“第N处提及”导航序号，select aria也按该提及序号区分。context从当前member.contextKeys及合并分页的namePartOptions中取得，不借上方page的context覆盖分配页；没有context时如实显示缺少限定或来源块序号，不将编号作为地点事实或新场景名。

行内“查看这处原文”复用原`readSource(member)`，继续携带该member.key和原scope，经既有只读IPC读取。后续“后一段”仍沿同一sourceMember。改变的仅是正常界面的辨别与读源入口，没有新增action、放宽partition、自动作出作者选择、修改来源或泄露内部ID/hash。

## 独立验证

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-timeout=30000 tests/unit/novel-import-scene-identity-ui.test.ts
```

实际exit0，**16/16通过**，fail/cancelled/skipped均0。日志：`/private/tmp/scene-concrete-identity-ui-independent.txt`。加载并执行实际renderer组件和实际bridge，只有React hooks/IPC及外部UI包装受控；没有运行Electron或真实文件读取。

CIUI13的51个合成成员均使用同一literal“书房”，最后一项另有真实西宅context及不同源坐标。测试在上方只读page仍为首页时，进入第二分配页，验证西宅限定和第51处导航；点击该行原文再读后一段，实际桥接调用均携带最后一项memberKey，neighbor依次0/1，limit仍32768。没有发出身份mutation，行内不展示hash/key。原15项继续覆盖普通详情、完整分配/分页、scope过期、失败保留说明、暂停只读、无version旧会话和重复点击等边界。

作者提供的RED记录`/private/tmp/scene-concrete-identity-ui-same-literal-red.txt`在实际缺少本行context处失败；后面的读源/neighbor断言当时未达，不补认作RED证据。

审核快照SHA256：

| 文件 | SHA256 |
| --- | --- |
| `src/components/desktop/SceneIdentityDetails.tsx` | `c23a1decf87c3ce6099933a92618b47e912179ea4a18fa5797eb15ae5275febb` |
| `src/components/desktop/NovelImportWizard.tsx` | `b3cd0ffce85c33454b9d7dacf8a5f5857a83d4e9ea357190348053a0102d5f31` |
| `src/lib/desktop/novel-import.ts` | `2441dc2607948d30a0227439b6abef65641130e02806d874c36ef957fef9e740` |
| `tests/unit/novel-import-scene-identity-ui.test.ts` | `6a01eb2616ca8afa3a02151ac01ee05d8281c3f2e4e87877ca3598fb216207e0` |

真实作者判断、实际主进程来源/版本门、真实全书默认全选、保存/重开与7分钟门仍须主代理最终验收，不能据此跳过或代替。
