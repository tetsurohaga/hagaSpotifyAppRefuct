# 05. データモデル（DynamoDB）

既存テーブル `spotiapp_artists` を**そのまま流用**する（既にデータが入っているため、
新規作成・スキーマ変更はしない）。

## 5.1 テーブル: `spotiapp_artists`

- リージョン: ap-northeast-1
- パーティションキー: `id`（String）= Spotify アーティストID
- ソートキーなし

### 属性

| 属性 | 型 | 説明 |
| --- | --- | --- |
| `id` | S | Spotify アーティストID（PK） |
| `artist_name` | S | アーティスト名 |
| `biography` | S | 生成された解説（**新仕様では Markdown 文字列**） |
| `genres` | SS | ジャンル（**String Set**） |
| `registration_timestamp` | N | 登録/更新時の UNIX 秒（文字列の数値） |
| `request_count` | N | リクエスト回数（新規登録時 `1`） |

> **既存スキーマ準拠の注意点**
> - `genres` は **String Set（SS）**。空配列は不可（DynamoDB の Set は空を許さない）ため、
>   空ジャンル時は `["genres undefined"]` を入れる（既存挙動）。
> - `registration_timestamp` / `request_count` は数値型（N）。`Date.now()/1000` を整数文字列で。
> - `biography` には Markdown を保存する。既存の（Perplexity 由来）プレーンテキストのレコードが
>   混在するが、フロントの Markdown 描画はプレーンテキストもそのまま表示できるため互換性に問題なし。

## 5.2 アクセスパターン

| 操作 | API | DynamoDB 操作 |
| --- | --- | --- |
| 解説キャッシュ参照 | `GET /api/artist-profile` | `GetItem`（`id`、`ProjectionExpression=biography`） |
| 新規登録 | `GET /api/artist-profile`（未キャッシュ時） | `PutItem` |
| 再生成更新 | `GET /api/regenerate-biography` | `UpdateItem`（`SET biography, registration_timestamp`） |

### 書き込み例（低レベル属性表現）

PutItem:
```json
{
  "id": { "S": "artistId" },
  "artist_name": { "S": "Artist Name" },
  "biography": { "S": "## 概要 ..." },
  "genres": { "SS": ["j-pop", "city pop"] },
  "registration_timestamp": { "N": "1718000000" },
  "request_count": { "N": "1" }
}
```

UpdateItem:
```
UpdateExpression: SET biography = :bio, registration_timestamp = :rt
ExpressionAttributeValues:
  :bio = { "S": "## 概要 ..." }
  :rt  = { "N": "1718000000" }
```

## 5.3 SDK 実装メモ

- `@aws-sdk/lib-dynamodb` の `DynamoDBDocumentClient` を使う場合、Set は `new Set([...])` で表現する
  （マーシャリングオプション `removeUndefinedValues: true` を推奨）。
- もしくは `@aws-sdk/client-dynamodb` の低レベル API で上記の `{ S }`/`{ N }`/`{ SS }` を直接指定。
- Lambda 実行ロールに以下を最小権限で付与（[06](./06-infra-deploy.md)）:
  - `dynamodb:GetItem`, `dynamodb:PutItem`, `dynamodb:UpdateItem`（対象テーブル ARN に限定）。

## 5.4 IaC での扱い

- このテーブルは **CDK で新規作成しない**。既存リソースを参照する:
  - `dynamodb.Table.fromTableName(this, "ArtistsTable", "spotiapp_artists")` で import し、
    Lambda にアクセス権を grant する。
  - CDK の管理対象に含めない（誤って削除・置換しないため `RemovalPolicy` 設定対象にしない）。
