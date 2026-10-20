(()=>{const hit=(a,b)=>a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom;const out=[];
for(const blk of document.querySelectorAll('.gc-week-view__time-block,.gc-day-canvas__block')){
const label=blk.querySelector('[class$="time-block-time"],[class$="block-time"]');if(!label)continue;const L=label.getBoundingClientRect();
for(const t of blk.querySelectorAll('.gc-ics-event__title,.gc-ics-event__location,.gc-task-card__text')){const r=t.getBoundingClientRect();
if(r.width&&r.height&&hit(L,r)){out.push(blk.textContent.slice(0,30)+' | '+t.className)}}}
return JSON.stringify({blocks:document.querySelectorAll('.gc-week-view__time-block,.gc-day-canvas__block').length,overlaps:out})})()
