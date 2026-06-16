"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function ResumesPage() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [driveUrl, setDriveUrl] = useState("");

  const { data: resumes } = useQuery({
    queryKey: ["resumes"],
    queryFn: async () => {
      const r = await fetch("/api/resumes");
      return r.json();
    },
  });

  const addMutation = useMutation({
    mutationFn: async (payload: { title: string; description: string; driveUrl: string }) => {
      const res = await fetch("/api/resumes", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      return data;
    },
    onSuccess: () => {
      toast.success("Resume saved");
      setTitle("");
      setDescription("");
      setDriveUrl("");
      queryClient.invalidateQueries({ queryKey: ["resumes"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to save"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/resumes/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      return data;
    },
    onSuccess: () => {
      toast.success("Resume deleted");
      queryClient.invalidateQueries({ queryKey: ["resumes"] });
    },
    onError: (e: any) => toast.error(e.message || "Delete failed"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!driveUrl.includes("drive.google.com")) {
      toast.error("Please enter a valid Google Drive link");
      return;
    }
    addMutation.mutate({ title, description, driveUrl });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header>
        <h2 className="text-2xl font-bold">Resumes</h2>
        <p className="text-sm text-gray-500">
          Add Google Drive links to your resumes. Make sure each file is shared as{" "}
          <strong>Anyone with the link</strong> in Drive.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (e.g. Full Stack Developer)"
            className="border rounded px-3 py-2"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (e.g. React, Node.js, TypeScript)"
            className="border rounded px-3 py-2"
          />
          <input
            required
            value={driveUrl}
            onChange={(e) => setDriveUrl(e.target.value)}
            placeholder="Google Drive link (https://drive.google.com/file/d/...)"
            className="border rounded px-3 py-2 col-span-2"
          />
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={addMutation.isPending}
            className="px-4 py-2 bg-indigo-600 text-white rounded"
          >
            {addMutation.isPending ? "Saving..." : "Save Resume"}
          </button>
        </div>
      </form>

      <div className="bg-white border border-gray-200 rounded p-6">
        <h3 className="font-semibold mb-3">Saved Resumes</h3>
        <div className="divide-y">
          {resumes?.length === 0 && <p className="text-gray-500">No resumes added yet.</p>}
          {resumes?.map((r: any) => (
            <div key={r.id} className="py-3 flex items-center justify-between">
              <div>
                <p className="font-medium">{r.title}</p>
                <p className="text-sm text-gray-500">
                  {r.description && <span>{r.description} • </span>}
                  {new Date(r.uploadedAt).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-2">
                <a
                  href={r.driveUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1 bg-gray-50 rounded border text-sm"
                >
                  View
                </a>
                <button
                  onClick={() => deleteMutation.mutate(r.id)}
                  className="px-3 py-1 bg-red-50 text-red-600 rounded border text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
