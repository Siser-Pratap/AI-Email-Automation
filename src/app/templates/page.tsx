"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

export default function TemplatesPage() {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    type: "REFERRAL",
    subject: "",
    body: "",
  });

  const { data: templates, isLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: async () => {
      const res = await fetch("/api/templates");
      return res.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (newTemplate: any) => {
      const res = await fetch("/api/templates", {
        method: "POST",
        body: JSON.stringify(newTemplate),
        headers: { "Content-Type": "application/json" },
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      setFormData({ type: "REFERRAL", subject: "", body: "" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Email Templates</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <form onSubmit={handleSubmit} className="bg-white p-6 rounded shadow mb-6">
            <h3 className="text-lg font-bold mb-4">Create / Edit Template</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full border p-2 rounded"
                >
                  <option value="REFERRAL">REFERRAL</option>
                  <option value="APPLICATION">APPLICATION</option>
                  <option value="INTEREST">INTEREST</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Subject</label>
                <input
                  type="text"
                  required
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  className="w-full border p-2 rounded"
                  placeholder="e.g. Opportunity at {{company}}"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Body (Supports {"{{company}}"}, {"{{role}}" })</label>
                <textarea
                  required
                  rows={6}
                  value={formData.body}
                  onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                  className="w-full border p-2 rounded font-mono text-sm"
                  placeholder="Hi, I am interested in the {{role}} role at {{company}}..."
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="mt-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              {saveMutation.isPending ? "Saving..." : "Save Template"}
            </button>
          </form>
        </div>

        <div>
          <h3 className="text-lg font-bold mb-4">Existing Templates</h3>
          {isLoading ? (
            <div>Loading...</div>
          ) : (
            <div className="space-y-4">
              {templates?.map((tpl: any) => (
                <div key={tpl.id} className="bg-white p-4 rounded shadow">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-bold text-blue-600">{tpl.type}</span>
                    <button
                      onClick={() => setFormData({ type: tpl.type, subject: tpl.subject, body: tpl.body })}
                      className="text-sm text-gray-500 hover:text-blue-600"
                    >
                      Edit
                    </button>
                  </div>
                  <div className="text-sm font-semibold border-b pb-2 mb-2">
                    Subject: {tpl.subject}
                  </div>
                  <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">{tpl.body}</pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
