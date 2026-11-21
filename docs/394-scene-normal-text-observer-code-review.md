# 394 正常 Worker 文本观测独立代码审核

结论：最终冻结 PRIVATE 增量通过，无剩余阻塞。可由主代理冻结证据后执行 R46 正常运行。仅认证旁观控制，不认证完整导入成功；本次捕获不能冒称 R45 未保存的历史回复。未启动 App/API，未读取真实小说、请求或模型回复。

依据为 392/393 及两份独立审核。审核范围仅 private observer、合成控制、独立构建器和 R46 driver 三处接入，没有产品修改。

原 Worker postMessage/emit 先以原 this/全部参数委托，原返回、throw 和 listener 顺序保持。观察异常及写失败只计诊断；own data 字段、Proxy/getter/toJSON 与 typed-array 内置访问门避免触发输入钩子。只在内存计算完整 input_text/payload 哈希，不保存 prompt、headers、url、Key、原 SSE 或开放错误。落盘只包含白名单生成 output_text、UUID/hash、闭合终止状态及计数；delta 与 done/completed 分存，不用 final 替代实际 delta。

同 Worker 的 request/RPC/transfer 唯一关联、跨块 UTF-8/CRLF/SSE、非法 read/bytes、取消及错误均有完整性控制。captureComplete 仅表示本观察未缺失，不表示模型 JSON 合法或 SDK finish=stop。单流、事件及总量限制不阻断业务；待写文本直到 writer settle 才释放额度。stop 先恢复自身 wrapper，再终结剩余流并 drain。新目录 0700、UUID 文件 wx/0600，既存路径/符号链接拒绝；v5 后安装、之前停止，保留第三方后装 wrapper。

独审发现并阻塞过一处歧义：同 outer rpcId 的不同 operation 被记录为 ambiguous 后仍保留首 meta，随后可错误输出 captureComplete=true。最终新增失效 tombstone，移除首 meta，活动流标不完整，防止后续重新注册；同时覆盖 start/read 跨 map 同 ID 冲突。独立原反例已复验为 **零捕获**，原先错误的首绑定不再成立。新增控制覆盖 start 前、活动流中及第三次注册；失效集合有有限上限，达到上限停该 Worker 的诊断，原业务照常。旧失败日志保留，不将首版 16 绿冒称这些新边界已通过。

## 实际独立验证

- Node 24.18.0 + 绝对路径 tsx loader 执行 PRIVATE `scene-normal-text-observer.test.ts`：最终 **20/20**，包含真实 Node Worker/RpcPeer、15 并发、隐私哨兵、权限、排空、写失败及 v5 链式恢复。日志 `/private/tmp/scene-normal-text-observer-independent-final.txt`。
- `node node_modules/typescript/bin/tsc --project /private/tmp/shakeink-scene-import-20261031/scene-normal-text-observer-tsconfig.json --noEmit --incremental false` exit 0；日志 `/private/tmp/scene-normal-text-observer-independent-typecheck.txt` 为空。
- builder/driver `node --check` 和 `git diff --check` exit 0。未执行 builder 或 App/API。
- 独立核对新 CJS/manifest/source、21 个产品依赖与 8 个保护 bundle；R45 manifest 下 **366 个产品源码、bundle、renderer 文件**逐一哈希不变。
- 从 R46 driver 内存移除 started/start/stop 三块后与 R45 逐字相同。业务按钮、计时、全选、验收、发布和正常关闭逻辑未变。

## 最终 SHA-256

| PRIVATE 文件/产物 | SHA-256 |
| --- | --- |
| observer.ts | `ba294faf15885ff57a6a5e6a73d4bc5c5b624b83968e68a23218c90d057cf94b` |
| observer.test.ts | `f46ce1dc44aeffc3e2b5e09106b60057c58a27ad48c03cd28ad0a0b48e475d05` |
| builder.mjs | `fe50b21dfb9006aeae5c81072daf3c9edf108a542648c5f183a1d352420f38f1` |
| observer.cjs | `dc925a386680693152d4db0dcdb28daefb1ae6b3f4108046bf631d39909cbf8a` |
| build manifest | `116ef8dd7a2211abd1262e7ff050dc22fcc97f68e6ae084f872e26f2a12444de` |
| R46 driver | `bdc8481638c83604c3a7cf59a3176e625cd578a3329f62d289cd036654b06797` |
