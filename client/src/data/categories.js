// 六大文法類別，含配色與子項目
// color 用於分類標籤/長條圖區分
export const CATEGORIES = [
  {
    key: '句子結構類',
    label: '句子結構類 Sentence Structure',
    color: '#E4572E',
    items: [
      { key: 'Fragment', label: '碎句 Fragment' },
      { key: 'Comma Splice', label: '逗號亂接 Comma Splice' },
      { key: 'Parallel Structure', label: '平行結構 Parallel Structure' },
      { key: 'Sentence Combining', label: '句子合併 Sentence Combining' },
      { key: 'Inversion', label: '倒裝句 Inversion' }
    ]
  },
  {
    key: '動詞類',
    label: '動詞類 Verbs',
    color: '#2E86AB',
    items: [
      { key: 'BE vs DO', label: 'BE vs DO' },
      { key: 'Verb Collocation', label: '動詞搭配 Verb Collocation' },
      { key: 'Tense', label: '時態 Tense' },
      { key: 'Active vs Passive', label: '主動/被動語態 Active vs Passive' },
      { key: 'Modal Verbs', label: '情態動詞 Modal Verbs' },
      { key: 'Subjunctive', label: '虛擬語氣 Subjunctive' },
      { key: 'Participle Phrase', label: '分詞片語 Participle Phrase' }
    ]
  },
  {
    key: '名詞/代名詞類',
    label: '名詞/代名詞類 Nouns & Pronouns',
    color: '#5B8C5A',
    items: [
      { key: 'Countable vs Uncountable', label: '可數/不可數 Countable vs Uncountable' },
      { key: 'Articles', label: '冠詞 Articles' },
      { key: 'Pronoun Reference', label: '代名詞指代 Pronoun Reference' },
      { key: 'Nominalization', label: '名詞化 Nominalization' }
    ]
  },
  {
    key: '修飾語類',
    label: '修飾語類 Modifiers',
    color: '#8E5572',
    items: [
      { key: 'Preposition', label: '介詞 Preposition' },
      { key: 'Adjective vs Adverb', label: '形容詞/副詞 Adjective vs Adverb' },
      { key: 'Comparatives & Superlatives', label: '比較級/最高級 Comparatives & Superlatives' },
      { key: 'Relative Clauses', label: '關係子句 Relative Clauses' }
    ]
  },
  {
    key: '連接與邏輯類',
    label: '連接與邏輯類 Connectors & Logic',
    color: '#C98A2C',
    items: [
      { key: 'Conjunction', label: '連接詞 Conjunction' },
      { key: 'Subordinating Conjunctions', label: '從屬連接詞 Subordinating Conjunctions' },
      { key: 'Discourse Markers', label: '轉折詞 Discourse Markers' },
      { key: 'Conditional Sentences', label: '條件句 Conditional Sentences' }
    ]
  },
  {
    key: '詞彙類',
    label: '詞彙類 Vocabulary',
    color: '#3F7D5C',
    items: [
      { key: 'Word Form', label: '詞性轉換 Word Form' },
      { key: 'Collocations', label: '搭配詞 Collocations' },
      { key: 'Academic Register', label: '學術語域 Academic Register' },
      { key: 'Paraphrasing', label: '同義字替換 Paraphrasing' }
    ]
  }
];

export const PRIMARY_COLOR = '#2C3E7A';
