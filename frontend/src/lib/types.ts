export type Track = {
  artists: string[];
  track: string;
  image: string;
};

// 付箋。ランダムID + 80文字以内メッセージ + 色。アーティスト単位で DynamoDB に永続化。
export type StickyNote = {
  id: string;
  text: string;
  color: string;
};

export type Artist = {
  id: string;
  name: string;
  image: string;
  genres: string[];
  description: string | null; // Markdown 文字列。null は未生成（フロントで個別生成する）
  knowmore: string;
  stickyNotes: StickyNote[]; // 既に貼られている付箋（このアーティストの分）
};
