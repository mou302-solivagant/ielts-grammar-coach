// 本機開發：不設定 VITE_API_BASE_URL，走 vite.config.js 的 /api proxy 轉發到 localhost:5174
// 正式部署：在 client/.env（或部署平台的環境變數）設定 VITE_API_BASE_URL，
// 例如 https://your-backend-url.onrender.com/api
const BASE = import.meta.env.VITE_API_BASE_URL || '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `請求失敗 (${res.status})`);
  }
  return res.json();
}

export const api = {
  analyzeWriting: (taskType, essayText, image, promptText) =>
    request('/analyze-writing', { method: 'POST', body: JSON.stringify({ taskType, essayText, image, promptText }) }),
  getWritingAnalyses: () => request('/writing-analyses'),
  getWeakAreas: () => request('/weak-areas'),
  generateQuestion: (category, subcategory) =>
    request('/generate-question', { method: 'POST', body: JSON.stringify({ category, subcategory }) }),
  gradeAnswer: (category, subcategory, question, userAnswer, questionType, topic, retryCount) =>
    request('/grade-answer', {
      method: 'POST',
      body: JSON.stringify({ category, subcategory, question, userAnswer, questionType, topic, retryCount })
    }),
  summarizeProgress: (category, subcategory) =>
    request('/summarize-progress', { method: 'POST', body: JSON.stringify({ category, subcategory }) }),
  askTutor: (category, subcategory, tutorQuestion, context) =>
    request('/ask-tutor', { method: 'POST', body: JSON.stringify({ category, subcategory, tutorQuestion, context }) }),
  getProgress: () => request('/progress')
};
