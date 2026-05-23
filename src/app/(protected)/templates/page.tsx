"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { FileText, Save, LayoutTemplate, PenLine, Trash2, Bold, Italic, Link2, List, ListOrdered } from "lucide-react";
import { toast } from "sonner";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Helper function to wrap selected text with HTML tags
const wrapSelection = (textarea: HTMLTextAreaElement, tag: string, attributes = "") => {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selectedText = textarea.value.substring(start, end);
  const openTag = `<${tag}${attributes ? ` ${attributes}` : ""}>`;
  const closeTag = `</${tag}>`;
  const before = textarea.value.substring(0, start);
  const after = textarea.value.substring(end);
  const newValue = before + openTag + selectedText + closeTag + after;
  
  return newValue;
};

const insertTag = (textarea: HTMLTextAreaElement, tag: string, placeholder: string) => {
  const start = textarea.selectionStart;
  const text = `<${tag}>${placeholder}</${tag}>`;
  const before = textarea.value.substring(0, start);
  const after = textarea.value.substring(start);
  return before + text + after;
};

export default function TemplatesPage() {
  const queryClient = useQueryClient();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [formData, setFormData] = useState({
    type: "REFERRAL",
    subject: "",
    body: "",
  });
  const [showPreview, setShowPreview] = useState(false);

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
      if (!res.ok) throw new Error("Failed to save template");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast.success("Template saved successfully");
      setFormData({ type: "REFERRAL", subject: "", body: "" });
      setShowPreview(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to save template");
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      <header>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">Email Templates</h2>
        <p className="text-sm text-gray-500 mt-1">Design the content for your automated emails.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Editor Form */}
        <div className="lg:col-span-5">
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden sticky top-6">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50 flex items-center gap-2">
              <PenLine className="w-4 h-4 text-gray-500" />
              <h3 className="text-base font-semibold text-gray-900">Template Editor</h3>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <LayoutTemplate className="w-4 h-4 text-gray-400" /> Type
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow bg-white"
                >
                  <option value="REFERRAL">Referral Request</option>
                  <option value="APPLICATION">Job Application</option>
                  <option value="INTEREST">General Interest</option>
                  <option value="FOLLOWUP">Follow-up Message</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Subject</label>
                <input
                  type="text"
                  required
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow"
                  placeholder="e.g. Opportunity at {{company}}"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">
                  Body <span className="text-gray-400 font-normal">(Supports HTML & {"{{company}}"}, {"{{role}}"})</span>
                </label>
                
                {/* HTML Formatting Toolbar */}
                <div className="flex flex-wrap gap-1 p-2 border border-gray-300 rounded-lg bg-gray-50 mb-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (textareaRef.current) {
                        const newBody = wrapSelection(textareaRef.current, "strong");
                        setFormData({ ...formData, body: newBody });
                        textareaRef.current.focus();
                      }
                    }}
                    title="Bold"
                    className="p-2 hover:bg-gray-200 rounded transition-colors flex items-center justify-center"
                  >
                    <Bold className="w-4 h-4 text-gray-700" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (textareaRef.current) {
                        const newBody = wrapSelection(textareaRef.current, "em");
                        setFormData({ ...formData, body: newBody });
                        textareaRef.current.focus();
                      }
                    }}
                    title="Italic"
                    className="p-2 hover:bg-gray-200 rounded transition-colors flex items-center justify-center"
                  >
                    <Italic className="w-4 h-4 text-gray-700" />
                  </button>
                  <div className="border-l border-gray-300 mx-1"></div>
                  <button
                    type="button"
                    onClick={() => {
                      if (textareaRef.current) {
                        const newBody = insertTag(textareaRef.current, "p", "Your text here");
                        setFormData({ ...formData, body: newBody });
                        textareaRef.current.focus();
                      }
                    }}
                    title="Paragraph"
                    className="p-2 hover:bg-gray-200 rounded transition-colors text-xs font-medium text-gray-700"
                  >
                    P
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (textareaRef.current) {
                        const newBody = insertTag(textareaRef.current, "h3", "Heading");
                        setFormData({ ...formData, body: newBody });
                        textareaRef.current.focus();
                      }
                    }}
                    title="Heading"
                    className="p-2 hover:bg-gray-200 rounded transition-colors text-xs font-medium text-gray-700"
                  >
                    H3
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (textareaRef.current) {
                        const newBody = insertTag(textareaRef.current, "ul", "<li>Item</li>");
                        setFormData({ ...formData, body: newBody });
                        textareaRef.current.focus();
                      }
                    }}
                    title="Bullet List"
                    className="p-2 hover:bg-gray-200 rounded transition-colors flex items-center justify-center"
                  >
                    <List className="w-4 h-4 text-gray-700" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (textareaRef.current) {
                        const newBody = insertTag(textareaRef.current, "ol", "<li>Item</li>");
                        setFormData({ ...formData, body: newBody });
                        textareaRef.current.focus();
                      }
                    }}
                    title="Numbered List"
                    className="p-2 hover:bg-gray-200 rounded transition-colors flex items-center justify-center"
                  >
                    <ListOrdered className="w-4 h-4 text-gray-700" />
                  </button>
                  <div className="border-l border-gray-300 mx-1"></div>
                  <button
                    type="button"
                    onClick={() => {
                      if (textareaRef.current) {
                        const newBody = insertTag(textareaRef.current, "a", "link");
                        setFormData({ ...formData, body: newBody });
                        textareaRef.current.focus();
                      }
                    }}
                    title="Link"
                    className="p-2 hover:bg-gray-200 rounded transition-colors flex items-center justify-center"
                  >
                    <Link2 className="w-4 h-4 text-gray-700" />
                  </button>
                  <div className="flex-1"></div>
                  <button
                    type="button"
                    onClick={() => setShowPreview(!showPreview)}
                    className="px-3 py-1 hover:bg-gray-200 rounded transition-colors text-xs font-medium text-gray-700 bg-white border border-gray-300"
                  >
                    {showPreview ? "Edit" : "Preview"}
                  </button>
                </div>

                {/* Textarea */}
                <textarea
                  ref={textareaRef}
                  required
                  rows={12}
                  value={formData.body}
                  onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                  className={cn(
                    "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow resize-none",
                    showPreview && "hidden"
                  )}
                  placeholder="<p>Hi {{name}},</p>&#10;<p>Your email body here...</p>&#10;<p>Thanks and regards,<br>Siser Pratap</p>"
                />

                {/* HTML Preview */}
                {showPreview && (
                  <div className="w-full border border-gray-300 rounded-lg p-4 bg-white text-sm max-h-80 overflow-y-auto [&_a]:text-blue-600 [&_a:hover]:underline [&_strong]:font-bold [&_em]:italic [&_p]:mb-3 [&_h3]:font-bold [&_h3]:text-lg [&_h3]:mb-2 [&_ul]:list-disc [&_ul]:ml-5 [&_ol]:list-decimal [&_ol]:ml-5 [&_li]:mb-1">
                    <div dangerouslySetInnerHTML={{ __html: formData.body }} />
                  </div>
                )}
              </div>
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="w-full inline-flex justify-center items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {saveMutation.isPending ? "Saving..." : <><Save className="w-4 h-4" /> Save Template</>}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Templates List */}
        <div className="lg:col-span-7">
          <div className="space-y-4">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              </div>
            ) : templates?.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-12 text-center shadow-sm">
                <FileText className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                <h3 className="text-sm font-medium text-gray-900">No templates found</h3>
                <p className="text-sm text-gray-500 mt-1">Create your first template using the editor.</p>
              </div>
            ) : (
              templates?.map((tpl: any) => (
                <div key={tpl.id} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden group hover:border-indigo-200 transition-colors">
                  <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/30">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                        {tpl.type}
                      </span>
                    </div>
                    <button
                      onClick={() => setFormData({ type: tpl.type, subject: tpl.subject, body: tpl.body })}
                      className="text-sm font-medium text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity hover:text-indigo-800 focus:opacity-100"
                    >
                      Edit Content
                    </button>
                  </div>
                  <div className="p-6">
                    <p className="text-sm font-medium text-gray-900 mb-2">
                      <span className="text-gray-400 font-normal mr-2">Subj:</span> 
                      {tpl.subject}
                    </p>
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-100 max-h-64 overflow-y-auto [&_a]:text-blue-600 [&_a:hover]:underline [&_strong]:font-bold [&_em]:italic [&_p]:mb-3 [&_h3]:font-bold [&_h3]:text-lg [&_h3]:mb-2 [&_ul]:list-disc [&_ul]:ml-5 [&_ol]:list-decimal [&_ol]:ml-5 [&_li]:mb-1 text-sm text-gray-600 leading-relaxed">
                      <div dangerouslySetInnerHTML={{ __html: tpl.body }} />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
