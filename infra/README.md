# infra — AWS CDK

S3 + CloudFront + Lambda Function URL + Lambda を定義。DynamoDB `spotiapp_artists` は
**import のみ**（新規作成しない）。リージョン: ap-northeast-1。

## 前提

- AWS 認証情報（プロファイル `hagauser1`）
- 先に **フロントをビルド**しておく（`BucketDeployment` が `frontend/build` を配置するため）:
  ```sh
  cd ../frontend && npm install && npm run build
  ```
- SSM パラメータ（SecureString）:
  - `/hagawork/SPOTIFY_CLIENT_ID`（既存）
  - `/hagawork/SPOTIFY_CLIENT_SECRET`（既存）
  - `/hagawork/CLAUDE_API_KEY`（新規作成。後述）
  - `/hagawork/SPOTIFY_REDIRECT_URI`（**デプロイ後**に確定する CloudFront ドメインで設定）

## デプロイ手順

```sh
cd infra && npm install

# 初回のみ
AWS_PROFILE=hagauser1 npx cdk bootstrap

# デプロイ（S3/CloudFront/Lambda Function URL/Lambda 作成 + フロント配置）
AWS_PROFILE=hagauser1 npx cdk deploy
```

出力 `CloudFrontURL` がアプリの URL。続けて:

```sh
# 1) Redirect URI を SSM に登録（<domain> は CloudFrontURL のホスト）
AWS_PROFILE=hagauser1 aws ssm put-parameter \
  --name /hagawork/SPOTIFY_REDIRECT_URI --type SecureString --overwrite \
  --value 'https://<domain>/api/callback' --region ap-northeast-1

# 2) Spotify Developer Dashboard の Redirect URIs に
#    https://<domain>/api/callback を追加（ユーザー作業）
```

CLAUDE_API_KEY の登録（初回）:

```sh
AWS_PROFILE=hagauser1 aws ssm put-parameter \
  --name /hagawork/CLAUDE_API_KEY --type SecureString \
  --value '<CLAUDE_API_KEY>' --region ap-northeast-1
```

## 更新デプロイ

```sh
cd ../frontend && npm run build       # フロント変更時
cd ../infra && AWS_PROFILE=hagauser1 npx cdk deploy
```

## 片付け

```sh
AWS_PROFILE=hagauser1 npx cdk destroy
```

> DynamoDB テーブルは import のため destroy では削除されない（意図どおり）。
