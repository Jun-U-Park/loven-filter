// Shared by the service worker and isolated content script; dates use Korea time.
globalThis.ivpfRating = {
  number(value) {
    if(typeof value==='number') return Number.isFinite(value)&&value>=0?value:null;
    if(typeof value!=='string') return null;
    const text=value.trim().replace(/\s*[+-]\s*$/,'').replace(/,/g,'');
    return /^\d+(?:\.\d+)?$/.test(text)?Number(text):null;
  },
  date(value) {
    if(typeof value!=='string') return null;
    const m=value.trim().match(/^(\d{2}|\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})$/);
    if(!m) return null;
    const year=m[1].length===2?2000+Number(m[1]):Number(m[1]),month=Number(m[2]),day=Number(m[3]);
    const date=new Date(Date.UTC(year,month-1,day));
    if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day) return null;
    return {year,month,day};
  },
  assess(metrics,now=Date.now(),criteria={}) {
    const months=Number.isInteger(criteria.months)&&criteria.months>=1&&criteria.months<=120?criteria.months:3;
    const minPower=Number.isFinite(criteria.minPower)&&criteria.minPower>=0?criteria.minPower:4000;
    const minItem=Number.isFinite(criteria.minItem)&&criteria.minItem>=0?criteria.minItem:1730;
    const reasons=[],unknown=[],korea=new Date(now+9*3600000);
    const monthStart=new Date(Date.UTC(korea.getUTCFullYear(),korea.getUTCMonth()-months,1));
    const lastDay=new Date(Date.UTC(monthStart.getUTCFullYear(),monthStart.getUTCMonth()+1,0)).getUTCDate();
    const cutoff=Date.UTC(monthStart.getUTCFullYear(),monthStart.getUTCMonth(),Math.min(korea.getUTCDate(),lastDay));
    const updated=this.date(metrics.updated);
    if(!updated) unknown.push('갱신일 확인 불가');
    else if(Date.UTC(updated.year,updated.month-1,updated.day)<cutoff) reasons.push('최근 갱신이 '+months+'개월보다 오래됨 ('+metrics.updated+')');
    const power=this.number(metrics.power),item=this.number(metrics.item);
    if(power===null) unknown.push('전투력 확인 불가');else if(power<minPower) reasons.push('전투력 '+minPower.toLocaleString('ko-KR')+' 미만 ('+metrics.power+')');
    else if(typeof metrics.power==='string'&&/-\s*$/.test(metrics.power)) unknown.push('전투력이 상한 범위로 표시돼 기준 충족 확인 불가');
    if(item===null) unknown.push('아이템 레벨 확인 불가');else if(item<minItem) reasons.push('아이템 레벨 '+minItem.toLocaleString('ko-KR')+' 미만 ('+metrics.item+')');
    else if(typeof metrics.item==='string'&&/-\s*$/.test(metrics.item)) unknown.push('아이템 레벨이 상한 범위로 표시돼 기준 충족 확인 불가');
    return {state:reasons.length?'warning':unknown.length?'unknown':'verified',reasons,unknown};
  }
};
