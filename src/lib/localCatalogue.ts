import { readFile } from "node:fs/promises";
import path from "node:path";

// Reads the bundled partly-api dataset straight off disk instead of hitting
// the FastAPI service over HTTP — removes the separate-service dependency
// for deployment, where localhost:8420 isn't reachable.
const DATA_ROOT = path.join(process.cwd(), "partly-api", "data");

export async function readAssemblies(slug: string): Promise<{ assemblies?: Record<string, any> }> {
    const file = path.join(DATA_ROOT, "vehicles", slug, "assemblies.json");
    const raw = await readFile(file, "utf-8");
    return JSON.parse(raw).completed;
}

export async function readAnnotations(slug: string, diagramId: string): Promise<{ objects?: any[] }> {
    const file = path.join(DATA_ROOT, "vehicles", slug, "diagrams", diagramId, "annotations.json");
    const raw = await readFile(file, "utf-8");
    return JSON.parse(raw).completed.annotation;
}

export async function readDiagramImage(slug: string, diagramId: string): Promise<Buffer> {
    const file = path.join(DATA_ROOT, "vehicles", slug, "diagrams", diagramId, "image.webp");
    return readFile(file);
}
