import React, { useState, useCallback } from 'react';
import WritingAnalysis from './components/WritingAnalysis.jsx';
import GrammarPractice from './components/GrammarPractice.jsx';
import ProgressTracker from './components/ProgressTracker.jsx';

const TABS = [
  { key: 'writing', label: '✍️ 寫作分析' },
  { key: 'practice', label: '🏋️ 文法練習' },
  { key: 'progress', label: '📊 進度追蹤' }
];

export default function App() {
  const [tab, setTab] = useState('writing');
  const [refreshKey, setRefreshKey] = useState(0);

  // 寫作分析完成後，觸發弱項 / 進度資料重新讀取
  const bump = useCallback(() => setRefreshKey((k) => k + 1), []);

  return (
    <div className="app">
      <div className="header">
        <h1>IELTS Grammar Coach</h1>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab-btn ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'writing' && <WritingAnalysis onAnalyzed={bump} />}
      {tab === 'practice' && <GrammarPractice refreshKey={refreshKey} onAttempt={bump} />}
      {tab === 'progress' && <ProgressTracker refreshKey={refreshKey} />}
    </div>
  );
}
