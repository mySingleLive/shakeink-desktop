# 真实小说格式来源候选

调研日期：2026-10-26（Asia/Shanghai）。范围：独立子代理查找来源；未向测试目录下载作品、未修改生产代码、未运行导入。网页可读性和HEAD不等于文件落盘、全文完整性或解析已通过。

## 优先候选

| 候选作品 | 篇幅/格式 | 直接下载URL | 一手来源与目前核对结果 |
| --- | --- | --- | --- |
| Brandon Sanderson《Warbreaker》4.2稿 | 长篇奇幻，DOCX | `https://cdn.shopify.com/s/files/1/0886/8082/5106/files/WarbreakerFull4.2.docx?v=1723755358` | [作者官方 Rights & Downloads](https://www.brandonsanderson.com/blogs/blog/warbreaker-rights-and-downloads) 链接的完整版本4.2。HEAD实测200、DOCX MIME、849084字节；未取正文/ZIP核对。作者将本书以网络逐章/逐稿公开，不是合成测试小说。 |
| 《Warbreaker》1.0稿 | 长篇奇幻，DOCX，压力候选 | `https://cdn.shopify.com/s/files/1/0886/8082/5106/files/WarbreakerFull1.0.docx?v=1723755162` | 同一作者官方页。web工具识别为DOCX MIME后无法解析；未落盘。官方明确早稿有中途删角、伏笔问题及错字，不适合作为“原书完全一致”的主基线。 |
| 《Warbreaker》6.1稿，Eric版 | 长篇奇幻，PDF | `https://cdn.shopify.com/s/files/1/0886/8082/5106/files/Warbreakerfull6.1-1.pdf?v=1723758457` | 同一作者官方页；web已识别891页并可提取正文文字。其前言与末尾有其他作品节选，须区分本书正文、作者说明/附录与别书试读。未落盘做raster/字形或全文覆盖检查。 |
| 《Warbreaker》Tor第一版 | 长篇奇幻，PDF，版式候选 | `https://cdn.shopify.com/s/files/1/0886/8082/5106/files/Warbreaker_hardcover_1st_ed.pdf?v=1723759719` | 同一作者官方页明确为出版社送印稿电子PDF；web识别593页及可提取文字。可能含图像/装饰，需实际解析确认，不能预记PDF导入通过。 |
| 刘鹗《老残游记》 | 中文长篇，PDF | `https://www.hnwomen.com/_upload/article/files/fd/ac/75777b2d4097990b4e2bb5d01db1/d6abb0c1-841f-4ff9-b988-1926d602deef.pdf` | [福建华南女子职业学院官网](https://www.hnwomen.com/) 域下公开文件（注意不是湖南女子学院）。web识别178页，目录含完整20回、正文从第一回延伸至第二十回；有文字层。尚未做下载后页覆盖、封面图片、OCR错字与篇幅计数。 |
| 鲁迅《阿Ｑ正传》 | 中文中篇，Markdown | `https://raw.githubusercontent.com/Ac-heron/luxun/b859e5043211b9ead7417ba3f5776e81eaf9213c/%E5%85%A8%E9%9B%86/%E5%91%90%E5%96%8A/%E9%98%BF%EF%BC%B1%E6%AD%A3%E4%BC%A0.md` | [项目原文件](https://github.com/Ac-heron/luxun/blob/master/全集/呐喊/阿Ｑ正传.md) 显示1307行、77.3KB；注意标题为全角Ｑ。原作版权状况可与[维基文库原作页](https://zh.wikisource.org/wiki/阿Q正傳)的公版标记交叉核对。未落盘逐章/尾章检查。 |
| 鲁迅《孔乙己》 | 中文短篇，Markdown | `https://raw.githubusercontent.com/Ac-heron/luxun/b859e5043211b9ead7417ba3f5776e81eaf9213c/%E5%85%A8%E9%9B%86/%E5%91%90%E5%96%8A/%E5%AD%94%E4%B9%99%E5%B7%B1.md` | [项目原文件](https://github.com/Ac-heron/luxun/blob/master/全集/呐喊/孔乙己.md) 显示137行、10.2KB。master Raw的HEAD实测200、text/plain、10428字节；表中使用同一仓库当前commit固定下载。包含注释，需与正文区分。原作[公版说明](https://zh.wikisource.org/wiki/孔乙己)。 |
| 鲁迅《狂人日记》 | 中文短篇，Markdown | `https://raw.githubusercontent.com/Ac-heron/luxun/b859e5043211b9ead7417ba3f5776e81eaf9213c/%E5%85%A8%E9%9B%86/%E5%91%90%E5%96%8A/%E7%8B%82%E4%BA%BA%E6%97%A5%E8%AE%B0.md` | [项目原文件](https://github.com/Ac-heron/luxun/blob/master/全集/呐喊/狂人日记.md) 可读且README列于《呐喊》目录；尚未下载/计数。 |
| 鲁迅《祝福》 | 中文短篇，Markdown | `https://raw.githubusercontent.com/Ac-heron/luxun/b859e5043211b9ead7417ba3f5776e81eaf9213c/%E5%85%A8%E9%9B%86/%E5%BD%B7%E5%BE%A8/%E7%A5%9D%E7%A6%8F.md` | [项目原文件](https://github.com/Ac-heron/luxun/blob/master/全集/彷徨/祝福.md) 显示373行、27.9KB；尚未下载/计数。 |

`Ac-heron/luxun` 的固定commit由GitHub公开commits API元数据取得：`b859e5043211b9ead7417ba3f5776e81eaf9213c`。仓库未显示可见LICENSE，不能把仓库整体及其收录的现代评论都当成公版；只将年代已确认的鲁迅原作列为候选，现代注释/说明须单列核对与记录来源。以上Markdown是网络上原本提供的 `.md` 文件，不是本轮自行转换冒充下载。

## 授权与版本注意点

- [Sanderson作者官方版权说明](https://www.brandonsanderson.com/blogs/blog/warbreaker-rights-explanation) 和下载页将稿件发布为 CC BY-NC-ND 3.0 US；需保留署名/许可与原文，不把改写正文或重新分发的商业使用当已获许可。作者[作品介绍](https://www.brandonsanderson.com/pages/standalones-cosmere)直接介绍了Siri、Vivenna、Lightsong、Vasher与魔法设定，能支持事前语义基线调查。
- 官方不同稿不是同一文本：DOCX4.2与PDF6.1不能直接比较原文hash；如要跨格式比较，需下载官方同稿版。官网4.2 ZIP也列为候选：`https://cdn.shopify.com/s/files/1/0886/8082/5106/files/warbreaker4-2hdebs.zip?v=1723755453`，页面说明包含原Word稿与排版PDF，但本轮尚未下载或列ZIP目录。
- 官网6.1 Word ZIP指向旧站 `https://www.brandonsanderson.com/wp-content/uploads/2020/02/WarbreakerFull6.1.zip`，web取回404；不能把此链接标为可用。
- 第三方 `guusj/books` 提供《Warbreaker》Markdown及生成文件，但README承认改了若干原文/格式且原许可含ND，故不把它作为优先授权来源。使用中文公版Markdown更稳妥。
- 鲁迅原作的维基文库页面有原著作地及中国大陆公版标记，原作者/发表年代可核对；这是原作说明，不为任意现代校注版给出统一授权结论。

## 次选：大学完整小说教学注释版 DOCX

[University of North Florida — Pride and Prejudice: Annotated with Reading Strategies](https://digitalcommons.unf.edu/secondary_resources/3/) 明确包含Jane Austen整部小说、另附200余阅读策略活动；页面提供31.5MB DOCX与29.6MB PDF，并标注CC BY-NC-SA3.0。它不是只有教案而无小说，但属于混合正文/注释资源，不能冒充干净原书。DOCX链接在网页13号Download，web访问返回内部错误，未落盘；主线可优先作者官网《Warbreaker》DOCX，不依赖此项。

## 排除与未完成

- 搜索中大量《阿Q正传》《孔乙己》《狂人日记》DOCX是教案、读后感、试卷、论文或节选，不作为小说全文。
- 不使用“24小时内删除”“全网搜集”等不构成授权的站点声明作为下载依据，不绕过登录、付费或403。
- 尚未解决“中文干净全文DOCX”直链；已找到作者官网完整英文奇幻DOCX可覆盖该格式。
- 这份候选清单不是六部小说最终矩阵，也不代表用户已接受公版/英文作品；选择仍以主代理收到的用户约束及研究文档为准。
