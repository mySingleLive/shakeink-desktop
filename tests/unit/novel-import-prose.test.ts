import assert from 'node:assert/strict'
import {test} from 'node:test'
import {formatImportChapterProse} from '../../desktop/core/novel-import-prose'
import {renderMarkdown} from '../../src/lib/markdown'

const f=(raw:string,title='',volume?:string)=>formatImportChapterProse(raw,{title,...(volume!==undefined?{volume}:{})})
const paragraphs=(html:string)=>(html.match(/<p>/gu)??[]).length

test('IPF-01: volume and chapter heading lines are removed; one paragraph per indented line',()=>{
 assert.equal(f('第一部 小丑\n\n\n第一章 绯红\n　　痛！\n　　好痛！\n','第一章 绯红','小丑').text,'痛！\n\n好痛！')
})
test('IPF-02: CRLF line endings and chapter-only heading',()=>{
 const r=f('第二章 情况\r\n\r\n　　克莱恩醒来。\r\n　　窗外很亮。\r\n','第二章 情况')
 assert.equal(r.text,'克莱恩醒来。\n\n窗外很亮。');assert.ok(!r.text.includes('\r'))
})
test('IPF-03: Markdown-decorated headings are removed',()=>{
 assert.equal(f('## 第三章 梅丽莎\n\n正文一。\n','第三章 梅丽莎').text,'正文一。')
 assert.equal(f('**第三章 梅丽莎**\n正文一。\n','第三章 梅丽莎').text,'正文一。')
 assert.equal(f('# 序章 开端\n\n正文。','序章 开端').text,'正文。')
 assert.equal(f('Chapter One\n\nHe woke.','Chapter One').text,'He woke.')
})
test('IPF-03b: a title that differs from the session title is still removed when it is a heading line',()=>{
 assert.equal(f('第一章　绯红\n　　痛！','第一章 绯红').text,'痛！')
 assert.equal(f('第一章绯红\n　　痛！','改过的标题').text,'痛！')
})
test('IPF-04: headings are only removed at the start; mentions later stay',()=>{
 assert.equal(f('第一章 起\n　　他翻到第一章。\n第一章\n　　又一段。','第一章 起').text,'他翻到第一章。\n\n第一章\n\n又一段。')
})
test('IPF-05: a chapter that starts with prose keeps its first paragraph',()=>{
 assert.equal(f('　　序言第一句。\n　　第二句。','正文序言').text,'序言第一句。\n\n第二句。')
 assert.equal(f('第三部分，这里是正文。\n　　下一段。','正文序言').text,'第三部分，这里是正文。\n\n下一段。')
})
test('IPF-06: fixed-width hard wraps are joined into one paragraph',()=>{
 assert.equal(f('他走进房间，看见那张宽大的书桌上整整齐齐地\n放着一本摊开的笔记。\n　　下一段。').text,'他走进房间，看见那张宽大的书桌上整整齐齐地放着一本摊开的笔记。\n\n下一段。')
})
test('IPF-07: ASCII words joined across a hard wrap get one space',()=>{
 assert.equal(f('He opened the door and looked at the old\nnotebook on the desk.').text,'He opened the door and looked at the old notebook on the desk.')
})
test('IPF-08: a line ending with sentence punctuation or a closing quote ends the paragraph',()=>{
 for(const end of ['。','！','？','…','”','：','；','」','）','—'])
  assert.equal(f(`这是一句比较长的、超过二十个字的正文内容的结尾${end}\n下一行是新段落。`).text,`这是一句比较长的、超过二十个字的正文内容的结尾${end}\n\n下一行是新段落。`)
})
test('IPF-09: a short previous line ends the paragraph',()=>{
 assert.equal(f('呜\n然后他醒了过来。').text,'呜\n\n然后他醒了过来。')
})
test('IPF-10: paragraphs merged on one line are split after sentence punctuation plus full-width indent',()=>{
 assert.equal(f('　　他想了想。　　他转身离开。　　“走吧！”　　她说').text,'他想了想。\n\n他转身离开。\n\n“走吧！”\n\n她说')
})
test('IPF-11: block-level Markdown at a paragraph start is escaped',()=>{
 const r=f('# 不是标题的正文\n> 引号\n- 横线开头\n1. 编号\n---\n+ 加号\n<div>标签')
 const html=renderMarkdown(r.text)
 assert.doesNotMatch(html,/<h\d|<blockquote|<li|<hr|<ol|<ul|<div/u)
 assert.equal(paragraphs(html),7)
})
test('IPF-12: blank lines and trailing spaces produce exactly one separator and trimmed paragraphs',()=>{
 assert.equal(f('　　甲。   \n\n\n\n　　乙。\t\n\n').text,'甲。\n\n乙。')
})
test('IPF-13: a chapter with only its heading becomes empty',()=>{
 assert.equal(f('第九章 空\n\n','第九章 空').text,'')
 assert.equal(f('').text,'')
})
test('IPF-14: offsets map source ranges to the formatted text',()=>{
 const raw='第一章 绯红\n　　痛！\n　　好痛！头好痛，仿佛被人用棒子狠狠抡了一下的感觉让他\n难受。',r=f(raw,'第一章 绯红')
 assert.equal(r.text,'痛！\n\n好痛！头好痛，仿佛被人用棒子狠狠抡了一下的感觉让他难受。')
 const a=raw.indexOf('好痛'),b=raw.indexOf('让他\n难')+'让他\n难'.length
 assert.equal(r.text.slice(r.start(a),r.end(b)),'好痛！头好痛，仿佛被人用棒子狠狠抡了一下的感觉让他难')
 const inside=raw.indexOf('痛！');assert.equal(r.text.slice(r.start(inside),r.end(inside+2)),'痛！')
 const t=raw.indexOf('绯红');assert.ok(r.end(t+2)<=r.start(t))
 assert.equal(r.start(raw.length),r.text.length);assert.equal(r.end(0),0)
})
test('IPF-15: surrogate pairs are kept intact',()=>{
 const r=f('第一章 渡口\r\n\r\n陆青十七岁。  他握着信。🖋️\r\n','第一章 渡口')
 assert.equal(r.text,'陆青十七岁。  他握着信。🖋️');assert.ok(r.text.isWellFormed())
})
test('IPF-16: rendered paragraph count equals non-empty prose lines for one-line-per-paragraph text',()=>{
 const body=Array.from({length:30},(_,i)=>`　　第${i}段，“对话${i}”，他说。`).join('\n'),r=f('第一部 小丑\n\n第一章 绯红\n'+body,'第一章 绯红','小丑')
 assert.equal(paragraphs(renderMarkdown(r.text)),30)
})
test('IPF-17: volume end markers are kept',()=>{
 assert.equal(f('第二百一十三章 小丑\n　　最后一段。\n　　（第一部完）\n','第二百一十三章 小丑').text,'最后一段。\n\n（第一部完）')
})
test('IPF-18: a foreshadow touch anchor is remapped and still resolves in the stored body',async()=>{
 const {importContentAnchor}=await import('../../desktop/core/novel-import-prose'),{resolveReferenceAnchor}=await import('../../src/lib/foreshadow-reference')
 const raw='第一部 小丑\n\n第一章 绯红\n　　他看见一枚铜哨。\n　　铜哨表面锈迹斑斑，上面刻着奇怪的花纹，像是某种古老的\n符号。\n',body=f(raw,'第一章 绯红','小丑')
 const quote='花纹，像是某种古老的\n符号',start=raw.indexOf(quote),a=importContentAnchor(body,start,start+quote.length)
 assert.equal(a.quote,'花纹，像是某种古老的符号');assert.equal(body.text.slice(a.startOffset!,a.endOffset!),a.quote)
 assert.equal(resolveReferenceAnchor(body.text,a)?.start,a.startOffset)
 const lost=importContentAnchor(body,raw.indexOf('绯红'),raw.indexOf('绯红')+2)
 assert.deepEqual(lost,{quote:null,prefix:null,suffix:null,startOffset:null,endOffset:null})
})
test('IPF-19: the short-line rule splits at 19 characters and joins at 20',()=>{
 const n19='一二三四五六七八九十一二三四五六七八九',n20=n19+'十'
 assert.equal(Array.from(n19).length,19);assert.equal(f(n19+'\n续行。').text,n19+'\n\n续行。');assert.equal(f(n20+'\n续行。').text,n20+'续行。')
})
test('IPF-20: an indented line always starts a paragraph, even after a comma or no punctuation',()=>{
 assert.equal(f('　　这一行很长很长很长很长很长很长很长很长，\n　　下一行缩进了。').text,'这一行很长很长很长很长很长很长很长很长，\n\n下一行缩进了。')
 assert.equal(f('　　这一行很长很长很长很长很长很长很长很长没有标点\n　　下一行缩进了。').text,'这一行很长很长很长很长很长很长很长很长没有标点\n\n下一行缩进了。')
})
test('IPF-21: consecutive lines ending with ； stay separate paragraphs (real 诡秘之主 shape)',()=>{
 assert.equal(f('　　值夜者是一个严密的组织，一旦有任务，只能等待安排；\n　　非凡者有失控的风险；\n　　另外，更多的物质来往会留下痕迹；').text,'值夜者是一个严密的组织，一旦有任务，只能等待安排；\n\n非凡者有失控的风险；\n\n另外，更多的物质来往会留下痕迹；')
})
test('IPF-22: a first paragraph that starts with the title name is prose, not a heading (chapter 137)',()=>{
 assert.equal(f('第一百三十七章 白银之城\n　　白银之城，停尸大厅。\n　　戴里克站在台阶前。','第一百三十七章 白银之城','小丑').text,'白银之城，停尸大厅。\n\n戴里克站在台阶前。')
})
test('IPF-23: a first line like 第N部 with sentence punctuation is prose and kept',()=>{
 assert.equal(f('第一部 电影，他看了三遍。\n　　下一段。','正文序言').text,'第一部 电影，他看了三遍。\n\n下一段。')
 assert.equal(f('第三卷：完结后他们分开了，各自生活\n　　下一段。','正文序言').text,'第三卷：完结后他们分开了，各自生活\n\n下一段。')
})
test('IPF-24: titles with quotes or digits are removed',()=>{
 assert.equal(f('第12章 “愚者”\n　　正文。','第12章 “愚者”').text,'正文。')
 assert.equal(f('第一百零一章 意外的线索\n　　正文。','第一百零一章 意外的线索').text,'正文。')
})
test('IPF-25: a range spanning two paragraphs maps across the blank-line separator',()=>{
 const raw='第一章 起\n　　甲句子。\n　　乙句子。',r=f(raw,'第一章 起'),a=raw.indexOf('句子。'),b=raw.indexOf('乙句')+2
 assert.equal(r.text.slice(r.start(a),r.end(b)),'句子。\n\n乙句')
})
