import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowUpRight, Orbit, Pause, Play, Radio } from 'lucide-react';
import type { EditorialEvent } from '../domain/events';
import '../event-danmaku.css';

type Props={events:EditorialEvent[];onSelect:(id:string)=>void};

// Presentation groups only; the source event topic is kept unchanged.
function topicTheme(topic:string) {
 const groups=[
  {label:'气象环境',hue:208,match:/气象|天气|气候|生态|环境/},
  {label:'文娱文旅',hue:278,match:/文化|文旅|电影|金鸡|娱乐|旅游|风景|景观/},
  {label:'民生交通',hue:160,match:/交通|民生|出行|住房|教育|就业|公共服务/},
  {label:'科技健康',hue:184,match:/科技|医疗|健康|科考|创新|生产力/},
  {label:'财经产业',hue:30,match:/财经|金融|经济|产业|金价|黄金|投资|彩票|贸易|进博会/},
  {label:'社会治理',hue:346,match:/社会|治理|警方|治安|法治|安全|警示/},
  {label:'时政国际',hue:238,match:/关系|国际|政治|外交|海洋|BBNJ/},
  {label:'体育赛事',hue:87,match:/体育|赛事|足球|篮球|退役|运动/},
 ];
 return groups.find(group=>group.match.test(topic))||{label:'其他题材',hue:222};
}

export function EventDanmaku({events,onSelect}:Props) {
 const [paused,setPaused]=useState(false);
 const [mode,setMode]=useState<'danmaku'|'orbit'>('danmaku');
 const [orbitPosition,setOrbitPosition]=useState(0);
 const position=useRef(0);
 const targetPosition=useRef<number|null>(null);
 const [hovered,setHovered]=useState(false);
 const [keyboardFocus,setKeyboardFocus]=useState(false);
 const [reduced,setReduced]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 const [width,setWidth]=useState(1100);
 const field=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');
  const change=()=>setReduced(media.matches);
  media.addEventListener('change',change);
  return()=>media.removeEventListener('change',change);
 },[]);
 useEffect(()=>{
  if(!field.current)return;
  const observer=new ResizeObserver(([entry])=>setWidth(Math.max(1,entry.contentRect.width)));
  observer.observe(field.current);
  return()=>observer.disconnect();
 },[]);
 const activeIndex=events.length?((Math.round(orbitPosition)%events.length)+events.length)%events.length:0;
 const eventOrder=events.map(event=>event.id).join('\0');
 const activeEvent=events[activeIndex];
 const stopped=paused||reduced||keyboardFocus;
 function moveTo(index:number){
  if(reduced){position.current=index;setOrbitPosition(index);targetPosition.current=null;return}
  const distance=((index-position.current+events.length/2)%events.length+events.length)%events.length-events.length/2;
  targetPosition.current=position.current+distance;
 }
 function advance(direction:number){
  if(events.length)moveTo((activeIndex+direction+events.length)%events.length);
 }
 useEffect(()=>{
  if(mode!=='orbit'||events.length<2)return;
  let frame=0;let previous=0;
  const animate=(time:number)=>{
   const elapsed=previous?Math.min(time-previous,64):0;previous=time;
   let next=position.current;
   if(targetPosition.current!==null){
    const distance=targetPosition.current-next;
    next+=distance*(1-Math.exp(-elapsed/130));
    if(Math.abs(distance)<.001){next=targetPosition.current;targetPosition.current=null}
   }else if(!stopped&&!hovered){
    // Constant angular motion: no dwell or easing between individual events.
    next+=elapsed/1600;
   }
   if(next!==position.current){
    if(targetPosition.current===null)next=((next%events.length)+events.length)%events.length;
    position.current=next;setOrbitPosition(next);
   }
   frame=window.requestAnimationFrame(animate);
  };
  frame=window.requestAnimationFrame(animate);
  return()=>window.cancelAnimationFrame(frame);
 },[mode,stopped,hovered,eventOrder]);
 // A changed filter starts its own orbit; ordinary data refreshes keep moving.
 useEffect(()=>{position.current=0;targetPosition.current=null;setOrbitPosition(0)},[eventOrder]);
 useEffect(()=>{
  if(mode==='orbit'&&keyboardFocus&&document.activeElement?.matches('.event-orbit-card')){
   field.current?.querySelector<HTMLButtonElement>('.event-orbit-card[data-active=true]')?.focus();
  }
 },[activeIndex,keyboardFocus,mode]);
 const laneCount=Math.min(6,Math.max(1,Math.ceil(events.length/2)));
 const lanes:Array<EditorialEvent[]>=Array.from({length:laneCount},()=>[]);
 events.forEach((event,index)=>lanes[index%laneCount].push(event));
 function title(event:EditorialEvent,copy:boolean) {
  const theme=topicTheme(event.topic);
  // Stable vertical variation keeps titles staggered without jumping on rerenders.
  const seed=Array.from(event.id).reduce((value,char)=>(value*31+char.charCodeAt(0))>>>0,0);
  const verticalOffset=(seed%33)-16;
  return <button type="button" className="event-danmaku-title" key={event.id} data-event-id={event.id} data-topic={event.topic} data-theme={theme.label}
   style={{'--event-hue':theme.hue,'--vertical-offset':`${verticalOffset}px`} as CSSProperties} title={`${theme.label} · ${event.topic} · ${event.title}`}
   aria-label={`${event.title}，题材：${event.topic}，查看事件分析`} tabIndex={copy?-1:0}
   onClick={()=>onSelect(event.id)}><span>{event.title}</span></button>;
 }
 return <section className="surface event-danmaku" data-paused={stopped} data-reduced={reduced} data-mode={mode} aria-label="事件展示">
  <header className="event-danmaku-heading"><div>{mode==='danmaku'?<Radio size={17}/>:<Orbit size={17}/>}<h2>{mode==='danmaku'?'事件弹幕':'环轨画廊'}</h2><span>按题材配色</span></div>
   <div className="event-danmaku-actions">
    {!reduced&&<button type="button" className="event-danmaku-control" aria-pressed={paused} onClick={()=>setPaused(value=>!value)}>{paused?<Play size={14}/>:<Pause size={14}/>}<span>{paused?'继续播放':'暂停播放'}</span></button>}
    <div className="event-display-switch" role="group" aria-label="事件展示样式">
     <button type="button" aria-pressed={mode==='danmaku'} onClick={()=>{setMode('danmaku');setPaused(false);setHovered(false);setKeyboardFocus(false)}}><Radio size={14}/>弹幕</button>
     <button type="button" aria-pressed={mode==='orbit'} onClick={()=>{setMode('orbit');setPaused(false);setHovered(false);setKeyboardFocus(false)}}><Orbit size={14}/>环轨画廊</button>
    </div>
   </div>
  </header>
  <div ref={field} className="event-danmaku-field" style={{'--viewport-width':`${width}px`} as CSSProperties}
   onFocusCapture={event=>{if((event.target as HTMLElement).matches(':focus-visible'))setKeyboardFocus(true)}}
   onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setKeyboardFocus(false)}}>
   {mode==='orbit'?<div className="event-orbit" role="region" aria-roledescription="轮播" aria-label="事件环轨画廊"
    onKeyDown={event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();advance(event.key==='ArrowLeft'?-1:1)}}}>
    <div className="event-orbit-stage" style={{'--orbit-diameter':`${Math.max(180,Math.min(570,width*.35))*2}px`} as CSSProperties}>
     <div className="event-orbit-rail" aria-hidden="true"/><div className="event-orbit-rail inner" aria-hidden="true"/>
     <div className="event-orbit-center" aria-hidden="true"><Orbit size={23}/><span>事件环轨</span><small>{events.length} 个关联事件</small></div>
     {events.map((event,index)=>{
      const offset=((index-orbitPosition+events.length/2)%events.length+events.length)%events.length-events.length/2;
      const visible=Math.abs(offset)<=4.5;
      if(!visible)return null;
      const angle=offset*(Math.PI*2/Math.min(9,events.length));
      const depth=(Math.cos(angle)+1)/2;
      const theme=topicTheme(event.topic);
      const selected=index===activeIndex;
      const radius=Math.max(180,Math.min(570,width*.35));
      const opacity=events.length>9?Math.min(1,(4.5-Math.abs(offset))*2):1;
      const style={'--event-hue':theme.hue,'--orbit-x':`${Math.sin(angle)*radius}px`,'--orbit-y':`${Math.cos(angle)*90}px`,'--orbit-scale':.66+depth*.34,opacity,zIndex:Math.round(depth*100)} as CSSProperties;
      return <button type="button" key={event.id} className="event-orbit-card" data-event-id={event.id} data-active={selected} style={style}
       tabIndex={selected?0:-1} aria-hidden={!visible||!selected} aria-label={`${event.title}，查看事件分析`}
       onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)}
       onClick={()=>selected?onSelect(event.id):moveTo(index)}>
       <span className="event-orbit-card-meta"><span>{theme.label}</span><small>{String(index+1).padStart(2,'0')}</small></span>
       <strong>{event.title}</strong>
       <span className="event-orbit-card-foot"><span>{event.workIds.length} 篇关联作品</span><span>{selected?'查看事件分析':'切换到此事件'}<ArrowUpRight size={14}/></span></span>
      </button>;
     })}
    </div>
    <div className="event-orbit-navigation">
     <div className="event-orbit-position" aria-live={stopped||hovered?'polite':'off'} aria-atomic="true"><strong>{String(activeIndex+1).padStart(2,'0')}</strong><span>/ {String(events.length).padStart(2,'0')}</span><small className="sr-only">{activeEvent?.title}</small></div>
    </div>
   </div>:lanes.map((lane,index)=>{
    const estimated=lane.reduce((sum,event)=>sum+Math.min(560,event.title.length*16+34)+32,0);
    const speed=80+index*6;
    const duration=Math.max(10,Math.max(width+80,estimated)/speed);
    return <div className="event-danmaku-lane" key={index} style={{'--travel-time':`${duration}s`,'--travel-delay':`${-duration*(index*0.137+0.055)}s`} as CSSProperties}>
     <div className="event-danmaku-track"><div className="event-danmaku-group">{lane.map(event=>title(event,false))}</div>
      <div className="event-danmaku-group" aria-hidden="true">{lane.map(event=>title(event,true))}</div>
     </div>
    </div>;
   })}
  </div>
  <footer className="event-danmaku-note">{reduced?'已按系统偏好关闭自动播放':mode==='orbit'?'悬停卡片暂停 · 方向键切换事件':'悬停标题暂停 · 查看完整标题'}<span>{mode==='orbit'?'点击前排卡片，查看事件分析':'点击标题，查看事件分析'}</span></footer>
 </section>;
}
