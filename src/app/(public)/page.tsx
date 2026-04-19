import Link from "next/link";
import { Send, Bot, Zap, ShieldCheck, ArrowRight } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto border-b border-gray-100">
        <div className="flex items-center gap-2 text-indigo-600">
          <Send className="w-6 h-6" />
          <span className="text-xl font-bold tracking-tight text-gray-900">
            AutoMail<span className="text-indigo-600">.ai</span>
          </span>
        </div>
        <Link 
          href="/login"
          className="text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors"
        >
          Administrator Login
        </Link>
      </nav>

      {/* Hero Section */}
      <section className="px-6 py-24 sm:py-32 max-w-7xl mx-auto text-center animate-in fade-in slide-in-from-bottom-8 duration-700">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 text-sm font-medium mb-8">
          <Zap className="w-4 h-4" /> Now powered by OpenAI
        </div>
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-gray-900 mb-6 max-w-4xl mx-auto leading-tight">
          Automate your HR outreach with <span className="text-indigo-600">Precision.</span>
        </h1>
        <p className="text-xl text-gray-500 mb-10 max-w-2xl mx-auto leading-relaxed">
          The all-in-one smart dashboard for scheduling, managing, and tracking referral requests, job applications, and general interests. Built for velocity.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 bg-indigo-600 text-white px-8 py-4 rounded-xl font-semibold hover:bg-indigo-700 hover:scale-105 transition-all shadow-lg shadow-indigo-200"
          >
            Access Dashboard <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Features Section */}
      <section className="bg-gray-50/50 py-24 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-3 gap-12">
          {/* Feature 1 */}
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-6">
              <Bot className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">AI-Generated Content</h3>
            <p className="text-gray-500 leading-relaxed">
              Don&apos;t know what to write? Our platform uses state-of-the-art LLMs to draft compelling, personalized HR outreach emails automatically.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-6">
              <Zap className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">Smart Scheduling</h3>
            <p className="text-gray-500 leading-relaxed">
              Set it and forget it. Our reliable cron engine ensures your emails land in inboxes right on time, maximizing open and response rates.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
            <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center mb-6">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">Secure & Private</h3>
            <p className="text-gray-500 leading-relaxed">
              Protected by a secure administrator layer. Manage templates, view historical send logs, and monitor delivery statuses safely.
            </p>
          </div>
        </div>
      </section>
      
      {/* Footer */}
      <footer className="py-8 text-center text-gray-400 text-sm border-t border-gray-100">
        &copy; {new Date().getFullYear()} AutoMail.ai. All rights reserved.
      </footer>
    </div>
  );
}
