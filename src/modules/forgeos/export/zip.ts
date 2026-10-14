import { zipSync, unzipSync, type Zippable } from "fflate";
import type { FileMap } from "./common";

// Fixed timestamp + sorted entries => identical bytes for identical input.
const FIXED_MTIME = new Date(Date.UTC(2000, 0, 1, 0, 0, 0));

export function deterministicZip(files: FileMap): Uint8Array {
  const tree: Zippable = {};
  for (const path of [...files.keys()].sort()) tree[path] = [files.get(path)!, { mtime: FIXED_MTIME, level: path.endsWith(".png") || path.endsWith(".zip") ? 0 : 6 }];
  return zipSync(tree, { mtime: FIXED_MTIME });
}

export function readZip(bytes: Uint8Array): FileMap {
  return new Map(Object.entries(unzipSync(bytes)));
}
