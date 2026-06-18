// DynamoDB `spotiapp_artists` の読み書き（既存 get_artist_info.py 相当）。
// 既存スキーマ準拠: genres は String Set（SS）で保持する。
// DocumentClient では JS の Set がそのまま SS にマーシャリングされる。

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { ARTISTS_TABLE, REGION } from "../config.js";

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});

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

/** 新規アーティストを登録（request_count = 1）。genres は SS で保存。 */
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
    new PutCommand({
      TableName: ARTISTS_TABLE,
      Item: {
        id: params.id,
        artist_name: params.artistName,
        biography: params.biography,
        genres: new Set(genres),
        registration_timestamp: Number(params.timestamp),
        request_count: 1,
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
