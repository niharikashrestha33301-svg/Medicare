import React from 'react';

export default function DirectoryPagination({ page, count, onChange }) {
  const pages = Math.max(1, Math.ceil(count / 24));
  return (
    <div className="flex items-center justify-center gap-4 mt-6 text-xs font-bold">
      <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} className="px-4 py-2 border border-slate-200 rounded-xl disabled:opacity-40">Previous</button>
      <span>Page {page} of {pages}</span>
      <button type="button" disabled={page >= pages} onClick={() => onChange(page + 1)} className="px-4 py-2 border border-slate-200 rounded-xl disabled:opacity-40">Next</button>
    </div>
  );
}
