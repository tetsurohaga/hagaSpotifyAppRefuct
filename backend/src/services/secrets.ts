// SSM パラメータストアからシークレットを取得する（既存 get_secrets.py 相当）。
// Lambda 実行中はメモリにキャッシュし、コールドスタート以外は SSM を再呼び出ししない。

import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { REGION, SSM_PARAMS } from "../config.js";

const ssm = new SSMClient({ region: REGION });

const cache = new Map<string, string>();

/** 単一パラメータを WithDecryption で取得（キャッシュ付き）。 */
export async function getSecret(name: string): Promise<string> {
  const cached = cache.get(name);
  if (cached !== undefined) return cached;

  const res = await ssm.send(
    new GetParameterCommand({ Name: name, WithDecryption: true }),
  );
  const value = res.Parameter?.Value;
  if (value === undefined) {
    throw new Error(`SSM parameter not found or empty: ${name}`);
  }
  cache.set(name, value);
  return value;
}

export const getSpotifyClientId = () => getSecret(SSM_PARAMS.spotifyClientId);
export const getSpotifyClientSecret = () =>
  getSecret(SSM_PARAMS.spotifyClientSecret);
export const getSpotifyRedirectUri = () =>
  getSecret(SSM_PARAMS.spotifyRedirectUri);
export const getClaudeApiKey = () => getSecret(SSM_PARAMS.claudeApiKey);
