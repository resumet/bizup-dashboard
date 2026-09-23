import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_WORK_SERVICE_CARD_SETTINGS, workServiceCardSettingsSchema, type WorkServiceCardSettings } from "./service-card-settings";

const BUCKET="admin-settings";
const PATH="work-service-cards.json";

function isMissing(error:{message:string;statusCode?:string|number}) {
  return String(error.statusCode)==="404" || /^(bucket|object) not found$/i.test(error.message);
}

export async function loadWorkServiceCardSettings(admin=createAdminClient()):Promise<WorkServiceCardSettings> {
  const {data,error}=await admin.storage.from(BUCKET).download(PATH);
  if(error) {
    if(isMissing(error)) return DEFAULT_WORK_SERVICE_CARD_SETTINGS;
    throw new Error("카드 표시 설정을 불러오지 못했습니다.");
  }
  return workServiceCardSettingsSchema.parse(JSON.parse(await data.text()));
}

export async function saveWorkServiceCardSettings(settings:WorkServiceCardSettings,admin=createAdminClient()) {
  const validated=workServiceCardSettingsSchema.parse(settings);
  const {data:bucket,error:bucketError}=await admin.storage.getBucket(BUCKET);
  if(bucketError && !isMissing(bucketError)) throw new Error("카드 설정 저장소를 확인하지 못했습니다.");
  if(!bucket) {
    const {error}=await admin.storage.createBucket(BUCKET,{public:false,fileSizeLimit:262144,allowedMimeTypes:["application/json"]});
    if(error && String(error.statusCode)!=="409" && !/already exists/i.test(error.message)) throw new Error("카드 설정 저장소를 준비하지 못했습니다.");
  }
  const {error}=await admin.storage.from(BUCKET).upload(PATH,JSON.stringify(validated),{contentType:"application/json",upsert:true,cacheControl:"0"});
  if(error) throw new Error("카드 표시 설정을 저장하지 못했습니다.");
  return validated;
}
