import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";

const ARTISTS_TABLE = "spotiapp_artists";

export class SpotifyAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // --- S3: 静的ビルド配置（非公開。OAC で CloudFront からのみ参照） ---
    const siteBucket = new s3.Bucket(this, "SiteBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // --- Lambda: backend(TypeScript/Hono) を esbuild バンドル ---
    const apiFn = new NodejsFunction(this, "ApiFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, "../../backend/src/index.ts"),
      handler: "handler",
      depsLockFilePath: path.join(__dirname, "../../backend/package-lock.json"),
      memorySize: 512,
      // Function URL 経由で同期実行する。Claude 解説生成の余裕として 120s に設定
      // （CloudFront オリジン応答上限と合わせる）。
      timeout: cdk.Duration.seconds(120),
      environment: {
        ARTISTS_TABLE,
        SPOTIFY_SCOPE:
          "user-read-private user-read-email user-read-currently-playing",
        FRONTEND_REDIRECT_PATH: "/now-playing",
      },
      bundling: {
        format: OutputFormat.ESM,
        target: "node20",
        minify: false,
        // ESM 出力で一部 CJS 依存が require/__dirname を参照する場合の保険。
        banner:
          "import{createRequire}from'module';import{fileURLToPath}from'url';import{dirname}from'path';const require=createRequire(import.meta.url);const __filename=fileURLToPath(import.meta.url);const __dirname=dirname(__filename);",
      },
    });

    // --- DynamoDB: 既存テーブルを import（新規作成しない）し、最小権限を grant ---
    const artistsTable = dynamodb.Table.fromTableName(
      this,
      "ArtistsTable",
      ARTISTS_TABLE,
    );
    artistsTable.grant(
      apiFn,
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
    );

    // --- SSM: /hagawork/* の SecureString 取得 + KMS 復号 ---
    apiFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameter"],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/hagawork/*`,
        ],
      }),
    );
    apiFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["kms:Decrypt"],
        // SecureString は既定の aws/ssm マネージドキー。アカウント内の KMS 復号を許可。
        resources: ["*"],
      }),
    );

    // --- Lambda Function URL: Lambda を直接公開（CloudFront の /api/* オリジン） ---
    // 同期実行で最大 120s まで処理できるよう Function URL を採用。
    // authType=NONE で公開し、アプリ側 Cookie 認証で保護する。
    const fnUrl = apiFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    });
    // CloudFront オリジン用にホスト名のみ取り出す（"https://" と末尾 "/" を除去）。
    const apiDomain = cdk.Fn.select(2, cdk.Fn.split("/", fnUrl.url));

    // --- CloudFront: 単一ドメイン。デフォルト→S3、/api/*→Lambda Function URL ---
    const distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy:
          cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
      additionalBehaviors: {
        "/api/*": {
          origin: new origins.HttpOrigin(apiDomain, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
            // オリジン応答タイムアウトを最大の 120s に拡張（Claude 生成の余裕）。
            readTimeout: cdk.Duration.seconds(120),
          }),
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          // Cookie / クエリ / ヘッダを転送（Host は除外。Function URL は自身の Host が必要）。
          originRequestPolicy:
            cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      // SPA フォールバック: S3 に無いパス（/now-playing 等）は index.html を 200 で返す。
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
        },
      ],
    });

    // --- フロントビルドを S3 へ配置 + CloudFront invalidation ---
    new s3deploy.BucketDeployment(this, "DeployFrontend", {
      sources: [
        s3deploy.Source.asset(path.join(__dirname, "../../frontend/build")),
      ],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ["/*"],
    });

    // --- 出力 ---
    new cdk.CfnOutput(this, "CloudFrontURL", {
      value: `https://${distribution.distributionDomainName}`,
      description: "アプリのURL。Spotify Redirect URI は <これ>/api/callback",
    });
    new cdk.CfnOutput(this, "DistributionId", {
      value: distribution.distributionId,
    });
    new cdk.CfnOutput(this, "SiteBucketName", { value: siteBucket.bucketName });
    new cdk.CfnOutput(this, "ApiEndpoint", { value: fnUrl.url });
  }
}
