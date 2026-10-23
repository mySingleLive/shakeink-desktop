export interface ModelEndpointOptions {
  provider: string
  protocol: string
  kind: string
}

/** Resolve the request prefix without rewriting the saved credential scope.
 * Explicit API paths and non-OpenAI protocols retain their existing meaning.
 * The final gateway still validates the URL and authorizes each request.
 */
export function normalizeModelEndpoint(endpoint: string, options: ModelEndpointOptions): string {
  if (options.provider !== "custom" || options.protocol !== "openai" || options.kind !== "TEXT") return endpoint
  const url = new URL(endpoint)
  if (url.pathname !== "/") return endpoint
  url.pathname = "/v1"
  return url.href
}
