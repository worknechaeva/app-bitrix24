"use client";

import { Paperclip, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  formatFileSize,
  isSupportedTaskFile,
  MAX_TASK_FILES,
  MAX_TASK_FILE_SIZE_BYTES,
  TASK_FILE_ACCEPT,
} from "./files";

type FilePickerProps = {
  files: File[];
  onChange: (files: File[]) => void;
  serverError?: string;
};

export function FilePicker({ files, onChange, serverError }: FilePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();

  function addFiles(selected: File[]) {
    setError(undefined);
    const next = [...files, ...selected];
    if (next.length > MAX_TASK_FILES) {
      setError(`Можно прикрепить не более ${MAX_TASK_FILES} файлов`);
      return;
    }
    const oversized = selected.find((file) => file.size > MAX_TASK_FILE_SIZE_BYTES);
    if (oversized) {
      setError(`Файл «${oversized.name}» больше 20 МБ`);
      return;
    }
    const unsupported = selected.find((file) => !isSupportedTaskFile(file));
    if (unsupported) {
      setError(`Формат файла «${unsupported.name}» не поддерживается`);
      return;
    }
    onChange(next);
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeFile(index: number) {
    onChange(files.filter((_, fileIndex) => fileIndex !== index));
    setError(undefined);
  }

  return (
    <div className="max-w-full min-w-0">
      <Label htmlFor="task-files">Прикрепить файлы</Label>
      <div className="mt-2 max-w-full min-w-0">
        <Input
          ref={inputRef}
          id="task-files"
          type="file"
          multiple
          accept={TASK_FILE_ACCEPT}
          className="min-h-12 w-full max-w-full min-w-0 cursor-pointer overflow-hidden file:mr-3 file:font-medium"
          onChange={(event) => addFiles(Array.from(event.target.files ?? []))}
          aria-describedby="task-files-hint task-files-error"
        />
      </div>
      <p id="task-files-hint" className="text-muted-foreground mt-1 text-xs">
        Изображения, PDF и офисные документы. До 20 МБ на файл.
      </p>
      {error || serverError ? (
        <p id="task-files-error" className="text-destructive mt-2 text-sm" role="alert">
          {error ?? serverError}
        </p>
      ) : null}
      {files.length ? (
        <ul className="mt-3 max-w-full min-w-0 space-y-2" aria-label="Выбранные файлы">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
              className="bg-muted/60 flex min-h-12 max-w-full min-w-0 items-center gap-3 overflow-hidden rounded-xl px-3 py-2"
              data-testid="selected-file"
            >
              <Paperclip className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 overflow-hidden">
                <span
                  className="block max-w-full truncate text-sm font-medium"
                  data-testid="selected-file-name"
                  title={file.name}
                >
                  {file.name}
                </span>
                <span className="text-muted-foreground block text-xs">{formatFileSize(file.size)}</span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 shrink-0"
                onClick={() => removeFile(index)}
                aria-label={`Удалить файл ${file.name}`}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
