// Audit reports are uploadable; raw transport headers and credentials are not.
export function lighthouseReport(result: unknown, secrets: readonly string[]) {
  let json = JSON.stringify(result, (key, value) =>
    /^(?:.*headers|.*cookies?|authorization|password|token)$/i.test(key)
      ? undefined
      : value,
  );
  for (const secret of secrets.filter(Boolean)) {
    json = json.replaceAll(JSON.stringify(secret).slice(1, -1), "[redacted]");
    json = json.replaceAll(encodeURIComponent(secret), "[redacted]");
  }
  return json;
}
