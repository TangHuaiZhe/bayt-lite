import path from "node:path";

export const dataDir = path.resolve(process.env.BAYT_DATA_DIR || "data");
export const dataPath = (...parts) => path.join(dataDir, ...parts);
