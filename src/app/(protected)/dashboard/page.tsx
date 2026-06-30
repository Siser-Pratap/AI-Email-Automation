"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState, useEffect } from "react";
import {
  Plus, X, Building2, Briefcase, Mail, CalendarClock, CheckCircle2, XCircle, Clock,
  Save, LayoutTemplate, Send, FastForward, ArchiveRestore, Archive, Pencil, User,
  Hash, RefreshCw, MessageSquarePlus, Trash2, ChevronDown, ChevronUp, ShieldCheck,
  ShieldX, Eye, Play, Search, ListFilter,
} from "lucide-react";
import { toast } from "sonner";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type EmailEntry = {
  id: string;
  hrEmail: string;
  companyName?: string;
  role: string;
  name?: string;
  emailType: string;
  jobId?: string;
  notes?: string;
  messageId?: string;
  status: string;
  source: string;
  reviewStatus: string;
  rawText?: string;
  scheduledAt: string;
  lastSentAt?: string;
  followUpDone?: boolean;
  followUpAt?: string;
  createdAt: string;
};

type ReviewForm = {
  hrEmail: string;
  companyName: string;
  role: string;
  name: string;
  emailType: string;
  notes: string;
};

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"ALL" | "REVIEW">("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reviewingEntry, setReviewingEntry] = useState<EmailEntry | null>(null);
  const [reviewForm, setReviewForm] = useState<ReviewForm>({
    hrEmail: "", companyName: "", role: "", name: "", emailType: "REFERRAL", notes: "",
  });
  const [formData, setFormData] = useState({
    name: "", hrEmail: "", companyName: "", role: "", emailType: "REFERRAL", jobId: "", notes: "",
  });

  // ── Search & filters ──────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [followUpFilter, setFollowUpFilter] = useState("ALL"); // ALL | DONE | PENDING

  const { data: emails, isLoading, error } = useQuery({
    queryKey: ["emails"],
    queryFn: async () => {
      const res = await fetch("/api/emails");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch emails");
      return Array.isArray(data) ? (data as EmailEntry[]) : [];
    },
  });

  const reviewCount = emails?.filter((e) => e.reviewStatus === "PENDING_REVIEW").length ?? 0;
  const tabEmails = activeTab === "REVIEW"
    ? emails?.filter((e) => e.reviewStatus === "PENDING_REVIEW")
    : emails;

  const searchTerm = searchQuery.trim().toLowerCase();
  const hasActiveFilters =
    searchTerm !== "" || statusFilter !== "ALL" || typeFilter !== "ALL" || sourceFilter !== "ALL" || followUpFilter !== "ALL";

  const filteredEmails = tabEmails?.filter((e) => {
    if (statusFilter !== "ALL" && e.status !== statusFilter) return false;
    if (typeFilter !== "ALL" && e.emailType !== typeFilter) return false;
    if (sourceFilter !== "ALL" && e.source !== sourceFilter) return false;
    if (followUpFilter === "DONE" && !e.followUpDone) return false;
    if (followUpFilter === "PENDING" && e.followUpDone) return false;
    if (searchTerm) {
      const haystack = [e.name, e.hrEmail, e.companyName, e.role, e.jobId, e.notes]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(searchTerm)) return false;
    }
    return true;
  });

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("ALL");
    setTypeFilter("ALL");
    setSourceFilter("ALL");
    setFollowUpFilter("ALL");
  };

  const pendingReviewEntries = filteredEmails?.filter((e) => e.reviewStatus === "PENDING_REVIEW") ?? [];
  const allSelected = pendingReviewEntries.length > 0 && pendingReviewEntries.every((e) => selectedIds.has(e.id));

  const openReview = (entry: EmailEntry) => {
    setReviewingEntry(entry);
    setReviewForm({
      hrEmail: entry.hrEmail,
      companyName: entry.companyName ?? "",
      role: entry.role,
      name: entry.name ?? "",
      emailType: entry.emailType,
      notes: entry.notes ?? "",
    });
  };

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["emails"] });
    queryClient.invalidateQueries({ queryKey: ["review-count"] });
  };

  // ── Mutations ────────────────────────────────────────────────────────────────

  const addMutation = useMutation({
    mutationFn: async (newEntry: typeof formData) => {
      const res = await fetch("/api/emails", {
        method: "POST",
        body: JSON.stringify(newEntry),
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Failed to create email entry");
      return res.json();
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Email entry created successfully");
      setShowAddForm(false);
      setEditingId(null);
      setFormData({ name: "", hrEmail: "", companyName: "", role: "", emailType: "REFERRAL", jobId: "", notes: "" });
    },
    onError: (e: Error) => toast.error(e.message || "Failed to create email entry"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof formData> }) => {
      const res = await fetch(`/api/emails/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Failed to update email entry");
      return res.json();
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Email entry updated successfully");
      setShowAddForm(false);
      setEditingId(null);
      setFormData({ name: "", hrEmail: "", companyName: "", role: "", emailType: "REFERRAL", jobId: "", notes: "" });
    },
    onError: (e: Error) => toast.error(e.message || "Failed to update email entry"),
  });

  // Quick approve without editing
  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/emails/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ reviewStatus: "APPROVED" }),
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Failed to approve entry");
      return res.json();
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Entry approved — will be picked up by cron");
    },
    onError: (e: Error) => toast.error(e.message || "Failed to approve entry"),
  });

  // Approve after editing fields in the review modal
  const reviewApproveMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ReviewForm }) => {
      const res = await fetch(`/api/emails/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...data, reviewStatus: "APPROVED" }),
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Failed to approve entry");
      return res.json();
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Entry approved — will be picked up by cron");
      setReviewingEntry(null);
    },
    onError: (e: Error) => toast.error(e.message || "Failed to approve entry"),
  });

  // Bulk approve all selected PENDING_REVIEW entries
  const bulkApproveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/emails/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ reviewStatus: "APPROVED" }),
            headers: { "Content-Type": "application/json" },
          })
        )
      );
    },
    onSuccess: () => {
      invalidateAll();
      toast.success(`${selectedIds.size} entries approved`);
      setSelectedIds(new Set());
    },
    onError: (e: Error) => toast.error(e.message || "Bulk approve failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/emails/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete");
      return data;
    },
    onSuccess: () => {
      invalidateAll();
      setSelectedIds((prev) => { const next = new Set(prev); return next; });
      toast.success("Campaign deleted");
    },
    onError: (e: Error) => toast.error(e.message || "Failed to delete campaign"),
  });

  const sendPendingMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/send-pending", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      invalidateAll();
      toast.success(data.message || "Finished processing pending emails.");
    },
    onError: (e: Error) => toast.error(`Failed to send emails: ${e.message}`),
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
    onSuccess: (data) => {
      invalidateAll();
      toast.success(data.message || "Email sent successfully");
    },
    onError: (e: Error) => toast.error(`Failed to send email: ${e.message}`),
  });

  const followUpMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch("/api/send-single", {
        method: "POST",
        body: JSON.stringify({ id, followUp: true }),
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      invalidateAll();
      toast.success(data.message || "Follow-up reply sent successfully");
    },
    onError: (e: Error) => toast.error(`Failed to send follow-up: ${e.message}`),
  });

  const toggleBacklogMutation = useMutation({
    mutationFn: async ({ id, newStatus }: { id: string; newStatus: string }) => {
      const res = await fetch(`/api/emails/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Failed to update status");
      return res.json();
    },
    onSuccess: (data) => {
      invalidateAll();
      toast.success(data.status === "BACKLOG" ? "Moved to backlog" : "Restored from backlog");
    },
    onError: (e: Error) => toast.error(e.message || "Failed to update email status"),
  });

  const runCronMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/cron", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Cron failed");
      return data;
    },
    onSuccess: (data) => {
      invalidateAll();
      const sent = (data.results as { status: string }[] | undefined)?.filter((r) => r.status === "SUCCESS").length ?? 0;
      toast.success(sent > 0 ? `Cron ran — ${sent} email${sent === 1 ? "" : "s"} sent` : (data.message || "Cron ran — nothing to send"));
    },
    onError: (e: Error) => toast.error(`Cron failed: ${e.message}`),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: formData });
    } else {
      addMutation.mutate(formData);
    }
  };

  const handleSendPending = () => {
    toast.custom((t) => (
      <div className="bg-white rounded-lg shadow-lg p-4 border border-gray-200 flex gap-3">
        <div className="flex-1">
          <p className="font-semibold text-gray-900">Send All Pending Emails?</p>
          <p className="text-sm text-gray-600 mt-1">This will immediately send all pending emails.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => toast.dismiss(t)} className="px-3 py-1 rounded text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200">Cancel</button>
          <button onClick={() => { toast.dismiss(t); sendPendingMutation.mutate(); }} className="px-3 py-1 rounded text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700">Confirm</button>
        </div>
      </div>
    ));
  };

  const handleResend = (entry: EmailEntry) => {
    toast.custom((t) => (
      <div className="bg-white rounded-lg shadow-lg p-4 border border-gray-200 flex gap-3">
        <div className="flex-1">
          <p className="font-semibold text-gray-900">Resend Email?</p>
          <p className="text-sm text-gray-600 mt-1">Resending {entry.emailType} to {entry.hrEmail}. This will be a new email and won't be threaded.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => toast.dismiss(t)} className="px-3 py-1 rounded text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200">Cancel</button>
          <button onClick={() => { toast.dismiss(t); sendSingleMutation.mutate(entry.id); }} className="px-3 py-1 rounded text-sm font-medium bg-blue-600 text-white hover:bg-blue-700">Resend</button>
        </div>
      </div>
    ));
  };

  const handleFollowUp = (entry: EmailEntry) => {
    if (!entry.messageId) {
      toast.error("Cannot follow up: this email has no original Message-ID. Send the original email first.");
      return;
    }
    toast.custom((t) => (
      <div className="bg-white rounded-lg shadow-lg p-4 border border-gray-200 flex gap-3">
        <div className="flex-1">
          <p className="font-semibold text-gray-900">Send Follow-up Reply?</p>
          <p className="text-sm text-gray-600 mt-1">
            {entry.followUpDone
              ? `A follow-up was already sent to ${entry.hrEmail}. Send another reply in the same thread?`
              : `This will reply to your original email to ${entry.hrEmail} in the same thread.`}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => toast.dismiss(t)} className="px-3 py-1 rounded text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200">Cancel</button>
          <button onClick={() => { toast.dismiss(t); followUpMutation.mutate(entry.id); }} className="px-3 py-1 rounded text-sm font-medium bg-purple-600 text-white hover:bg-purple-700">Send Follow-up</button>
        </div>
      </div>
    ));
  };

  const handleDiscard = (entry: EmailEntry) => {
    toast.custom((t) => (
      <div className="bg-white rounded-lg shadow-lg p-4 border border-gray-200 flex gap-3">
        <div className="flex-1">
          <p className="font-semibold text-gray-900">Discard Entry?</p>
          <p className="text-sm text-gray-600 mt-1">This will permanently delete the auto-ingested entry for {entry.hrEmail}.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => toast.dismiss(t)} className="px-3 py-1 rounded text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200">Cancel</button>
          <button onClick={() => { toast.dismiss(t); deleteMutation.mutate(entry.id); if (reviewingEntry?.id === entry.id) setReviewingEntry(null); }} className="px-3 py-1 rounded text-sm font-medium bg-red-600 text-white hover:bg-red-700">Discard</button>
        </div>
      </div>
    ));
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingReviewEntries.map((e) => e.id)));
    }
  };

  // ── Cron control ──────────────────────────────────────────────────────────────

  const [cronActive, setCronActive] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch("/api/cron/control", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { active: boolean }) => { if (mounted) setCronActive(!!d.active); })
      .catch(() => setCronActive(null));
    return () => { mounted = false; };
  }, []);

  const toggleCron = async () => {
    try {
      const action = cronActive ? "stop" : "start";
      const res = await fetch("/api/cron/control", { method: "POST", body: JSON.stringify({ action }), headers: { "Content-Type": "application/json" } });
      const data = await res.json() as { active: boolean; error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to toggle cron");
      setCronActive(!!data.active);
      toast.success(data.active ? "Cron resumed" : "Cron paused");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not change cron state");
    }
  };

  // ── Badge helpers ─────────────────────────────────────────────────────────────

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "SENT":
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm"><CheckCircle2 className="w-3.5 h-3.5" /> Sent</span>;
      case "FAILED":
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-red-50 text-red-700 border border-red-200 shadow-sm"><XCircle className="w-3.5 h-3.5" /> Failed</span>;
      case "BACKLOG":
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-50 text-slate-700 border border-slate-200 shadow-sm"><Archive className="w-3.5 h-3.5" /> Backlog</span>;
      default:
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 shadow-sm"><Clock className="w-3.5 h-3.5" /> Pending</span>;
    }
  };

  const getSourceBadge = (source: string) => {
    switch (source) {
      case "WHATSAPP":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700 border border-green-200">WhatsApp</span>;
      case "LINKEDIN":
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">LinkedIn</span>;
      default:
        return null;
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">

      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">Campaigns</h2>
          <p className="text-sm text-gray-500 mt-1">Manage and monitor your automated HR outreach.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleSendPending}
            disabled={sendPendingMutation.isPending}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all shadow-sm bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50"
          >
            {sendPendingMutation.isPending ? "Processing..." : <><FastForward className="w-4 h-4 text-emerald-600" /> Send All Pending Now</>}
          </button>
          <div className="inline-flex items-center rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <button
              onClick={toggleCron}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors hover:bg-gray-50"
            >
              {cronActive === null ? (
                <span className="text-gray-400">Cron: ?</span>
              ) : cronActive ? (
                <span className="text-emerald-700">Cron: Running</span>
              ) : (
                <span className="text-red-600">Cron: Paused</span>
              )}
            </button>
            <div className="w-px h-6 bg-gray-200" />
            <button
              onClick={() => runCronMutation.mutate()}
              disabled={runCronMutation.isPending}
              title="Run cron now"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              {runCronMutation.isPending ? "Running…" : "Run Now"}
            </button>
          </div>
          <button
            onClick={() => { setShowAddForm(!showAddForm); if (showAddForm) { setEditingId(null); setFormData({ name: "", hrEmail: "", companyName: "", role: "", emailType: "REFERRAL", jobId: "", notes: "" }); } }}
            className={cn(
              "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2",
              showAddForm ? "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 focus:ring-gray-200" : "bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500 border border-transparent"
            )}
          >
            {showAddForm ? <><X className="w-4 h-4" /> Cancel</> : <><Plus className="w-4 h-4" /> New Campaign</>}
          </button>
        </div>
      </header>

      {/* Add / Edit form */}
      {showAddForm && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50">
            <h3 className="text-base font-semibold text-gray-900">{editingId ? "Edit Recipient" : "Add New Recipient"}</h3>
            <p className="text-sm text-gray-500">{editingId ? "Update details for this automated email entry." : "Schedule an automated email to a new HR contact."}</p>
          </div>
          <form onSubmit={handleSubmit} className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2"><User className="w-4 h-4 text-gray-400" /> Recipient Name</label>
                <input type="text" placeholder="John Doe" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2"><Mail className="w-4 h-4 text-gray-400" /> HR Email</label>
                <input type="email" required placeholder="hr@company.com" value={formData.hrEmail} onChange={(e) => setFormData({ ...formData, hrEmail: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2"><Building2 className="w-4 h-4 text-gray-400" /> Company Name</label>
                <input type="text" placeholder="Acme Corp" value={formData.companyName} onChange={(e) => setFormData({ ...formData, companyName: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2"><Briefcase className="w-4 h-4 text-gray-400" /> Role</label>
                <input type="text" required placeholder="Frontend Engineer" value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2"><LayoutTemplate className="w-4 h-4 text-gray-400" /> Email Type</label>
                <select value={formData.emailType} onChange={(e) => setFormData({ ...formData, emailType: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow bg-white">
                  <option value="REFERRAL">Referral Request</option>
                  <option value="APPLICATION">Job Application</option>
                  <option value="INTEREST">General Interest</option>
                  <option value="FOLLOWUP">Follow-up Message</option>
                </select>
              </div>
              {formData.emailType === "REFERRAL" && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700 flex items-center gap-2"><Hash className="w-4 h-4 text-gray-400" /> Job ID</label>
                  <input type="text" required placeholder="e.g. REQ-12345" value={formData.jobId} onChange={(e) => setFormData({ ...formData, jobId: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow" />
                </div>
              )}
            </div>
            <div className="mt-8 flex justify-end">
              <button type="submit" disabled={addMutation.isPending || updateMutation.isPending} className="inline-flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors shadow-sm disabled:opacity-70">
                {addMutation.isPending || updateMutation.isPending ? "Saving..." : <><Save className="w-4 h-4" /> {editingId ? "Update Entry" : "Save Entry"}</>}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex items-center justify-between border-b border-gray-200">
        <div className="flex gap-1">
          <button
            onClick={() => { setActiveTab("ALL"); setSelectedIds(new Set()); }}
            className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors", activeTab === "ALL" ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700")}
          >
            All Campaigns
          </button>
          <button
            onClick={() => setActiveTab("REVIEW")}
            className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2", activeTab === "REVIEW" ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700")}
          >
            Needs Review
            {reviewCount > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white text-xs font-bold">{reviewCount}</span>
            )}
          </button>
        </div>

        {/* Bulk approve — only visible in REVIEW tab when items are selected */}
        {activeTab === "REVIEW" && selectedIds.size > 0 && (
          <button
            onClick={() => bulkApproveMutation.mutate([...selectedIds])}
            disabled={bulkApproveMutation.isPending}
            className="mb-1 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            <ShieldCheck className="w-4 h-4" />
            {bulkApproveMutation.isPending ? "Approving..." : `Approve Selected (${selectedIds.size})`}
          </button>
        )}
      </div>

      {/* Search & filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name, email, company, role, job ID, notes…"
            className="w-full border border-gray-300 rounded-lg pl-9 pr-9 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 rounded"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <ListFilter className="w-4 h-4 text-gray-400 shrink-0" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="SENT">Sent</option>
            <option value="FAILED">Failed</option>
            <option value="BACKLOG">Backlog</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          >
            <option value="ALL">All Types</option>
            <option value="REFERRAL">Referral</option>
            <option value="APPLICATION">Application</option>
            <option value="INTEREST">General Interest</option>
            <option value="FOLLOWUP">Follow-up</option>
          </select>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          >
            <option value="ALL">All Sources</option>
            <option value="MANUAL">Manual</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="LINKEDIN">LinkedIn</option>
          </select>
          <select
            value={followUpFilter}
            onChange={(e) => setFollowUpFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          >
            <option value="ALL">All Follow-ups</option>
            <option value="DONE">Followed up</option>
            <option value="PENDING">Not followed up</option>
          </select>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>
      </div>

      {hasActiveFilters && !isLoading && !error && (
        <p className="-mt-4 text-xs text-gray-500">
          Showing {filteredEmails?.length ?? 0} of {tabEmails?.length ?? 0} {activeTab === "REVIEW" ? "entries to review" : "campaigns"}
        </p>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : error ? (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-200">
          Failed to load emails: {(error as Error).message}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
                <tr>
                  {activeTab === "REVIEW" && (
                    <th className="pl-6 py-4 w-8">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </th>
                  )}
                  <th className="px-6 py-4 font-medium">Recipient</th>
                  <th className="px-6 py-4 font-medium">Company & Role</th>
                  <th className="px-6 py-4 font-medium">Type</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium">Activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredEmails?.map((entry) => (
                  <Fragment key={entry.id}>
                    <tr
                      className={cn("hover:bg-gray-50/50 transition-colors", entry.reviewStatus === "PENDING_REVIEW" && "bg-amber-50/40")}
                    >
                      {activeTab === "REVIEW" && (
                        <td className="pl-6 py-4 w-8">
                          {entry.reviewStatus === "PENDING_REVIEW" && (
                            <input
                              type="checkbox"
                              checked={selectedIds.has(entry.id)}
                              onChange={() => toggleSelection(entry.id)}
                              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                          )}
                        </td>
                      )}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 shrink-0 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs">
                            {((entry.name || entry.hrEmail || "?").charAt(0)).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-gray-900">{entry.name || entry.hrEmail}</p>
                              {getSourceBadge(entry.source)}
                            </div>
                            {entry.name && <p className="text-xs text-gray-500">{entry.hrEmail}</p>}
                            <p className="text-xs text-gray-400">Added {new Date(entry.createdAt).toLocaleDateString()}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-medium text-gray-900">{entry.companyName || "—"}</p>
                        <p className="text-xs text-gray-500">{entry.role}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700">{entry.emailType}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col items-start gap-1.5">
                          {getStatusBadge(entry.status)}
                          {entry.followUpDone && (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-purple-50 text-purple-700"
                              title={entry.followUpAt ? `Followed up on ${new Date(entry.followUpAt).toLocaleDateString()}` : "Follow-up reply sent"}
                            >
                              <MessageSquarePlus className="w-3 h-3" /> Followed up
                            </span>
                          )}
                        </div>
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
                            {entry.reviewStatus === "PENDING_REVIEW" ? (
                              <>
                                {/* Expand raw text */}
                                {entry.rawText && (
                                  <button
                                    onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                                    className="p-1.5 text-gray-500 bg-gray-50 hover:bg-gray-100 rounded-md transition-colors"
                                    title="Toggle original message"
                                  >
                                    {expandedId === entry.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                  </button>
                                )}
                                {/* Open review modal */}
                                <button
                                  onClick={() => openReview(entry)}
                                  className="p-1.5 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors"
                                  title="Review and edit before approving"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                {/* Quick approve */}
                                <button
                                  onClick={() => approveMutation.mutate(entry.id)}
                                  disabled={approveMutation.isPending}
                                  className="p-1.5 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors disabled:opacity-50"
                                  title="Quick approve"
                                >
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                </button>
                                {/* Discard */}
                                <button
                                  onClick={() => handleDiscard(entry)}
                                  className="p-1.5 text-red-600 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
                                  title="Discard entry"
                                >
                                  <ShieldX className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => {
                                    setFormData({ name: entry.name || "", hrEmail: entry.hrEmail, companyName: entry.companyName || "", role: entry.role, emailType: entry.emailType, jobId: entry.jobId || "", notes: entry.notes || "" });
                                    setEditingId(entry.id);
                                    setShowAddForm(true);
                                    window.scrollTo({ top: 0, behavior: "smooth" });
                                  }}
                                  className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                                  title="Edit details"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                {entry.status === "BACKLOG" ? (
                                  <button onClick={() => toggleBacklogMutation.mutate({ id: entry.id, newStatus: "PENDING" })} disabled={toggleBacklogMutation.isPending} className="p-1.5 text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-md transition-colors disabled:opacity-50" title="Restore to Pending"><ArchiveRestore className="w-3.5 h-3.5" /></button>
                                ) : entry.status !== "SENT" && (
                                  <>
                                    <button onClick={() => toggleBacklogMutation.mutate({ id: entry.id, newStatus: "BACKLOG" })} disabled={toggleBacklogMutation.isPending} className="p-1.5 text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-md transition-colors disabled:opacity-50" title="Move to Backlog"><Archive className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => sendSingleMutation.mutate(entry.id)} disabled={sendSingleMutation.isPending} className="p-1.5 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors disabled:opacity-50" title="Send Now"><Send className="w-3.5 h-3.5" /></button>
                                  </>
                                )}
                                {entry.status === "SENT" && (
                                  <>
                                    <button onClick={() => handleResend(entry)} disabled={sendSingleMutation.isPending} className="p-1.5 text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-md transition-colors disabled:opacity-50" title="Resend"><RefreshCw className="w-3.5 h-3.5" /></button>
                                    <button
                                      onClick={() => handleFollowUp(entry)}
                                      disabled={followUpMutation.isPending}
                                      className={`p-1.5 rounded-md transition-colors disabled:opacity-50 ${entry.followUpDone ? "text-purple-600 bg-purple-100 hover:bg-purple-200" : "text-emerald-600 bg-emerald-50 hover:bg-emerald-100"}`}
                                      title={entry.followUpDone ? "Follow-up sent — send another reply" : "Send Follow-up reply"}
                                    >
                                      <MessageSquarePlus className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => {
                                        toast.custom((t) => (
                                          <div className="bg-white rounded-lg shadow-lg p-4 border border-gray-200 flex gap-3">
                                            <div className="flex-1">
                                              <p className="font-semibold text-gray-900">Delete Campaign?</p>
                                              <p className="text-sm text-gray-600 mt-1">Permanently delete the campaign for {entry.hrEmail}.</p>
                                            </div>
                                            <div className="flex gap-2">
                                              <button onClick={() => toast.dismiss(t)} className="px-3 py-1 rounded text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200">Cancel</button>
                                              <button onClick={() => { toast.dismiss(t); deleteMutation.mutate(entry.id); }} className="px-3 py-1 rounded text-sm font-medium bg-red-600 text-white hover:bg-red-700">Delete</button>
                                            </div>
                                          </div>
                                        ));
                                      }}
                                      className="p-1.5 text-red-600 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
                                      title="Delete Campaign"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>

                    {/* Raw text expand row */}
                    {expandedId === entry.id && entry.rawText && (
                      <tr className="bg-amber-50/60">
                        <td colSpan={activeTab === "REVIEW" ? 6 : 5} className="px-6 py-3">
                          <p className="text-xs font-medium text-gray-500 mb-1">Original message</p>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{entry.rawText}</p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}

                {filteredEmails?.length === 0 && (
                  <tr>
                    <td colSpan={activeTab === "REVIEW" ? 6 : 5} className="px-6 py-12 text-center">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 mb-4">
                        <Mail className="w-6 h-6 text-gray-400" />
                      </div>
                      <p className="text-gray-900 font-medium text-sm">
                        {hasActiveFilters
                          ? "No matching entries"
                          : activeTab === "REVIEW" ? "No entries awaiting review" : "No campaigns yet"}
                      </p>
                      <p className="text-gray-500 text-sm mt-1">
                        {hasActiveFilters
                          ? "Try adjusting or clearing your search and filters."
                          : activeTab === "REVIEW" ? "Auto-ingested entries will appear here for approval." : "Create your first entry to get started."}
                      </p>
                      {hasActiveFilters && (
                        <button
                          onClick={clearFilters}
                          className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" /> Clear filters
                        </button>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Review Modal ──────────────────────────────────────────────────────── */}
      {reviewingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setReviewingEntry(null); }}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Review Entry</h3>
                <p className="text-xs text-gray-500 mt-0.5">Edit fields if needed, then approve or discard.</p>
              </div>
              <button onClick={() => setReviewingEntry(null)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md transition-colors"><X className="w-4 h-4" /></button>
            </div>

            {/* Original message */}
            {reviewingEntry.rawText && (
              <div className="px-6 pt-4">
                <p className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1.5">
                  {getSourceBadge(reviewingEntry.source)}
                  <span>Original message</span>
                </p>
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-700 whitespace-pre-wrap break-words max-h-36 overflow-y-auto">
                  {reviewingEntry.rawText}
                </div>
              </div>
            )}

            {/* Editable fields */}
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700 flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-gray-400" /> HR Email</label>
                  <input type="email" required value={reviewForm.hrEmail} onChange={(e) => setReviewForm({ ...reviewForm, hrEmail: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700 flex items-center gap-1.5"><User className="w-3.5 h-3.5 text-gray-400" /> Name</label>
                  <input type="text" value={reviewForm.name} onChange={(e) => setReviewForm({ ...reviewForm, name: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700 flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 text-gray-400" /> Company</label>
                  <input type="text" value={reviewForm.companyName} onChange={(e) => setReviewForm({ ...reviewForm, companyName: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700 flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5 text-gray-400" /> Role</label>
                  <input type="text" value={reviewForm.role} onChange={(e) => setReviewForm({ ...reviewForm, role: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700 flex items-center gap-1.5"><LayoutTemplate className="w-3.5 h-3.5 text-gray-400" /> Email Type</label>
                  <select value={reviewForm.emailType} onChange={(e) => setReviewForm({ ...reviewForm, emailType: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white">
                    <option value="REFERRAL">Referral Request</option>
                    <option value="APPLICATION">Job Application</option>
                    <option value="INTEREST">General Interest</option>
                  </select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700">Notes</label>
                  <textarea value={reviewForm.notes} onChange={(e) => setReviewForm({ ...reviewForm, notes: e.target.value })} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none" />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between px-6 pb-6">
              <button
                onClick={() => handleDiscard(reviewingEntry)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
              >
                <ShieldX className="w-4 h-4" /> Discard
              </button>
              <button
                onClick={() => reviewApproveMutation.mutate({ id: reviewingEntry.id, data: reviewForm })}
                disabled={reviewApproveMutation.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                <ShieldCheck className="w-4 h-4" />
                {reviewApproveMutation.isPending ? "Approving..." : "Approve"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
