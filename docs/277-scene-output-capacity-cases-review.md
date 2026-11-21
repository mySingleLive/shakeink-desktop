# 场景输出容量用例独立审核

日期：2026-10-31。审核者：独立子代理 `scene_hierarchy_review`。先完成276方案独审，再审核277；未读取真实数据或调用模型，未参与产品或测试实现。

**OC-01—04及OC-REAL设计通过，可以取得RED后实施。** 实际SDK、容量边界、资料保留与结束状态均有对应验证；编写时须落实以下判定：

- **OC-01**：经generateText及generateJSON调用真实MockLanguageModelV4，捕获doStream的maxOutputTokens，而非只检查调用者options。显式值准确传入，未提供时保留原默认；两次生成都携带相同上限。原schema、配额/用量、取消和finishReason链路不能被旁路或替代。
- **OC-02**：使用真实Responses SDK及合成主进程网关检查实际body的max_output_tokens=32768，同时保持原modelID/endpoint、strict schema、reasoning none和store false。首轮结构错误、第二轮成功应捕获两次body相同额度；HTTP/授权/取消不新增重放。非eligible或普通生成路径的实际SDK请求不应新增上限，不能用“helper返回原对象”代替出站检查。
- **OC-03**：以完整contract.prompt和服务器schema的UTF-8字节数，加既有wrapper预留和32768，独立构造总量恰等于contextWindow可增加、窗口少1字节即不增加的边界。至少包含中文及非BMP字符，避免错误UTF-16 length恰好通过。实际role=review时分别使用text较大/review不足及text非eligible/review足够的正反例，证明能力和容量取同一个实际pin。容量缺失或无效时不增加。
- 预算正反例均须先通过原输入/schema预算门，否则“没增加”可能只是生成根本没有发生。空间不足仍按原默认生成，而非裁掉units、目录、别名、选项或字段；逐值检查原请求和实际发出材料不变。新增index元数据及全部固定提示/schema应计入，不仅计算正文单位总长。
- **OC-04**：大响应正例完整覆盖text及facts/evidence等有据内容，实际JSON桥和canonical门逐值保持。不要用“超过8192字符”冒充“实际超过8192 token”；合成大响应只证明本地无截断，token计数须明确为合成用量，真实容量效果由OC-REAL确认。反例应返回形状完整、可解析且业务合法的JSON但finishReason仍为length，证明结束状态先于成功解析，持续length只按原两生成失败；不得为incomplete新增外层请求。原结构错误的既有两请求四生成上限继续覆盖，但不能据此把所有错误都扩为四次。

OC-REAL顺序正确：独审、定向检查、类型和构建后，使用同一失败范围实际只读检查SDK出站额度、白名单结束状态/计数、配置不变及正常退出；之后新会话执行全文全选场景、完整复核、发布和正常重开。公开证据只留静态类别、计数及hash，不保存原文、模型正文、Key或原始响应。R16仍是未完成失败轮次，局部恢复和历史R15时钟不算新会话通过。

本审核通过测试设计，未执行新增用例或认证真实输出容量效果。
