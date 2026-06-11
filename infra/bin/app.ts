#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { SpotifyAppStack } from "../lib/spotify-app-stack";

const app = new cdk.App();

new SpotifyAppStack(app, "SpotifyAppStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "ap-northeast-1",
  },
  description: "Spotify Now Playing app (S3+CloudFront+APIGW+Lambda, DynamoDB import)",
});
