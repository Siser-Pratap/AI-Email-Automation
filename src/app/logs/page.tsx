"use client";

import { useQuery } from "@tanstack/react-query";

export default function LogsPage() {
  const { data: logs, isLoading } = useQuery({
    queryKey: ["logs"],
    queryFn: async () => {
      const res = await fetch("/api/logs");
      return res.json();
    },
  });

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Email Logs</h2>

      {isLoading ? (
        <div>Loading...</div>
      ) : (
        <div className="bg-white rounded shadow overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b">
                <th className="p-3">Time</th>
                <th className="p-3">Email</th>
                <th className="p-3">Status</th>
                <th className="p-3">Response / Error</th>
              </tr>
            </thead>
            <tbody>
              {logs?.map((log: any) => (
                <tr key={log.id} className="border-b">
                  <td className="p-3 text-sm text-gray-600">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="p-3">{log.emailEntry?.hrEmail || "Unknown"}</td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-bold ${
                        log.status === "SUCCESS"
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {log.status}
                    </span>
                  </td>
                  <td className="p-3 text-sm font-mono max-w-xs truncate" title={log.response}>
                    {log.response}
                  </td>
                </tr>
              ))}
              {logs?.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-gray-500">
                    No logs found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
