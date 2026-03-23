import { useState, useRef, type DragEvent, type ChangeEvent } from "react";
import { toast } from "sonner";
import { useUploadCookies } from "../lib/hooks";

export default function CookieUpload() {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { mutate, isPending, data, error, reset } = useUploadCookies();

  function handleFile(file: File) {
    if (!file.name.endsWith(".txt")) {
      toast.error("Only .txt files are accepted");
      return;
    }
    if (file.size > 100_000) {
      toast.error("File too large — cookie files should be under 100 KB");
      return;
    }
    reset();
    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      mutate(
        { content, verify: true },
        {
          onSuccess: (res) =>
            res.valid
              ? toast.success("Cookies uploaded and verified")
              : toast.warning("Cookies uploaded but may be expired"),
          onError: (err) => toast.error(`Cookie upload failed: ${err.message}`),
        },
      );
    };
    reader.readAsText(file);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
          isDragging
            ? "border-blue-500 bg-blue-500/10"
            : "border-gray-700 hover:border-gray-600"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt"
          onChange={onFileChange}
          className="hidden"
        />
        <p className="text-sm text-gray-400">
          {isPending
            ? "Uploading & verifying…"
            : "Drag & drop your cookie .txt file here, or click to browse"}
        </p>
      </div>

      {data && (
        <div
          className={`mt-3 rounded-lg border p-3 text-sm ${
            data.valid
              ? "border-green-800 bg-green-950/30 text-green-400"
              : "border-yellow-800 bg-yellow-950/30 text-yellow-400"
          }`}
        >
          <p>{data.message}</p>
          {data.expires_at && (
            <p className="mt-1 text-xs opacity-80">
              Expires:{" "}
              {new Date(data.expires_at).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
              {new Date(data.expires_at) <= new Date() && (
                <span className="ml-1 font-semibold text-red-400">
                  (expired)
                </span>
              )}
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-red-800 bg-red-950/30 p-3 text-sm text-red-400">
          {error.message}
        </div>
      )}
    </div>
  );
}
