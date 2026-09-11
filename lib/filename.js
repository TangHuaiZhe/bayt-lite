export function decodeMultipartFilename(filename) {
  const decoded = Buffer.from(filename, "latin1").toString("utf8");
  const roundTrips = Buffer.from(decoded, "utf8").toString("latin1") === filename;
  return !decoded.includes("\uFFFD") && roundTrips ? decoded : filename;
}
