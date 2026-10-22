// 本产品配置需求的公开入口；只登记名称、类型和规则，不保存配置值。
export const manifest=Object.freeze({
  "schema": 1,
  "product_id": "tuyuserve",
  "configuration": {
    "id": "tuyuserve",
    "kind": "tuyu",
    "title": "服务端配置",
    "items": [
      {
        "environment": "tuyuserve",
        "name": "CLOUDFLARE_ACCOUNT_ID",
        "title": "CLOUDFLARE_ACCOUNT_ID",
        "description": "Cloudflare账户编号",
        "revealable": true,
        "accessLevel": "public",
        "kind": "runtime",
        "format": "hex16",
        "required": true
      },
      {
        "environment": "tuyuserve",
        "name": "TUYUSERVE_R2_BUCKET",
        "title": "TUYUSERVE_R2_BUCKET",
        "description": "Cloudflare导出使用的R2桶名",
        "revealable": true,
        "accessLevel": "public",
        "kind": "runtime",
        "format": "r2_bucket",
        "required": false
      }
    ]
  }
});
export function describeConfiguration(){return JSON.parse(JSON.stringify(manifest));}

// 本仓流程的公开入口声明；调用方只交付标准传输能力，不拥有产品规则或任务宿主。
export async function describeAction({flow,platform}){
 if(flow!=='release')throw Error('本产品尚未声明该流程入口：'+flow+'·'+platform);
 const {automationClient}=await import('./build.mjs');
 return {repository:automationClient.automationRepository,
  launch:async({token})=>({runID:(await automationClient.dispatch(platform,token)).id})};
}
