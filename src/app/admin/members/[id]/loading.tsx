export default function AdminMemberDetailLoading() {
  return (
    <div className="min-h-screen bg-gray-50/50 animate-pulse">
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 px-4 md:px-8 py-6 md:py-8">
        <div className="h-3 w-32 bg-white/20 rounded mb-3" />
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-white/20" />
          <div className="space-y-2">
            <div className="h-6 w-48 bg-white/30 rounded" />
            <div className="h-3 w-32 bg-white/20 rounded" />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 max-w-sm">
          <div className="bg-white/10 rounded-2xl p-4 h-20" />
          <div className="bg-white/10 rounded-2xl p-4 h-20" />
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 space-y-5">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="h-4 w-32 bg-gray-200 rounded mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="bg-gray-50 rounded-xl p-4 h-16" />
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <div className="h-4 w-32 bg-gray-200 rounded" />
          </div>
          <div className="divide-y divide-gray-50">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="px-5 py-3 flex items-center justify-between">
                <div className="space-y-1.5">
                  <div className="h-3 w-24 bg-gray-200 rounded" />
                  <div className="h-3 w-16 bg-gray-100 rounded" />
                </div>
                <div className="h-4 w-20 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
