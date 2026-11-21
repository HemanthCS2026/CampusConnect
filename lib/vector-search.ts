export type SparseVector = ReadonlyMap<string, number>;

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

function tokenize(text: string): string[] {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0 && !STOP_WORDS.has(token));
}

function termCounts(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

export function cosineSimilarity(
  left: SparseVector,
  right: SparseVector
): number {
  if (left.size === 0 || right.size === 0) return 0;

  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (const value of left.values()) {
    leftMagnitude += value * value;
  }
  for (const value of right.values()) {
    rightMagnitude += value * value;
  }

  const [smaller, larger] =
    left.size <= right.size ? [left, right] : [right, left];
  for (const [term, value] of smaller) {
    dotProduct += value * (larger.get(term) ?? 0);
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
  const similarity =
    dotProduct / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
  return Math.max(-1, Math.min(1, similarity));
}

export function rankTextByTfIdfCosine(
  queryText: string,
  candidateTexts: readonly string[]
): number[] {
  const tokenizedDocuments = [
    tokenize(queryText),
    ...candidateTexts.map(tokenize),
  ];
  const documentFrequencies = new Map<string, number>();

  for (const tokens of tokenizedDocuments) {
    for (const term of new Set(tokens)) {
      documentFrequencies.set(
        term,
        (documentFrequencies.get(term) ?? 0) + 1
      );
    }
  }

  const documentCount = tokenizedDocuments.length;
  const vectors = tokenizedDocuments.map((tokens) => {
    const vector = new Map<string, number>();
    for (const [term, count] of termCounts(tokens)) {
      const documentFrequency = documentFrequencies.get(term) ?? 0;
      const inverseDocumentFrequency =
        Math.log((documentCount + 1) / (documentFrequency + 1)) + 1;
      vector.set(
        term,
        (1 + Math.log(count)) * inverseDocumentFrequency
      );
    }
    return vector;
  });

  const queryVector = vectors[0];
  if (!queryVector || queryVector.size === 0) {
    return candidateTexts.map(() => 0);
  }

  return vectors.slice(1).map((vector) =>
    cosineSimilarity(queryVector, vector)
  );
}
