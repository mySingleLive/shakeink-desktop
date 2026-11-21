# 私有RPC失败观察器：独立审核

结论：**限定v2通过，无剩余阻塞，可启动R36正常fresh全书验收。**356/357已按序独审。本轮只读私有observer/driver，运行合成控制；未修改产品/测试、构建或启动App、调用模型、读取小说/实际回复/配置/Key。观察分类不是业务成功或历史R35根因证明。

- 原postMessage/emit先以原this及全部参数执行，原返回值、抛出对象和监听顺序保持；观察异常只影响自身计数。仅关联同Worker实例+RPC id，记录operationId/payload SHA及限定分类，不读/存成功value。原普通usage、网络、授权和全部模型输入未包装或替换。
- 请求先用descriptor递归检查，拒Proxy/getter/function/own及继承toJSON而不执行；落盘entry为冻结null-prototype纯标量。固定budget/unlocatable等完全匹配；HTTP/Prisma只记录白名单数值/代码及“消息提及”，未知只存unclassified。无message、stack、cause、正文、header或SQL。start限制隔离root及0700目录，wx创建0600文件；stop恢复自己仍拥有的wrapper并等待自身写队列。它不替代模型任务排空或正常退出证明，非RPC的main后处理错误仍可能未知。
- 独立发现并关闭原子安装缺口：可配置emit accessor曾在postMessage已改后触发混合descriptor异常，遗留半个hook。同一纯控制先实际exit1（original变wrappedPost），v2后exit0。现对class.prototype及完整继承链只读data descriptors，拒accessor/Proxy且不触发getter；双define失败也回滚自己已安装的wrapper。
- driver仅flag、start、finally stop三个观察块（4行）。内存移除后逐字恢复frozen run-r29 driver；420000ms、fresh/session、默认全选、完整场景/正文/章节、conflict hold、verify/publish/completed和正常关闭门原样。v2仅替换两个observer模块路径。verify-r36-final与R35完全同字节，snapshot/progress差异仅R35→R36标签，无降低验收。

实际独跑：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import /Users/dt_flys/Projects/shakeink-desktop/node_modules/tsx/dist/loader.mjs --test /private/tmp/shakeink-scene-import-20261031/scene-rpc-failure-observer.test.ts
```

**11/11、exit0**，日志`/private/tmp/scene-rpc-observer-independent-v2.txt`。含真Node Worker、安装前已存在的真Worker、0600文件/队列、descriptor恢复、委托异常及顺序、秘密哨兵、getter/Proxy/toJSON、失败post不关联、Worker/id隔离、own/继承accessor。另独立原accessor反例复验exit0；module-missing不算行为RED。driver/build脚本/verifier/v2 CJS的node --check及progress的Python ast.parse均exit0，未执行验收脚本。

独立逐项重算v2 manifest：**21产品输入、8受保护产品bundle全部hash一致**，旧observer CJS仍与旧manifest一致。冻结SHA256：

| 私有产物 | SHA256 |
| --- | --- |
| scene-rpc-failure-observer.ts | ba23addc3b08c4c3da9b416e569194d4655bd18d52d2076effdf13813299c082 |
| dist/review/scene-rpc-failure-observer-v2.cjs | 01c096d6c7666ba2653acd782e451423d3fbac1f3181d647002c25b73132a186 |
| run-r36-concrete-scene-full-acceptance.mjs | 01ac3b386217956421517aaa8e8bdaabc4bfd69a4d0d8714e77672c46944e47d |

源/driver位于`/private/tmp/shakeink-scene-import-20261031`，v2 bundle位于仓库`dist/review`。本审核只准入新观察运行；不能将标量记录、合成控制或只读单包成功替代真实全书、全部场景、完整复核、发布和重开。
