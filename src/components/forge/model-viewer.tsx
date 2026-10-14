"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCw, Sun } from "lucide-react";
import { cn } from "@/lib/cn";

type ModelElement = {
  from: [number, number, number];
  to: [number, number, number];
  rotation?: { origin: [number, number, number]; axis: "x" | "y" | "z"; angle: number };
  faces?: Record<string, { texture: string; uv?: [number, number, number, number] }>;
};

export type ViewerSource =
  | { kind: "sprite"; textureUrl: string }
  | { kind: "model"; model: { textures?: Record<string, string>; elements?: ModelElement[] }; textureUrls: Record<string, string> }
  | { kind: "none" };

// three's BoxGeometry face order: +x east, -x west, +y up, -y down, +z south, -z north.
const FACE_ORDER = ["east", "west", "up", "down", "south", "north"] as const;

function defaultUv(face: string, f: number[], t: number[]): [number, number, number, number] {
  switch (face) {
    case "north":
    case "south":
      return [f[0]!, 16 - t[1]!, t[0]!, 16 - f[1]!];
    case "east":
    case "west":
      return [f[2]!, 16 - t[1]!, t[2]!, 16 - f[1]!];
    default:
      return [f[0]!, f[2]!, t[0]!, t[2]!];
  }
}

/**
 * Real-time 3D preview with orbit, zoom and lighting controls.
 * - sprite: extrudes the texture's opaque pixels into voxels (how vanilla renders item/generated models).
 * - model: renders the uploaded model's elements, UVs and rotations.
 */
export function ModelViewer({ source, className }: { source: ViewerSource; className?: string }) {
  const mount = useRef<HTMLDivElement>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [light, setLight] = useState(1.2);
  const [error, setError] = useState<string | null>(null);
  const controlsRef = useRef<{ autoRotate: boolean } | null>(null);
  const lightRef = useRef<{ intensity: number } | null>(null);

  useEffect(() => {
    if (controlsRef.current) controlsRef.current.autoRotate = autoRotate;
  }, [autoRotate]);
  useEffect(() => {
    if (lightRef.current) lightRef.current.intensity = light;
  }, [light]);

  useEffect(() => {
    if (source.kind === "none" || !mount.current) return;
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      if (disposed || !mount.current) return;
      const el = mount.current;
      const w = el.clientWidth;
      const h = el.clientHeight;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h);
      el.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40, w / h, 0.01, 100);
      camera.position.set(1.4, 1.0, 1.8);
      scene.add(new THREE.AmbientLight(0xffffff, 0.55));
      const dir = new THREE.DirectionalLight(0xffffff, light);
      dir.position.set(2, 3, 2);
      scene.add(dir);
      lightRef.current = dir;
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.autoRotate = autoRotate;
      controls.autoRotateSpeed = 1.5;
      controls.minDistance = 0.5;
      controls.maxDistance = 6;
      controlsRef.current = controls;
      const group = new THREE.Group();
      scene.add(group);

      const loader = new THREE.TextureLoader();
      const loadTex = (url: string) =>
        new Promise<InstanceType<typeof THREE.Texture>>((resolve, reject) =>
          loader.load(
            url,
            (t) => {
              t.magFilter = THREE.NearestFilter;
              t.minFilter = THREE.NearestFilter;
              t.colorSpace = THREE.SRGBColorSpace;
              resolve(t);
            },
            undefined,
            reject,
          ),
        );

      try {
        if (source.kind === "sprite") {
          const tex = await loadTex(source.textureUrl);
          const img = tex.image as HTMLImageElement;
          const canvas = document.createElement("canvas");
          const size = Math.min(img.width, 64);
          canvas.width = size;
          canvas.height = size;
          const c2d = canvas.getContext("2d")!;
          c2d.imageSmoothingEnabled = false;
          c2d.drawImage(img, 0, 0, size, size);
          const px = c2d.getImageData(0, 0, size, size).data;
          const voxels: [number, number, number][] = [];
          for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (px[(y * size + x) * 4 + 3]! > 8) voxels.push([x, y, (y * size + x) * 4]);
          const s = 1 / size;
          const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(s, s, s), new THREE.MeshLambertMaterial(), voxels.length);
          const m = new THREE.Matrix4();
          const color = new THREE.Color();
          voxels.forEach(([x, y, i], idx) => {
            m.makeTranslation((x + 0.5) * s - 0.5, 0.5 - (y + 0.5) * s, 0);
            mesh.setMatrixAt(idx, m);
            color.setRGB(px[i]! / 255, px[i + 1]! / 255, px[i + 2]! / 255, THREE.SRGBColorSpace);
            mesh.setColorAt(idx, color);
          });
          group.add(mesh);
        } else if (source.kind === "model") {
          const vars = source.model.textures ?? {};
          const resolveVar = (ref: string, depth = 0): string | undefined => {
            if (depth > 8) return undefined;
            const v = vars[ref.replace(/^#/, "")];
            if (!v) return undefined;
            return v.startsWith("#") ? resolveVar(v, depth + 1) : v;
          };
          const cache = new Map<string, InstanceType<typeof THREE.Texture>>();
          for (const name of new Set(Object.values(vars).filter((v) => !v.startsWith("#")))) {
            const url = source.textureUrls[name];
            if (url) cache.set(name, await loadTex(url));
          }
          const missing = new THREE.MeshLambertMaterial({ color: 0xff00ff });
          for (const e of source.model.elements ?? []) {
            const size = [0, 1, 2].map((i) => Math.max((e.to[i]! - e.from[i]!) / 16, 0.001));
            const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
            const uv = geo.getAttribute("uv");
            const materials = FACE_ORDER.map((face, fi) => {
              const def = e.faces?.[face];
              if (!def) return new THREE.MeshBasicMaterial({ visible: false });
              const tex = cache.get(resolveVar(def.texture) ?? "");
              const [u1, v1, u2, v2] = def.uv ?? defaultUv(face, e.from, e.to);
              const base = fi * 4;
              uv.setXY(base + 0, u1 / 16, 1 - v1 / 16);
              uv.setXY(base + 1, u2 / 16, 1 - v1 / 16);
              uv.setXY(base + 2, u1 / 16, 1 - v2 / 16);
              uv.setXY(base + 3, u2 / 16, 1 - v2 / 16);
              return tex ? new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.1 }) : missing;
            });
            uv.needsUpdate = true;
            const mesh = new THREE.Mesh(geo, materials);
            const center = [0, 1, 2].map((i) => (e.from[i]! + e.to[i]!) / 32 - 0.5);
            if (e.rotation) {
              const pivot = new THREE.Group();
              const o = e.rotation.origin.map((v) => v / 16 - 0.5);
              pivot.position.set(o[0]!, o[1]!, o[2]!);
              mesh.position.set(center[0]! - o[0]!, center[1]! - o[1]!, center[2]! - o[2]!);
              pivot.rotation[e.rotation.axis] = THREE.MathUtils.degToRad(e.rotation.angle);
              pivot.add(mesh);
              group.add(pivot);
            } else {
              mesh.position.set(center[0]!, center[1]!, center[2]!);
              group.add(mesh);
            }
          }
        }
      } catch {
        setError("Preview unavailable: a texture could not be loaded.");
      }

      let raf = 0;
      const tick = () => {
        controls.update();
        renderer.render(scene, camera);
        raf = requestAnimationFrame(tick);
      };
      tick();
      const onResize = () => {
        const nw = el.clientWidth;
        const nh = el.clientHeight;
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh);
      };
      const ro = new ResizeObserver(onResize);
      ro.observe(el);
      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        controls.dispose();
        renderer.dispose();
        scene.traverse((o) => {
          const mesh = o as { geometry?: { dispose(): void } };
          mesh.geometry?.dispose();
        });
        renderer.domElement.remove();
      };
    })();
    return () => {
      disposed = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- controls/light are applied via refs
  }, [JSON.stringify(source)]);

  return (
    <div className={cn("relative overflow-hidden rounded-lg border border-border bg-[radial-gradient(circle_at_50%_40%,rgb(139_92_246/0.15),transparent_70%)] sx-voxel-grid", className)}>
      <div ref={mount} className="h-full w-full" role="img" aria-label="3D item preview. Drag to orbit, scroll to zoom." />
      {source.kind === "none" && <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-muted">No custom texture or model — the item uses its vanilla look.</div>}
      {error && <div className="absolute inset-x-0 bottom-10 text-center text-xs text-warning">{error}</div>}
      {source.kind !== "none" && (
        <div className="absolute bottom-2 left-2 right-2 flex items-center gap-3 rounded-md border border-border bg-surface/80 px-2 py-1 text-[11px] text-muted backdrop-blur">
          <button className={cn("flex items-center gap-1", autoRotate && "text-accent")} onClick={() => setAutoRotate((v) => !v)} aria-pressed={autoRotate}>
            <RotateCw className="h-3 w-3" /> Rotate
          </button>
          <label className="flex flex-1 items-center gap-1.5">
            <Sun className="h-3 w-3" />
            <span className="sr-only">Light intensity</span>
            <input type="range" min={0} max={3} step={0.1} value={light} onChange={(e) => setLight(Number(e.target.value))} className="w-full accent-[var(--sx-accent)]" />
          </label>
          <span className="hidden sm:inline">Drag · Scroll</span>
        </div>
      )}
    </div>
  );
}
