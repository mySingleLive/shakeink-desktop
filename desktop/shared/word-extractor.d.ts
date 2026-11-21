declare module 'word-extractor' {
 interface TextOptions {filterUnicode?:boolean;includeFooters?:boolean;includeBody?:boolean;includeHeadersAndFooters?:boolean}
 interface WordDocument {
  getBody(options?:TextOptions):string;getFootnotes(options?:TextOptions):string;getEndnotes(options?:TextOptions):string
  getHeaders(options?:TextOptions):string;getFooters(options?:TextOptions):string;getAnnotations(options?:TextOptions):string;getTextboxes(options?:TextOptions):string
 }
 export default class WordExtractor {extract(source:Buffer):Promise<WordDocument>}
}
