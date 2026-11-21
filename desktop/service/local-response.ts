/** docs/567 3R: a work's database scope is held only while its response body can still be produced.
 * Plain (JSON, empty, small binary) bodies are read in full inside the scope, so the scope ends when the
 * headers are sent instead of when the window finishes reading. Streams keep the original lifetime. */
export const LOCAL_RESPONSE_BUFFER_LIMIT = 8 * 1024 * 1024

export function isStreamingResponse(response: Response): boolean {
  const type = (response.headers.get("content-type") ?? "").toLowerCase()
  // Event streams (chat, chapter generation) and AI SDK text streams (`text/plain; charset=utf-8`).
  return type.includes("text/event-stream") || type.startsWith("text/plain")
}

/** Reads a non-streaming body up to the limit. Returns a reader over the buffered bytes, or the original
 * reader (with the bytes already read put back in front) when the body is larger than the limit. */
export async function bufferResponse(response: Response, limit = LOCAL_RESPONSE_BUFFER_LIMIT): Promise<{ reader: ReadableStreamDefaultReader<Uint8Array>; buffered: boolean }> {
  const source = (response.body ?? new ReadableStream<Uint8Array>({ start(controller) { controller.close() } })).getReader()
  if (isStreamingResponse(response)) return { reader: source, buffered: false }
  const chunks: Uint8Array[] = []
  let length = 0
  for (;;) {
    const chunk = await source.read()
    if (chunk.done) break
    chunks.push(chunk.value); length += chunk.value.byteLength
    if (length > limit) {
      // Too large to hold: hand back a reader that yields what was read, then the rest of the source.
      let index = 0
      const rest = new ReadableStream<Uint8Array>({
        async pull(controller) {
          if (index < chunks.length) { controller.enqueue(chunks[index++]); return }
          const next = await source.read()
          if (next.done) controller.close(); else controller.enqueue(next.value)
        },
        async cancel(reason) { await source.cancel(reason) },
      })
      return { reader: rest.getReader(), buffered: false }
    }
  }
  source.releaseLock()
  let index = 0
  const buffered = new ReadableStream<Uint8Array>({
    pull(controller) { if (index < chunks.length) controller.enqueue(chunks[index++]); else controller.close() },
  })
  return { reader: buffered.getReader(), buffered: true }
}
