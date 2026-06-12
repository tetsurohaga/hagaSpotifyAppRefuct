export type Track = {
  artists: string[];
  track: string;
  image: string;
};

export type Artist = {
  id: string;
  name: string;
  image: string;
  genres: string[];
  description: string | null; // Markdown 文字列。null は未生成（フロントで個別生成する）
  knowmore: string;
};
