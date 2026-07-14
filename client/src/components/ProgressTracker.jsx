import React, { useEffect, useState, useCallback } from 'react';
import { CATEGORIES } from '../data/categories.js';
import { api } from '../api.js';

function colorFor(categoryKey) {
  return CATEGORIES.find((c) => c.key === categoryKey)?.color || '#2C3E7A';
}

export default function ProgressTracker({ refreshKey }) {
  const [progress, setProgress] = useState(null);
  const [weakAreas, setWeakAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [p, w] = await Promise.all([api.getProgress(), api.getWeakAreas()]);
      setProgress(p);
      setWeakAreas(w);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [refreshKey, load]);

  if (loading) return <div className="loading">載入進度資料中...</div>;
  if (error) return <div className="error-msg">{error}</div>;
  if (!progress) return null;

  const { totals, byCategory } = progress;
  const overallRate = totals.totalAttempts > 0
    ? Math.round((totals.totalCorrect / totals.totalAttempts) * 100)
    : 0;

  const byCategoryMap = {};
  for (const c of CATEGORIES) byCategoryMap[c.key] = { category: c.key, attempts: 0, correctCount: 0, color: c.color };
  for (const b of byCategory) {
    byCategoryMap[b.category] = { ...byCategoryMap[b.category], ...b, color: colorFor(b.category) };
  }

  const maxWeak = Math.max(1, ...weakAreas.map((w) => w.totalCount));

  return (
    <div>
      <div className="progress-summary">
        <div className="summary-card">
          <div className="num">{totals.totalAttempts}</div>
          <div className="lbl">總練習題數</div>
        </div>
        <div className="summary-card">
          <div className="num">{overallRate}%</div>
          <div className="lbl">整體答對率</div>
        </div>
        <div className="summary-card">
          <div className="num">{weakAreas.length}</div>
          <div className="lbl">診斷出的弱項類別</div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0, color: '#2C3E7A' }}>六大類練習狀況</h3>
        {Object.values(byCategoryMap).map((c) => {
          const rate = c.attempts > 0 ? Math.round((c.correctCount / c.attempts) * 100) : 0;
          return (
            <div className="bar-row" key={c.category}>
              <div className="bar-label">{c.category}</div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${rate}%`, background: c.color }} />
              </div>
              <div className="bar-value">{c.attempts > 0 ? `${rate}%` : '—'}</div>
              <div className="muted" style={{ width: 90 }}>{c.attempts} 題</div>
            </div>
          );
        })}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0, color: '#2C3E7A' }}>文法錯誤分布（來自寫作分析）</h3>
        {weakAreas.length === 0 && (
          <div className="muted">尚未有寫作分析資料。到「✍️ 寫作分析」頁面提交作文後，這裡會顯示錯誤分布。</div>
        )}
        {weakAreas.map((w) => (
          <div className="bar-row" key={`${w.category}__${w.subcategory}`}>
            <div className="bar-label">{w.category} - {w.subcategory}</div>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{ width: `${(w.totalCount / maxWeak) * 100}%`, background: colorFor(w.category) }}
              />
            </div>
            <div className="bar-value">{w.totalCount}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0, color: '#2C3E7A' }}>建議學習優先順序</h3>
        {weakAreas.length === 0 && <div className="muted">尚無足夠資料產生建議，請先完成寫作分析。</div>}
        {weakAreas.slice(0, 5).map((w, i) => (
          <div className="priority-item" key={`${w.category}__${w.subcategory}`}>
            <div className="priority-rank">{i + 1}</div>
            <div>
              <strong>{w.category} - {w.subcategory}</strong>
              <span className="muted"> ・ 錯誤 {w.totalCount} 次，建議優先加強練習</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
