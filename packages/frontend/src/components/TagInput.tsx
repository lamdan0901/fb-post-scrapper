import { useState, useRef, type KeyboardEvent } from "react";

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  validate?: (value: string) => string | null;
}

export default function TagInput({
  tags,
  onChange,
  placeholder = "Type and press Enter…",
  validate,
}: TagInputProps) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function addTag(raw: string) {
    const value = raw.trim();
    if (!value) return;

    if (tags.includes(value)) {
      setError("Already added");
      return;
    }

    if (validate) {
      const err = validate(value);
      if (err) {
        setError(err);
        return;
      }
    }

    setError(null);
    onChange([...tags, value]);
    setInput("");
  }

  function removeTag(index: number) {
    onChange(tags.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(input);
    } else if (e.key === "Backspace" && !input && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  }

  return (
    <div>
      <div
        className="flex flex-wrap gap-2 rounded-lg border border-gray-700 bg-gray-900 p-2 focus-within:border-blue-600"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag, i) => (
          <span
            key={i}
            className="flex items-center gap-1 rounded-md bg-gray-800 px-2.5 py-1 text-sm text-gray-200"
          >
            {tag}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeTag(i);
              }}
              className="ml-0.5 text-gray-500 hover:text-red-400"
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (input.trim()) addTag(input);
          }}
          placeholder={tags.length === 0 ? placeholder : ""}
          className="min-w-30 flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-600 outline-none"
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
