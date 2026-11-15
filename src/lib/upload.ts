import { confirmDesignUpload, removeDesignUpload, requestDesignUpload } from "@/app/actions/uploads";
import { publicEnv } from "./env";
import { DESIGN_EXT } from "./personalization";

export type UploadedDesign = { path: string; name: string };

/** The product page only talks to this interface. */
export interface DesignUploader {
  upload(file: File, onProgress: (pct: number) => void): Promise<UploadedDesign>;
  remove(path: string): Promise<void>;
}

export class UploadError extends Error {}

/** PUT the file to the signed URL with XHR so we get real upload progress. */
export function putWithProgress(url: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("apikey", publicEnv.supabasePublishableKey);
    xhr.setRequestHeader("content-type", file.type);
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new UploadError("الرفع فشل. جرّب تاني.")));
    xhr.onerror = () => reject(new UploadError("الرفع فشل. اتأكد من النت وجرّب تاني."));
    xhr.onabort = () => reject(new UploadError("الرفع اتلغى."));
    xhr.send(file);
  });
}

/** Direct upload to the private Supabase bucket via a server-issued signed URL. */
const supabaseUploader: DesignUploader = {
  async upload(file, onProgress) {
    onProgress(0);
    const ticket = await requestDesignUpload({ type: file.type, size: file.size });
    if (!ticket.ok) throw new UploadError(ticket.error);
    await putWithProgress(ticket.uploadUrl, file, onProgress);
    const done = await confirmDesignUpload(ticket.path);
    if (!done.ok) throw new UploadError(done.error);
    onProgress(100);
    return { path: ticket.path, name: file.name };
  },
  async remove(path) {
    await removeDesignUpload(path);
  },
};

/** No backend configured (fresh clone): simulate, so the UI can still be developed. Never reaches an order. */
const stubUploader: DesignUploader = {
  async upload(file, onProgress) {
    for (let p = 0; p <= 100; p += 20) {
      onProgress(p);
      await new Promise((r) => setTimeout(r, 90));
    }
    return { path: `stub/${crypto.randomUUID()}.${DESIGN_EXT[file.type] ?? "bin"}`, name: file.name };
  },
  async remove() {},
};

export const designUploader: DesignUploader = publicEnv.supabaseUrl ? supabaseUploader : stubUploader;
