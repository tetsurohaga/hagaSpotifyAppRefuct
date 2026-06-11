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
  description: string; // Markdown 文字列
  knowmore: string;
};
