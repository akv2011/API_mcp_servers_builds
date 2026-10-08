// isError on the result, not on a content item, is what tells the model the call failed.
export function toolError(text: string) {
  return { content: [{ type: 'text' as const, text }], isError: true };
}
