"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, ArrowRight, Send, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const [pin, setPin] = useState(""); 
  const [error, setError] = useState(false);
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validPin = process.env.NEXT_PUBLIC_ADMIN_PIN || "171020";
    
    if (pin === validPin) {
      // Set a simple cookie
      document.cookie = `admin_token=${validPin}; path=/; max-age=86400`; // 1 day expiration
      router.push("/dashboard");
    } else {
      setError(true);
      setPin("");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex justify-center text-indigo-600 mb-6">
          <Send className="w-10 h-10" />
        </div>
        <h2 className="text-center text-3xl font-extrabold text-gray-900 tracking-tight">
          Admin Portal
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Enter your 6-digit PIN to access the dashboard
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md animate-in fade-in duration-700 delay-150">
        <div className="bg-white py-8 px-4 shadow-xl shadow-indigo-100/50 sm:rounded-2xl sm:px-10 border border-gray-100">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="pin" className="block text-sm font-medium text-gray-700">
                Security PIN
              </label>
              <div className="mt-2 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="pin"
                  name="pin"
                  type="password"
                  maxLength={6}
                  required
                  value={pin}
                  onChange={(e) => {
                    setPin(e.target.value);
                    setError(false);
                  }}
                  className={`block w-full pl-10 pr-3 py-3 border ${
                    error ? "border-red-300 focus:ring-red-500 focus:border-red-500" : "border-gray-300 focus:ring-indigo-500 focus:border-indigo-500"
                  } rounded-xl text-center text-xl tracking-[0.5em] focus:outline-none focus:ring-2 sm:text-lg transition-colors`}
                  placeholder="••••••"
                />
              </div>
              {error && (
                <p className="mt-2 text-sm text-red-600 flex items-center gap-1.5 animate-in slide-in-from-top-1">
                  <AlertCircle className="w-4 h-4" /> Incorrect PIN. Please try again.
                </p>
              )}
            </div>

            <div>
              <button
                type="submit"
                className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all hover:scale-[1.02]"
              >
                Authenticate <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
