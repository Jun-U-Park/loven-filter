// Whitelist persisted settings; ignore unknown keys and malformed values.
globalThis.ivpfSettings = {
  defaults:{enabled:true,posts:true,comments:true,green:'show',yellow:'show',red:'show',black:'show',months:3,minPower:4000,minItem:1730},
  normalize(value) {
    const out={...this.defaults,panelVisible:false,panelPosition:'right'};
    if(!value||typeof value!=='object'||Array.isArray(value)) value={};
    for(const key of ['enabled','posts','comments','panelVisible']) if(typeof value[key]==='boolean') out[key]=value[key];
    if(value.panelPosition==='left'||value.panelPosition==='right') out.panelPosition=value.panelPosition;
    for(const key of ['green','yellow','red','black']) if(value[key]==='show'||value[key]==='hide') out[key]=value[key];
    for(const kind of ['posts','comments']) for(const color of ['green','yellow','red','black']) {
      const key=kind+'_'+color;
      out[key]=value[key]==='show'||value[key]==='hide'?value[key]:out[color];
    }
    if(Number.isInteger(value.months)&&value.months>=1&&value.months<=120) out.months=value.months;
    for(const [key,max] of [['minPower',1000000000],['minItem',1000000]]) if(Number.isFinite(value[key])&&value[key]>=0&&value[key]<=max) out[key]=value[key];
    return out;
  }
};
