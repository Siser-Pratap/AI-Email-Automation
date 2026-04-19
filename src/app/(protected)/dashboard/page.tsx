"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, X, Building2, Briefcase, Mail, CalendarClock, CheckCircle2, XCircle, Clock, Save, LayoutTemplate, Send, FastForward, ArchiveRestore, Archive, Pencil, User, Hash, RefreshCw, MessageSquarePlus } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    hrEmail: "",
    companyName: "",
    role: "",
    emailType: "REFERRAL",
    jobId: "",
    notes: "",
  });

  const { data: emails, isLoading, error } = useQuery({
    queryKey: ["emails"],
    queryFn: async () => {
      const res = await fetch("/api/emails");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch emails");
      return Array.isArray(data) ? data : [];
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
      setEditingId(null);
      setFormData({ name: "", hrEmail: "", companyName: "", role: "", emailType: "REFERRAL", jobId: "", notes: "" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await fetch(`/api/emails/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      setShowAddForm(false);
      setEditingId(null);
      setFormData({ name: "", hrEmail: "", companyName: "", role: "", emailType: "REFERRAL", jobId: "", notes: "" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: formData });
    } else {
      addMutation.mutate(formData);
    }
  };

  const testEmailMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await fetch("/api/test-email", {
        method: "POST",
        body: JSON.stringify({ email }),
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      alert("Test email sent successfully! Check your inbox.");
    },
    onError: (error: any) => {
      alert(`Failed to send test email: ${error.message}`);
    }
  });

  const handleTestEmail = () => {
    const email = window.prompt("Enter an email address to send a test email to:");
    if (email) {
      testEmailMutation.mutate(email);
    }
  };

  const sendPendingMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/send-pending", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      alert(data.message || "Finished processing pending emails.");
    },
    onError: (error: any) => {
      alert(`Failed to send emails: ${error.message}`);
    }
  });

  const sendSingleMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch("/api/send-single", {
        method: "POST",
        body: JSON.stringify({ id }),
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emails"] });
    },
    onError: (error: any) => {
      alert(`Failed to send email: ${error.message}`);
    }
  });

  const handleSendPending = () => {
    if (confirm("Are you sure you want to immediately send all pending emails?")) {
      sendPendingMutation.mutate();
    }
  };

  const toggleBacklogMutation = useMutation({
    mutationFn: async ({ id, newStatus }: { id: string; newStatus: string }) => {
      const res = await fetch(`/api/emails/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
        headers: { "Content-Type": "application/json" },
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emails"] });
    },
  });

  const handleResend = (entry: any) => {
    if (confirm(`Are you sure you want to resend the ${entry.emailType} email to ${entry.hrEmail}?`)) {
      sendSingleMutation.mutate(entry.id);
    }
  };

  const handleFollowUp = (entry: any) => {
    if (confirm(`Do you want to queue a Follow-up email for ${entry.hrEmail}?`)) {
      addMutation.mutate({
        hrEmail: entry.hrEmail,
        companyName: entry.companyName,
        role: entry.role,
        name: entry.name,
        jobId: entry.jobId,
        emailType: "FOLLOWUP",
        notes: `Follow-up to original ${entry.emailType}`,
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "SENT":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm">
            <CheckCircle2 className="w-3.5 h-3.5" /> Sent
          </span>
        );
      case "FAILED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-red-50 text-red-700 border border-red-200 shadow-sm">
            <XCircle className="w-3.5 h-3.5" /> Failed
          </span>
        );
      case "BACKLOG":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-50 text-slate-700 border border-slate-200 shadow-sm">
            <Archive className="w-3.5 h-3.5" /> Backlog
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 shadow-sm">
            <Clock className="w-3.5 h-3.5" /> Pending
          </span>
        );
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">Campaigns</h2>
          <p className="text-sm text-gray-500 mt-1">Manage and monitor your automated HR outreach.</p>
        </div>
        <div className="flex gap-3">
          <button            onClick={handleSendPending}
            disabled={sendPendingMutation.isPending}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50"
          >
            {sendPendingMutation.isPending ? "Processing..." : <><FastForward className="w-4 h-4 text-emerald-600" /> Send All Pending Now</>}
          </button>
          {/* <button            onClick={handleTestEmail}
            disabled={testEmailMutation.isPending}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
          >
            {testEmailMutation.isPending ? "Sending..." : <><Send className="w-4 h-4 text-indigo-600" /> Send Test Email</>}
          </button> */}
          <button
            onClick={() => {
              setShowAddForm(!showAddForm);
              if (showAddForm) {
                setEditingId(null);
                setFormData({ name: "", hrEmail: "", companyName: "", role: "", emailType: "REFERRAL", jobId: "", notes: "" });
              }
            }}
            className={cn(
              "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2",
              showAddForm
                ? "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 focus:ring-gray-200"
                : "bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500 border border-transparent"
            )}
          >
            {showAddForm ? (
              <><X className="w-4 h-4" /> Cancel</>
            ) : (
              <><Plus className="w-4 h-4" /> New Campaign</>
            )}
          </button>
        </div>
      </header>

      {showAddForm && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden transition-all">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50">
            <h3 className="text-base font-semibold text-gray-900">{editingId ? "Edit Recipient" : "Add New Recipient"}</h3>
            <p className="text-sm text-gray-500">{editingId ? "Update details for this automated email entry." : "Schedule an automated email to a new HR contact."}</p>
          </div>
          <form onSubmit={handleSubmit} className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <User className="w-4 h-4 text-gray-400" /> Recipient Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="John Doe"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <Mail className="w-4 h-4 text-gray-400" /> HR Email
                </label>
                <input
                  type="email"
                  required
                  placeholder="hr@company.com"
                  value={formData.hrEmail}
                  onChange={(e) => setFormData({ ...formData, hrEmail: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-gray-400" /> Company Name
                </label>
                <input
                  type="text"
                  placeholder="Acme Corp"
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-gray-400" /> Role
                </label>
                <input
                  type="text"
                  required
                  placeholder="Frontend Engineer"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <LayoutTemplate className="w-4 h-4 text-gray-400" /> Email Type
                </label>
                <select
                  value={formData.emailType}
                  onChange={(e) => setFormData({ ...formData, emailType: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow bg-white"
                >
                  <option value="REFERRAL">Referral Request</option>
                  <option value="APPLICATION">Job Application</option>
                  <option value="INTEREST">General Interest</option>
                  <option value="FOLLOWUP">Follow-up Message</option>
                </select>
              </div>
              {formData.emailType === "REFERRAL" && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    <Hash className="w-4 h-4 text-gray-400" /> Job ID
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. REQ-12345"
                    value={formData.jobId}
                    onChange={(e) => setFormData({ ...formData, jobId: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow"
                  />
                </div>
              )}
            </div>
            <div className="mt-8 flex justify-end">
              <button
                type="submit"
                disabled={addMutation.isPending || updateMutation.isPending}
                className="inline-flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {addMutation.isPending || updateMutation.isPending ? "Saving..." : <><Save className="w-4 h-4" /> {editingId ? "Update Entry" : "Save Entry"}</>}
              </button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      ) : error ? (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-200">
          Failed to load emails: {error.message}. Please check your database connection.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
                <tr>
                  <th className="px-6 py-4 font-medium">Recipient</th>
                  <th className="px-6 py-4 font-medium">Company & Role</th>
                  <th className="px-6 py-4 font-medium">Type</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium">Activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {emails?.map((entry: any) => (
                  <tr key={entry.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs">
                          {entry.name ? entry.name.charAt(0).toUpperCase() : entry.hrEmail.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{entry.name || entry.hrEmail}</p>
                          {entry.name && <p className="text-xs text-gray-500">{entry.hrEmail}</p>}
                          {!entry.name && <p className="text-xs text-gray-500">Added {new Date(entry.createdAt).toLocaleDateString()}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900">{entry.companyName || "—"}</p>
                      <p className="text-xs text-gray-500">{entry.role}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700">
                        {entry.emailType}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(entry.status)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-1.5 text-gray-500 text-xs">
                          <CalendarClock className="w-3.5 h-3.5" />
                          {entry.lastSentAt
                            ? `Sent: ${new Date(entry.lastSentAt).toLocaleDateString()}`
                            : `Sch: ${new Date(entry.scheduledAt).toLocaleDateString()}`}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setFormData({
                                name: entry.name || "",
                                hrEmail: entry.hrEmail,
                                companyName: entry.companyName || "",
                                role: entry.role,
                                emailType: entry.emailType,
                                jobId: entry.jobId || "",
                                notes: entry.notes || "",
                              });
                              setEditingId(entry.id);
                              setShowAddForm(true);
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                            className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors disabled:opacity-50"
                            title="Edit details"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {entry.status === "BACKLOG" ? (
                            <button
                              onClick={() => toggleBacklogMutation.mutate({ id: entry.id, newStatus: "PENDING" })}
                              disabled={toggleBacklogMutation.isPending}
                              className="p-1.5 text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-md transition-colors disabled:opacity-50"
                              title="Restore to Pending"
                            >
                              <ArchiveRestore className="w-3.5 h-3.5" />
                            </button>
                          ) : entry.status !== "SENT" && (
                            <>
                              <button
                                onClick={() => toggleBacklogMutation.mutate({ id: entry.id, newStatus: "BACKLOG" })}
                                disabled={toggleBacklogMutation.isPending}
                                className="p-1.5 text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-md transition-colors disabled:opacity-50"
                                title="Move to Backlog"
                              >
                                <Archive className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => sendSingleMutation.mutate(entry.id)}
                                disabled={sendSingleMutation.isPending}
                                className="p-1.5 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors disabled:opacity-50"
                                title="Send Now"
                              >
                                <Send className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          {entry.status === "SENT" && (
                            <>
                              <button
                                onClick={() => handleResend(entry)}
                                disabled={sendSingleMutation.isPending}
                                className="p-1.5 text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-md transition-colors disabled:opacity-50"
                                title="Resend exact email"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleFollowUp(entry)}
                                disabled={addMutation.isPending}
                                className="p-1.5 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors disabled:opacity-50"
                                title="Schedule Follow-up"
                              >
                                <MessageSquarePlus className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
                {emails?.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 mb-4">
                        <Mail className="w-6 h-6 text-gray-400" />
                      </div>
                      <p className="text-gray-900 font-medium text-sm">No campaigns yet</p>
                      <p className="text-gray-500 text-sm mt-1">Create your first entry to get started.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
