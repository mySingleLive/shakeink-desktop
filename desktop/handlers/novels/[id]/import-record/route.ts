import {NextResponse} from 'next/server'
import {getOwnedNovel} from '../lib'
import {readNovelImportRecord} from '../../../../service/novel-import-publish'
import {ContentError} from '@/lib/content-errors'
export async function GET(request:Request,ctx:{params:Promise<{id:string}>}){
 const {id}=await ctx.params,result=await getOwnedNovel(id)
 if('error' in result)return result.error
 const query=new URL(request.url).searchParams
 try{return NextResponse.json(await readNovelImportRecord(id,{material:query.get('material')??undefined,offset:query.has('offset')?Number(query.get('offset')):undefined,limit:query.has('limit')?Number(query.get('limit')):undefined}))}
 catch(error){if(error instanceof ContentError)return NextResponse.json({error:error.message,code:error.code},{status:error.status});return NextResponse.json({error:'导入记录读取失败，请重试'},{status:500})}
}
