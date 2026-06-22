"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Filter,
  MailPlus,
  MessageCircle,
  Search,
  ShieldCheck,
  ShieldX,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type WhatsAppMessage = {
  id: string;
  waMessageId: string;
  groupJid: string;
  groupName: string | null;
  senderJid: string;
  senderName: string | null;
  text: string;
  messageAt: string;
};

type WhatsAppLead = {
  id: string;
  category: string;
  tags: string[];
  confidence: number;
  personName: string | null;
  companyName: string | null;
  role: string | null;
  location: string | null;
  emails: string[];
  phones: string[];
  linkedinUrls: string[];
  websiteUrls: string[];
  twitterUrls: string[];
  githubUrls: string[];
  portfolioUrls: string[];
  recommendedAction: string | null;
  outreachChannel: string | null;
  emailType: string | null;
  notes: string | null;
  reviewStatus: string;
  emailEntryId: string | null;
  createdAt: string;
  message: WhatsAppMessage;
};

type LeadsResponse = {
  leads: WhatsAppLead[];
  groups: { groupJid: string; groupName: string | null }[];
};

const categories = [
  "REFERRAL_EMAIL_FOUND",
  "HIRING_POST",
  "SERVICE_PROSPECT",
  "PEER_NETWORKING",
  "FOUNDER_OR_DECISION_MAKER",
  "COLLABORATION",
  "RESOURCE_OR_COMMUNITY",
  "LOW_SIGNAL",
  "IGNORE",
];

const reviewStatuses = ["PENDING_REVIEW", "APPROVED", "DISCARDED"];

function label(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function statusBadge(status: string) {
  if (status === "APPROVED") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }
  if (status === "DISCARDED") {
    return "bg-red-50 text-red-700 border-red-200";
  }
  return "bg-amber-50 text-amber-700 border-amber-200";
}

function categoryBadge(category: string) {
  if (category === "IGNORE") return "bg-gray-100 text-gray-600 border-gray-200";
  if (category === "LOW_SIGNAL") return "bg-amber-50 text-amber-700 border-amber-200";
  if (category === "REFERRAL_EMAIL_FOUND" || category === "HIRING_POST") return "bg-indigo-50 text-indigo-700 border-indigo-200";
  if (category === "SERVICE_PROSPECT" || category === "FOUNDER_OR_DECISION_MAKER") return "bg-cyan-50 text-cyan-700 border-cyan-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

function firstContact(lead: WhatsAppLead) {
  return lead.emails[0] ?? lead.phones[0] ?? lead.linkedinUrls[0] ?? lead.websiteUrls[0] ?? "No contact";
}

function hasContactType(lead: WhatsAppLead, type: string) {
  if (type === "EMAIL") return lead.emails.length > 0;
  if (type === "PHONE") return lead.phones.length > 0;
  if (type === "LINKEDIN") return lead.linkedinUrls.length > 0;
  if (type === "WEBSITE") return lead.websiteUrls.length > 0;
  return true;
}

function buildIntro(lead: WhatsAppLead) {
  const name = lead.personName ? ` ${lead.personName}` : "";
  const company = lead.companyName ? ` at ${lead.companyName}` : "";
  const context = lead.role || lead.category.toLowerCase().replaceAll("_", " ");
  return `Hi${name}, I saw your message${company} about ${context}. ${lead.recommendedAction ?? "Would love to connect and see if I can help."}`;
}

export default function WhatsAppLeadsPage() {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState("ALL");
  const [reviewStatus, setReviewStatus] = useState("PENDING_REVIEW");
  const [contactType, setContactType] = useState("ALL");
  const [groupJid, setGroupJid] = useState("ALL");
  const [minConfidence, setMinConfidence] = useState("0");
  const [search, setSearch] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams({ limit: "150" });
    if (category !== "ALL") params.set("category", category);
    if (reviewStatus !== "ALL") params.set("reviewStatus", reviewStatus);
    if (contactType !== "ALL") params.set("contactType", contactType);
    if (groupJid !== "ALL") params.set("groupJid", groupJid);
    if (Number(minConfidence) > 0) params.set("minConfidence", minConfidence);
    return params.toString();
  }, [category, reviewStatus, contactType, groupJid, minConfidence]);

  const { data, isLoading } = useQuery({
    queryKey: ["whatsapp-leads", query],
    queryFn: async () => {
      const res = await fetch(`/api/whatsapp/leads?${query}`);
      const payload = await res.json() as LeadsResponse | { error?: string };
      if (!res.ok) throw new Error("error" in payload && payload.error ? payload.error : "Failed to fetch WhatsApp leads");
      return payload as LeadsResponse;
    },
  });

  const leads = useMemo(() => {
    const text = search.trim().toLowerCase();
    const rows = data?.leads ?? [];
    if (!text) return rows;
    return rows.filter((lead) => [
      lead.personName,
      lead.companyName,
      lead.role,
      lead.location,
      lead.message.groupName,
      lead.message.senderName,
      lead.message.text,
      firstContact(lead),
    ].filter(Boolean).join(" ").toLowerCase().includes(text));
  }, [data?.leads, search]);

  const pendingCount = leads.filter((lead) => lead.reviewStatus === "PENDING_REVIEW").length;
  const emailReadyCount = leads.filter((lead) => lead.reviewStatus === "APPROVED" && lead.emails.length > 0 && !lead.emailEntryId).length;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["whatsapp-leads"] });
    queryClient.invalidateQueries({ queryKey: ["whatsapp-review-count"] });
  };

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, nextStatus }: { id: string; nextStatus: string }) => {
      const res = await fetch(`/api/whatsapp/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewStatus: nextStatus }),
      });
      const payload = await res.json() as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Failed to update lead");
      return payload;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Lead updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createEmailMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/whatsapp/leads/${id}/create-email`, { method: "POST" });
      const payload = await res.json() as { error?: string; message?: string };
      if (!res.ok) throw new Error(payload.error ?? "Failed to create email entry");
      return payload;
    },
    onSuccess: (payload) => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      queryClient.invalidateQueries({ queryKey: ["review-count"] });
      toast.success(payload.message ?? "Email entry created");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const copyText = async (text: string, message: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(message);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700">
            <MessageCircle className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-gray-900">WhatsApp Leads</h2>
            <p className="text-sm text-gray-500 mt-1">Review extracted opportunities before outreach.</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
            <p className="text-gray-500">Visible</p>
            <p className="text-xl font-semibold text-gray-900">{leads.length}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
            <p className="text-gray-500">Pending</p>
            <p className="text-xl font-semibold text-amber-700">{pendingCount}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
            <p className="text-gray-500">Email-ready</p>
            <p className="text-xl font-semibold text-indigo-700">{emailReadyCount}</p>
          </div>
        </div>
      </header>

      <section className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-4">
          <Filter className="w-4 h-4 text-gray-400" /> Filters
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-gray-500">Search</span>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Company, sender, text" />
            </div>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-gray-500">Review</span>
            <select value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="ALL">All</option>
              {reviewStatuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-gray-500">Category</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="ALL">All</option>
              {categories.map((item) => <option key={item} value={item}>{label(item)}</option>)}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-gray-500">Contact</span>
            <select value={contactType} onChange={(event) => setContactType(event.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="ALL">All</option>
              <option value="EMAIL">Email</option>
              <option value="PHONE">Phone</option>
              <option value="LINKEDIN">LinkedIn</option>
              <option value="WEBSITE">Website</option>
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-gray-500">Group</span>
            <select value={groupJid} onChange={(event) => setGroupJid(event.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="ALL">All</option>
              {data?.groups.map((group) => <option key={group.groupJid} value={group.groupJid}>{group.groupName ?? group.groupJid}</option>)}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-gray-500">Min confidence</span>
            <input value={minConfidence} onChange={(event) => setMinConfidence(event.target.value)} type="number" min="0" max="1" step="0.05" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </label>
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm align-top">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
                <tr>
                  <th className="px-5 py-4 font-medium min-w-[280px]">Lead</th>
                  <th className="px-5 py-4 font-medium min-w-[240px]">Contacts</th>
                  <th className="px-5 py-4 font-medium min-w-[300px]">Message</th>
                  <th className="px-5 py-4 font-medium min-w-[250px]">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {leads.map((lead) => (
                  <tr key={lead.id} className={cn("hover:bg-gray-50/60 transition-colors", !hasContactType(lead, contactType) && "hidden")}>
                    <td className="px-5 py-5 align-top">
                      <div className="space-y-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className={cn("inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border", categoryBadge(lead.category))}>{label(lead.category)}</span>
                            <span className={cn("inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border", statusBadge(lead.reviewStatus))}>{label(lead.reviewStatus)}</span>
                            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border bg-gray-50 text-gray-700 border-gray-200">{Math.round(lead.confidence * 100)}%</span>
                          </div>
                          <p className="font-semibold text-gray-900">{lead.companyName || lead.personName || lead.role || "Untitled lead"}</p>
                          <p className="text-xs text-gray-500 mt-1">{[lead.personName, lead.role, lead.location].filter(Boolean).join(" · ") || "No person details"}</p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {lead.tags.slice(0, 5).map((tag) => <span key={tag} className="text-xs px-2 py-1 rounded-md bg-gray-100 text-gray-600">{tag}</span>)}
                        </div>
                        <p className="text-xs text-gray-500">{lead.message.groupName ?? lead.message.groupJid} · {new Date(lead.message.messageAt).toLocaleString()}</p>
                      </div>
                    </td>
                    <td className="px-5 py-5 align-top">
                      <div className="space-y-2">
                        {[...lead.emails, ...lead.phones].slice(0, 4).map((contact) => (
                          <button key={contact} onClick={() => copyText(contact, "Contact copied")} className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50">
                            <span className="truncate">{contact}</span>
                            <Copy className="w-3.5 h-3.5 text-gray-400" />
                          </button>
                        ))}
                        {[...lead.linkedinUrls, ...lead.websiteUrls, ...lead.twitterUrls, ...lead.githubUrls, ...lead.portfolioUrls].slice(0, 5).map((url) => (
                          <a key={url} href={url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
                            <span className="truncate">{url}</span>
                            <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
                          </a>
                        ))}
                        {firstContact(lead) === "No contact" ? <p className="text-xs text-gray-500">No contact extracted</p> : null}
                      </div>
                    </td>
                    <td className="px-5 py-5 align-top">
                      <div className="space-y-3">
                        <p className="text-sm text-gray-700 line-clamp-4">{lead.message.text}</p>
                        <p className="text-xs text-gray-500">From {lead.message.senderName ?? lead.message.senderJid}</p>
                        {lead.notes ? <p className="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">{lead.notes}</p> : null}
                      </div>
                    </td>
                    <td className="px-5 py-5 align-top">
                      <div className="space-y-3">
                        <p className="text-sm text-gray-700">{lead.recommendedAction ?? "Review manually before outreach."}</p>
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={() => updateStatusMutation.mutate({ id: lead.id, nextStatus: "APPROVED" })} disabled={lead.reviewStatus === "APPROVED"} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                            <ShieldCheck className="w-3.5 h-3.5" /> Approve
                          </button>
                          <button onClick={() => updateStatusMutation.mutate({ id: lead.id, nextStatus: "DISCARDED" })} disabled={lead.reviewStatus === "DISCARDED"} className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50">
                            <ShieldX className="w-3.5 h-3.5" /> Discard
                          </button>
                          <button onClick={() => createEmailMutation.mutate(lead.id)} disabled={lead.reviewStatus !== "APPROVED" || lead.emails.length === 0 || Boolean(lead.emailEntryId)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                            <MailPlus className="w-3.5 h-3.5" /> Email
                          </button>
                          <button onClick={() => copyText(buildIntro(lead), "Intro copied")} className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">
                            <Copy className="w-3.5 h-3.5" /> Intro
                          </button>
                        </div>
                        {lead.emailEntryId ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" /> Email entry linked</span>
                        ) : lead.reviewStatus !== "APPROVED" ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500"><XCircle className="w-3.5 h-3.5" /> Approve before email creation</span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {leads.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center">
                      <MessageCircle className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-900 font-medium text-sm">No WhatsApp leads match these filters</p>
                      <p className="text-gray-500 text-sm mt-1">Run the daily analyzer or widen the filters.</p>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}