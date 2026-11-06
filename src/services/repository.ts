import { loadLiveData } from './integration';
import type { Dataset, Followup } from '../domain/types';
export interface DataRepository { load(): Promise<Dataset>; loadFollowups(scope:string): Followup[]; saveFollowups(items: Followup[],scope:string): void; }
const key = 'mediamirror.followups.v1';
export const repository: DataRepository = {
  load:loadLiveData,
  loadFollowups(scope:string) {
    try { const saved: unknown = JSON.parse(localStorage.getItem(key+scope) || '[]');
      if (!Array.isArray(saved)) return [];
      return saved.filter((x): x is Followup => !!x && typeof x.id==='string' && typeof x.workId==='string' && typeof x.feedbackId==='string' && typeof x.title==='string' && typeof x.note==='string' && ['待核实','跟进中','待复查','已归档'].includes(x.status) && Array.isArray(x.history));
    } catch { return []; }
  },
  saveFollowups(items,scope:string) { localStorage.setItem(key+scope, JSON.stringify(items)); }
};
