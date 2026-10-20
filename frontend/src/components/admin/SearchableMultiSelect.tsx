'use client';

import { useState, useRef, useEffect } from 'react';

interface Option {
  id: number;
  name: string;
}

interface Props {
  options: Option[];
  selected: number[];
  onChange: (selected: number[]) => void;
  placeholder?: string;
}

export default function SearchableMultiSelect({
  options,
  selected,
  onChange,
  placeholder = 'Search...',
}: Props) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredOptions = options.filter((opt) =>
    opt.name.toLowerCase().includes(search.toLowerCase())
  );

  const toggleOption = (id: number) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  const removeOption = (id: number) => {
    onChange(selected.filter((s) => s !== id));
  };

  const selectedObjects = options.filter((opt) => selected.includes(opt.id));

  return (
    <div ref={containerRef} className="relative">
      {/* Selected chips + search input */}
      <div
        className="border rounded p-2 flex flex-wrap gap-1 cursor-text"
        onClick={() => setOpen(true)}
      >
        {selectedObjects.map((opt) => (
          <span
            key={opt.id}
            className="bg-gray-200 text-sm px-2 py-0.5 rounded flex items-center gap-1"
          >
            {opt.name}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeOption(opt.id);
              }}
              className="text-gray-500 hover:text-black"
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          className="flex-1 outline-none min-w-[100px]"
          placeholder={selected.length === 0 ? placeholder : ''}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
      </div>

      {/* Dropdown list */}
      {open && (
        <div className="absolute z-50 w-full bg-white border rounded mt-1 max-h-60 overflow-y-auto shadow-lg">
          {filteredOptions.length === 0 ? (
            <div className="p-2 text-sm text-gray-500">No results</div>
          ) : (
            filteredOptions.map((opt) => {
              const isSelected = selected.includes(opt.id);
              return (
                <label
                  key={opt.id}
                  className="flex items-center px-2 py-1 hover:bg-gray-100 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleOption(opt.id)}
                    className="mr-2"
                  />
                  {opt.name}
                </label>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
