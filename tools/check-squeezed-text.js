(()=>{const bad=[];for(const t of document.querySelectorAll('.gc-task-card__text,.gc-ics-event__title')){const r=t.getBoundingClientRect();if(!r.width)continue;const len=(t.textContent||'').trim().length;
/* 文字被挤成窄条：宽度很小但字数不少（逐字换行），或内容被裁切（纵向溢出且未设省略） */
if((r.width<70&&len>12)||(t.scrollWidth>t.clientWidth+2&&getComputedStyle(t).textOverflow!=='ellipsis'))bad.push(Math.round(r.width)+'px/'+len+' '+t.textContent.trim().slice(0,28))}
return JSON.stringify({checked:document.querySelectorAll('.gc-task-card__text,.gc-ics-event__title').length,squeezed:bad})})()
