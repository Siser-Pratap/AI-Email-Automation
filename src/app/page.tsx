"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    hrEmail: "",
    companyName: "",
    role: "",
    emailType: "REFERRAL",
    notes: "",
  });

  const { data: emails, isLoading } = useQuery({
    queryKey: ["emails"],
    queryFn: async () => {
      const res = await fetch("/api/emails");
      return res.json();
    },
  });

  const addMutation = useMutation({
    mutationFn: async (newEntry: any) => {
      const res = await fetch("/api/emails", {
        method: "POST",
        body: JSON.stringify(newEntry),
        headers: { "Content-Type": "application/json" },
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      setShowAddForm(false);
      setFormData({ hrEmail: "", companyName: "", role: "", emailType: "REFERRAL", notes: "" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addMutation.mutate(formData);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Email Campaigns</h2>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700"
        >
          {showAddForm ? "Cancel" : "Add Entry"}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded shadow mb-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">HR Email</label>
              <input
                type="email"
                required
                value={formData.hrEmail}
                onChange={(e) => setFormData({ ...formData, hrEmail: e.target.value })}
                className="w-full border p-2 rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Company Name</label>
              <input
                type="text"
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                className="w-full border p-2 rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Role</label>
              <input
                type="text"
                required
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="w-full border p-2 rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email Type</label>
              <select
                value={formData.emailType}
                onChange={(e) => setFormData({ ...formData, emailType: e.target.value })}
                className="w-full border p-2 rounded"
              >
                <option value="REFERRAL">REFERRAL</option>
                <option value="APPLICATION">APPLICATION</option>
                <option value="INTEREST">INTEREST</option>
              </select>
            </div>
          </div>
          <button
            type="submit"
            disabled={addMutation.isPending}
            className="mt-4 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            {addMutation.isPending ? "Saving..." : "Save Entry"}
          </button>
        </form>
      )}

      {isLoading ? (
        <div>Loading...</div>
      ) : (
        <div className="bg-white rounded shadow overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b">
                <th className="p-3">HR Email</th>
                <th className="p-3">Company</th>
                <th className="p-3">Role</th>
                <th className="p-3">Type</th>
                <th className="p-3">Status</th>
                <th className="p-3">Scheduled / Sent</th>
              </tr>
            </thead>
            <tbody>
              {emails?.map((entry: any) => (
                <tr key={entry.id} className="border-b">
                  <td className="p-3">{entry.hrEmail}</td>
                  <td className="p-3">{entry.companyName}</td>
                  <td className="p-3">{entry.role}</td>
                  <td className="p-3">{entry.emailType}</td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-bold ${
                        entry.status === "SENT"
                          ? "bg-green-100 text-green-700"
                          : entry.status === "FAILED"
                          ? "bg-red-100 text-red-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {entry.status}
                    </span>
                  </td>
                  <td className="p-3 text-sm text-gray-600">
                    {entry.lastSentAt
                      ? new Date(entry.lastSentAt).toLocaleString()
                      : new Date(entry.scheduledAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
