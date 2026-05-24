"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function ResumesPage() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const { data: resumes } = useQuery({ queryKey: ["resumes"], queryFn: async () => { const r = await fetch("/api/resumes"); return r.json(); } });

  const uploadMutation = useMutation({
    mutationFn: async ({ title, description, fileBase64, filename }: any) => {
      const res = await fetch("/api/resumes", { method: "POST", body: JSON.stringify({ title, description, fileDataBase64: fileBase64, filename }), headers: { "Content-Type": "application/json" } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      return data;
    },
    onSuccess: () => {
      toast.success("Resume uploaded");
      setTitle(""); setDescription(""); setFile(null);
      queryClient.invalidateQueries({ queryKey: ["resumes"] });
    },
    onError: (e: any) => toast.error(e.message || "Upload failed")
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/resumes/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      return data;
    },
    onSuccess: () => { toast.success("Resume deleted"); queryClient.invalidateQueries({ queryKey: ["resumes"] }); },
    onError: (e: any) => toast.error(e.message || "Delete failed")
  });

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return toast.error("Please select a file");
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // result is data:<mime>;base64,<data>
      const idx = result.indexOf("base64,");
      const base64 = idx >= 0 ? result.substring(idx + 7) : result;
      uploadMutation.mutate({ title, description, fileBase64: base64, filename: file.name });
    };
    reader.onerror = () => toast.error("Failed to read file");
    reader.readAsDataURL(file);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header>
        <h2 className="text-2xl font-bold">Resumes</h2>
        <p className="text-sm text-gray-500">Upload and manage resume files visible on the site.</p>
      </header>

      <form onSubmit={handleUpload} className="bg-white border border-gray-200 rounded p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="border rounded px-3 py-2" />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="border rounded px-3 py-2" />
          <input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setFile(e.target.files?.[0] || null)} className="col-span-2" />
        </div>
        <div className="flex justify-end">
          <button type="submit" disabled={uploadMutation.isPending} className="px-4 py-2 bg-indigo-600 text-white rounded">{uploadMutation.isPending ? "Uploading..." : "Upload Resume"}</button>
        </div>
      </form>

      <div className="bg-white border border-gray-200 rounded p-6">
        <h3 className="font-semibold mb-3">Uploaded Resumes</h3>
        <div className="divide-y">
          {resumes?.length === 0 && <p className="text-gray-500">No resumes uploaded yet.</p>}
          {resumes?.map((r: any) => (
            <div key={r.id} className="py-3 flex items-center justify-between">
              <div>
                <p className="font-medium">{r.title}</p>
                <p className="text-sm text-gray-500">{r.description} • {new Date(r.uploadedAt).toLocaleString()}</p>
              </div>
              <div className="flex gap-2">
                <a href={r.url} target="_blank" rel="noreferrer" className="px-3 py-1 bg-gray-50 rounded border">View</a>
                <button onClick={() => deleteMutation.mutate(r.id)} className="px-3 py-1 bg-red-50 text-red-600 rounded border">Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
