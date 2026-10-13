// Whitelist persisted settings; ignore unknown keys and malformed values.
globalThis.ivpfSettings = {
  defaults:{enabled:true,posts:true,comments:true,green:'show',yellow:'show',red:'hide',black:'hide',months:3,minPower:4000,minItem:1730},
  normalize(value) {
    const out={...this.defaults};
    if(!value||typeof value!=='object'||Array.isArray(value)) return out;
    for(const key of ['enabled','posts','comments']) if(typeof value[key]==='boolean') out[key]=value[key];
    for(const key of ['green','yellow','red','black']) if(value[key]==='show'||value[key]==='hide') out[key]=value[key];
    if(Number.isInteger(value.months)&&value.months>=1&&value.months<=120) out.months=value.months;
    for(const [key,max] of [['minPower',1000000000],['minItem',1000000]]) if(Number.isFinite(value[key])&&value[key]>=0&&value[key]<=max) out[key]=value[key];
    return out;
  }
};
