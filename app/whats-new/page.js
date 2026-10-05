"use client";

import React, { useEffect } from 'react';
import { WHATS_NEW, WHATS_NEW_LATEST_ID, WHATS_NEW_SEEN_KEY } from '../whatsNewData';

export default function WhatsNewPage() {
  useEffect(() => {
    try { localStorage.setItem(WHATS_NEW_SEEN_KEY, String(WHATS_NEW_LATEST_ID)); } catch {}
  }, []);

  const [latest, ...older] = WHATS_NEW;

  return (
    <div className="p-8">
      <div className="mb-10 pl-3">
        <p className="text-sm uppercase tracking-[0.32em] text-slate-500">HR Portal</p>
        <h1 className="mt-3 text-4xl font-semibold text-slate-950">What's new</h1>
        <p className="mt-2 text-sm text-slate-500">Recent updates to the HR portal.</p>
      </div>

      <div className="max-w-4xl">
        {latest && (
          <div className="rounded-3xl p-6" style={{ background: '#EEF4FF' }}>
            <span className="inline-block rounded-full px-3 py-1 text-[11px] font-semibold text-white" style={{ background: '#1a3a8f' }}>
              Latest
            </span>
            <p className="mt-3 text-xl font-semibold text-slate-900">{latest.title}</p>
            <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{latest.body}</p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{latest.date}</p>
          </div>
        )}

        {older.length > 0 && (
          <div className="mt-2 border-t border-slate-100">
            {older.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-4 py-3 border-b border-slate-100">
                <span className="text-sm text-slate-700">{item.title}</span>
                <span className="flex-shrink-0 text-xs text-slate-400">{item.date}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
