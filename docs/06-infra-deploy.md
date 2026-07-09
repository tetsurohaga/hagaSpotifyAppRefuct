# 06. インフラ・デプロイ

IaC は AWS CDK（TypeScript）。リージョンは ap-northeast-1。

> **AWS構成図（正式版）は [`docs/architecture.drawio`](./architecture.drawio)**（画像版 [`architecture.png`](./architecture.png)）。
> 本章の各リソースの全体関係はこの図を参照。図は draw.io で編集する。

## 6.1 AWS リソース一覧

| リソース | 用途 | 備考 |
| --- | --- | --- |
| S3 バケット | SvelteKit 静的ビルド配置 | 非公開。OAC で CloudFront からのみ参照 |
| CloudFront ディストリビューション | 配信・単一ドメイン化 | 標準ドメイン（`*.cloudfront.net`）でまず運用 |
| Lambda 関数 | API（TypeScript/Hono） | Node.js 20、メモリ 256–512MB、タイムアウト 120s |
| Lambda Function URL | Lambda 公開 | CloudFront の `/api/*` オリジン（`authType=NONE`、Cookie 認証で保護） |
| DynamoDB テーブル（既存） | `spotiapp_artists` | **import のみ**。新規作成しない |
| SSM パラメータ（既存+新規） | シークレット | 下記 6.4 |
| IAM ロール（Lambda 実行） | 権限 | DynamoDB / SSM 最小権限 |

## 6.2 CloudFront ビヘイビア

| パスパターン | オリジン | 備考 |
| --- | --- | --- |
| `/api/*` | Lambda Function URL | Cookie / クエリ / 必要ヘッダをフォワード。キャッシュ無効 |
| デフォルト `*` | S3（OAC） | 静的アセット。`index.html` フォールバック（SPA） |

- `/api/*` ビヘイビア:
  - キャッシュポリシー: `CachingDisabled`。
  - オリジンリクエストポリシー: Cookie 全転送・QueryString 全転送・必要ヘッダ転送
    （`AllViewerExceptHostHeader` 相当を使用）。
- SPA フォールバック: S3 に存在しないパス（`/now-playing` 等）で `index.html` を返すよう
  カスタムエラーレスポンス（403/404 → `/index.html`、ステータス 200）を設定。
- HTTPS: CloudFront 標準ドメインは HTTPS。`Secure` Cookie が機能する。

## 6.3 Lambda

- ハンドラ: `hono/aws-lambda` の `handle(app)`。
- バンドル: `aws-cdk-lib/aws-lambda-nodejs`（`NodejsFunction`、esbuild バンドル）を推奨。
  `@anthropic-ai/sdk` / `@aws-sdk/*` を含めてビルド。
- 環境変数（非機密のみ。機密は SSM 参照）:
  - `AWS_REGION`（既定で利用可）
  - `ARTISTS_TABLE=spotiapp_artists`
  - `SPOTIFY_SCOPE=user-read-private user-read-email user-read-currently-playing`
  - `FRONTEND_REDIRECT_PATH=/now-playing`（callback 後の遷移先）
- 実行ロール権限:
  - `ssm:GetParameter`（`/hagawork/*` または個別パラメータ ARN）+ KMS 復号（SecureString 用）。
  - `dynamodb:GetItem|PutItem|UpdateItem`（`spotiapp_artists` の ARN）。

## 6.4 シークレット / SSM パラメータ

| パラメータ | 状態 | 値 |
| --- | --- | --- |
| `/hagawork/SPOTIFY_CLIENT_ID` | 既存 | そのまま |
| `/hagawork/SPOTIFY_CLIENT_SECRET` | 既存 | そのまま |
| `/hagawork/SPOTIFY_REDIRECT_URI` | **要設定** | `https://<cloudfrontドメイン>/api/callback` |
| `/hagawork/CLAUDE_API_KEY` | **新規作成** | 提供済み Claude API キー（SecureString） |
| `/hagawork/PERPLEXITY_KEY` | 不使用 | 削除不要（参照しないだけ） |

手順上の注意:
- CloudFront ドメインはデプロイ後に確定するため、**初回デプロイ → ドメイン確定 →
  `SPOTIFY_REDIRECT_URI` 設定 → Spotify ダッシュボードにリダイレクト URI 登録** の順になる。
- Spotify Developer Dashboard で、対象アプリの「Redirect URIs」に
  `https://<cloudfrontドメイン>/api/callback` を追加すること（ユーザー作業）。

### Claude API キーの登録（例）

```sh
aws ssm put-parameter \
  --name /hagawork/CLAUDE_API_KEY \
  --type SecureString \
  --value '<CLAUDE_API_KEY>' \
  --region ap-northeast-1
```

> セッション内で実行する場合はプロンプトに `! aws ssm put-parameter ...` と入力すると、
> 出力をそのまま取り込めます（インタラクティブ認証が必要な場合も同様に `!` プレフィックスで実行）。

## 6.5 デプロイ手順（概要）

```
# 1. フロントビルド
cd frontend && npm install && npm run build      # → frontend/build

# 2. インフラ（初回）
cd ../infra && npm install
npx cdk bootstrap                                 # 初回のみ
npx cdk deploy                                    # S3/CloudFront/Lambda Function URL/Lambda 作成

# 3. ビルド成果物を S3 へ同期（CDK の BucketDeployment で自動化推奨）
#    → CDK スタックに s3deploy.BucketDeployment を含め、cdk deploy で配置

# 4. CloudFront ドメイン確認 → SSM の SPOTIFY_REDIRECT_URI 設定
#    → Spotify ダッシュボードに Redirect URI 登録

# 5. 動作確認
```

- CDK スタックに `aws-s3-deployment.BucketDeployment` を含め、`frontend/build` を
  デプロイ時に S3 へ配置＋CloudFront を invalidation する構成にすると運用が楽。
- バックエンドの Lambda コードは `NodejsFunction` が `cdk deploy` 時に自動バンドルする。

## 6.6 ローカル開発（任意）

- フロント: `npm run dev`（Vite）。API は CloudFront 経由ではないため、開発時は
  Vite の `server.proxy` で `/api` を後述のローカル API かデプロイ済み API に向ける。
- バックエンド: Hono は `@hono/node-server` でローカル起動可能。Spotify Redirect URI に
  `http://localhost:5173/api/callback` 等を別途登録すればローカルでも OAuth 確認可能（任意）。
- まずはデプロイ環境で通すことを優先し、ローカル整備は後回しで良い。
