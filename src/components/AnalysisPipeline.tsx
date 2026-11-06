import { CheckCircle2, MinusCircle, Workflow } from 'lucide-react';
import type { AnalysisPipeline as Pipeline } from '../domain/events';
import '../analysis-pipeline.css';

export function AnalysisPipeline({pipeline}:{pipeline?:Pipeline}) {
 if(!pipeline)return null;
 return <details className="surface analysis-pipeline">
  <summary><span><Workflow size={16}/>分析过程与数据覆盖</span><span>{pipeline.modelCalls} 次模型调用 · {pipeline.review.retained} 条发现</span></summary>
  <div className="pipeline-body"><ol>{pipeline.steps.map(step=><li key={step.id} className={step.status}>
   {step.status==='completed'?<CheckCircle2 size={16}/>:<MinusCircle size={16}/>}
   <div><strong>{step.label}</strong><span>{step.status==='completed'?'已完成':'已跳过'}{step.reason?` · ${step.reason}`:''}</span></div>
  </li>)}</ol>
  <p>本轮覆盖 {pipeline.coverage.works} 篇作品、{pipeline.coverage.comments} 条评论及回复、{pipeline.coverage.competitorWorks} 篇竞品作品、{pipeline.coverage.hotspots} 条热点背景。</p>
  <p>候选发现 {pipeline.review.candidates} 条，审阅保留 {pipeline.review.retained} 条，排除 {pipeline.review.excluded} 条。同一模型分步骤分析与复查，结论仍需核对原文。</p></div>
 </details>;
}
