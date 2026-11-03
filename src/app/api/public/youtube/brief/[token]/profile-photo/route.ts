import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { getPublicYoutubeShare, MediaError, mediaError, privateHeaders } from "@/lib/youtube-management/server";

export const runtime="nodejs";
const BUCKET="youtube-brief-profile-photos";
const MAX_BYTES=3*1024*1024;
type Context={params:Promise<{token:string}>};

export async function POST(request:Request,{params}:Context){
  try{
    const origin=request.headers.get("origin");if(origin&&origin!==new URL(request.url).origin)throw new MediaError("허용되지 않은 요청입니다.",403);
    if(!request.headers.get("content-type")?.includes("multipart/form-data"))throw new MediaError("사진 파일을 첨부해 주세요.");
    if(Number(request.headers.get("content-length"))>MAX_BYTES+65536)throw new MediaError("사진은 3MB 이하만 첨부할 수 있습니다.",413);
    const {token}=await params;const form=await request.formData();const file=form.get("file");
    if(!(file instanceof File)||!file.size)throw new MediaError("사진 파일을 첨부해 주세요.");
    if(file.size>MAX_BYTES)throw new MediaError("사진은 3MB 이하만 첨부할 수 있습니다.",413);
    if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw new MediaError("JPG, PNG 또는 WebP 사진만 첨부할 수 있습니다.");
    const source=Buffer.from(await file.arrayBuffer());const image=sharp(source,{limitInputPixels:20_000_000,failOn:"error"});const metadata=await image.metadata();
    if(!["jpeg","png","webp"].includes(metadata.format??""))throw new MediaError("JPG, PNG 또는 WebP 사진만 첨부할 수 있습니다.");
    const output=await image.rotate().resize(1600,1600,{fit:"inside",withoutEnlargement:true}).webp({quality:78}).toBuffer();
    if(output.length>MAX_BYTES)throw new MediaError("사진을 3MB 이하로 압축하지 못했습니다. 다른 사진을 선택해 주세요.",413);
    const {admin,settings,course}=await getPublicYoutubeShare(token,"brief");const path=`${settings.workspace_id}/${course.id}/${randomBytes(16).toString("hex")}.webp`;
    const {error}=await admin.storage.from(BUCKET).upload(path,output,{contentType:"image/webp",cacheControl:"31536000"});if(error)throw new MediaError("사진을 저장하지 못했습니다. 다시 시도해 주세요.",500);
    const {data}=admin.storage.from(BUCKET).getPublicUrl(path);return Response.json({url:data.publicUrl,size:output.length},{status:201,headers:privateHeaders});
  }catch(error){return mediaError(error);}
}
