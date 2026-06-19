// DynamoDB `spotiapp_artists` の読み書き（既存 get_artist_info.py 相当）。
// 既存スキーマ準拠: genres は String Set（SS）で保持する。
// DocumentClient では JS の Set がそのまま SS にマーシャリングされる。

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { ARTISTS_TABLE, REGION } from "../config.js";

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});

/** 付箋。DynamoDB には sticky_notes マップ（{ ランダムID: { text, color } }）として保持する。 */
export type StickyNote = { id: string; text: string; color: string };

/** 付箋一覧を取得（未設定なら空配列）。 */
export async function getStickyNotes(artistId: string): Promise<StickyNote[]> {
  const res = await doc.send(
    new GetCommand({
      TableName: ARTISTS_TABLE,
      Key: { id: artistId },
      ConsistentRead: false,
      ProjectionExpression: "sticky_notes",
    }),
  );
  const map = res.Item?.sticky_notes as
    | Record<string, { text?: unknown; color?: unknown }>
    | undefined;
  if (!map || typeof map !== "object") return [];
  return Object.entries(map).map(([id, v]) => ({
    id,
    text: typeof v?.text === "string" ? v.text : "",
    color: typeof v?.color === "string" ? v.color : "#ffe14d",
  }));
}

/** 付箋を1枚追加（ランダムIDをキーに格納）。sticky_notes が無ければ空マップで初期化してから書く。 */
export async function addStickyNote(
  artistId: string,
  note: StickyNote,
): Promise<void> {
  // 1) sticky_notes 未設定なら空マップで初期化（if_not_exists はアトミック・冪等）。
  await doc.send(
    new UpdateCommand({
      TableName: ARTISTS_TABLE,
      Key: { id: artistId },
      UpdateExpression: "SET sticky_notes = if_not_exists(sticky_notes, :empty)",
      ExpressionAttributeValues: { ":empty": {} },
    }),
  );
  // 2) ランダムID（属性名）をキーに { text, color } を格納。
  await doc.send(
    new UpdateCommand({
      TableName: ARTISTS_TABLE,
      Key: { id: artistId },
      UpdateExpression: "SET sticky_notes.#nid = :note",
      ExpressionAttributeNames: { "#nid": note.id },
      ExpressionAttributeValues: {
        ":note": { text: note.text, color: note.color },
      },
    }),
  );
}

/** 付箋を1枚削除。 */
export async function deleteStickyNote(
  artistId: string,
  noteId: string,
): Promise<void> {
  await doc.send(
    new UpdateCommand({
      TableName: ARTISTS_TABLE,
      Key: { id: artistId },
      UpdateExpression: "REMOVE sticky_notes.#nid",
      ExpressionAttributeNames: { "#nid": noteId },
    }),
  );
}

/** キャッシュ済み解説を取得。無ければ null。 */
export async function getBiography(artistId: string): Promise<string | null> {
  const res = await doc.send(
    new GetCommand({
      TableName: ARTISTS_TABLE,
      Key: { id: artistId },
      ConsistentRead: false,
      ProjectionExpression: "biography",
    }),
  );
  const bio = res.Item?.biography;
  return typeof bio === "string" ? bio : null;
}

/** 新規アーティストを登録。genres は SS で保存。
 *  Put（全置換）ではなく Update を使い、既に貼られている sticky_notes を消さない。 */
export async function registerArtist(params: {
  id: string;
  artistName: string;
  biography: string;
  genres: string[];
  timestamp: string;
}): Promise<void> {
  // DynamoDB の Set は空を許さない。空ジャンルは呼び出し側でフォールバック済みだが念のため保証。
  const genres = params.genres.length > 0 ? params.genres : ["genres undefined"];
  await doc.send(
    new UpdateCommand({
      TableName: ARTISTS_TABLE,
      Key: { id: params.id },
      UpdateExpression:
        "SET artist_name = :n, biography = :b, genres = :g, registration_timestamp = :rt, request_count = if_not_exists(request_count, :one)",
      ExpressionAttributeValues: {
        ":n": params.artistName,
        ":b": params.biography,
        ":g": new Set(genres),
        ":rt": Number(params.timestamp),
        ":one": 1,
      },
    }),
  );
}

/** 再生成時の更新（biography と registration_timestamp）。 */
export async function updateBiography(
  artistId: string,
  biography: string,
  timestamp: string,
): Promise<void> {
  await doc.send(
    new UpdateCommand({
      TableName: ARTISTS_TABLE,
      Key: { id: artistId },
      UpdateExpression: "SET biography = :bio, registration_timestamp = :rt",
      ExpressionAttributeValues: {
        ":bio": biography,
        ":rt": Number(timestamp),
      },
    }),
  );
}
