(()=>{/* 同一容器内，带标签的任务卡片版式必须一致（标签都在文字下方，或都与文字同行）；并报告重复标签 */
const where=c=>c.closest('.gc-file-task__popover')?'popover':c.closest('[class*=sidebar]')?'sidebar':c.closest('.gc-view--task')?'taskview':c.closest('.gc-view--day')?'dayview':c.closest('.gc-view--month')?'month':c.closest('.gc-view--week')?'week':'other';
const groups={},dups=[];
for(const c of document.querySelectorAll('.gc-task-card:not(.gc-task-card--timeline)')){
 const tags=c.querySelector('.gc-task-card__tags'),text=c.querySelector('.gc-task-card__text');if(!tags||!text)continue;
 const tr=tags.getBoundingClientRect(),xr=text.getBoundingClientRect();if(!tr.width||!xr.width)continue;
 const mode=tr.top>=xr.bottom-2?'below':'inline';const k=where(c)+' @'+Math.round(c.getBoundingClientRect().width/100)*100+'px';
 (groups[k]??={below:0,inline:0})[mode]++;
 const names=[...tags.querySelectorAll('.gc-tag')].map(t=>t.textContent.trim().toLowerCase());if(new Set(names).size!==names.length)dups.push(text.textContent.trim().slice(0,20));
}
const mixed=Object.entries(groups).filter(([,g])=>g.below&&g.inline).map(([k])=>k);
return JSON.stringify({groups,mixed,duplicateTags:dups})})()
