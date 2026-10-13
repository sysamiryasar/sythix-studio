import { realpath, lstat } from "node:fs/promises";
import path from "node:path";
import { Rejected } from "./protocol.js";

/**
 * Resolves `relative` inside `root` and refuses anything that escapes it,
 * including via symlinks. Returns the absolute path.
 */
export async function resolveInside(root: string, relative: string, { mustExist = true } = {}): Promise<string> {
  if (path.isAbsolute(relative) || relative.split(/[\\/]/).includes("..") || relative.includes("\0")) throw new Rejected("Path escapes the allowed directory");
  const realRoot = await realpath(root);
  const target = path.resolve(realRoot, relative);
  if (target !== realRoot && !target.startsWith(realRoot + path.sep)) throw new Rejected("Path escapes the allowed directory");
  try {
    const st = await lstat(target);
    if (st.isSymbolicLink()) throw new Rejected("Symbolic links are not followed");
    const real = await realpath(target);
    if (real !== realRoot && !real.startsWith(realRoot + path.sep)) throw new Rejected("Path escapes the allowed directory");
  } catch (err) {
    if (err instanceof Rejected) throw err;
    if (mustExist) throw new Rejected("File not found");
  }
  return target;
}
