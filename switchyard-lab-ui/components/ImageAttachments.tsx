"use client";

import { useRef } from "react";
import type { ImageAttachment } from "@/lib/types";

export const MAX_IMAGES = 4;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function filesToAttachments(files: File[]): Promise<ImageAttachment[]> {
  const images = files.filter((file) => ACCEPTED_IMAGE_TYPES.includes(file.type));
  const oversized = images.find((file) => file.size > MAX_IMAGE_BYTES);
  if (oversized) throw new Error(`${oversized.name} is larger than 5 MB.`);

  return Promise.all(
    images.map(
      (file) =>
        new Promise<ImageAttachment>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve({
              id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              name: file.name || "pasted-image",
              mimeType: file.type,
              size: file.size,
              dataUrl: String(reader.result),
            });
          reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
          reader.readAsDataURL(file);
        }),
    ),
  );
}

export function ImageAttachments({
  images,
  disabled,
  error,
  onFiles,
  onRemove,
}: {
  images: ImageAttachment[];
  disabled: boolean;
  error: string | null;
  onFiles: (files: File[]) => void;
  onRemove: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="image-attachments">
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        multiple
        disabled={disabled}
        onChange={(event) => {
          onFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />

      {images.length > 0 && (
        <div className="image-preview-list" aria-label="Attached images">
          {images.map((image) => (
            <figure className="image-preview" key={image.id}>
              {/* Data URL is created locally from an attendee-selected file. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.dataUrl} alt={image.name} />
              <figcaption title={image.name}>{image.name}</figcaption>
              <button
                type="button"
                aria-label={`Remove ${image.name}`}
                onClick={() => onRemove(image.id)}
                disabled={disabled}
              >
                ×
              </button>
            </figure>
          ))}
        </div>
      )}

      <div className="image-tools">
        <button
          className="btn attach"
          type="button"
          disabled={disabled || images.length >= MAX_IMAGES}
          onClick={() => inputRef.current?.click()}
        >
          <span aria-hidden="true">＋</span> Add image
        </button>
        <span className="image-hint">
          Upload, drag, or paste · PNG/JPEG/WebP/GIF · {images.length}/{MAX_IMAGES}
        </span>
      </div>
      {error && <div className="image-error" role="alert">{error}</div>}
    </div>
  );
}
