export default function AdminDashboardLoading() {
  return (
    <div className="min-h-screen bg-gray-50/50 animate-pulse">
      {/* Header skeleton */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white">
        <div className="px-4 md:px-8 py-6 md:py-8">
          <div className="h-3 w-32 bg-white/20 rounded mb-2" />
          <div className="h-7 w-40 bg-white/30 rounded mb-2" />
          <div className="h-3 w-56 bg-white/10 rounded" />

          <div className="mt-6 grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white/10 rounded-2xl p-4 border border-white/20">
                <div className="h-3 w-20 bg-white/20 rounded mb-2" />
                <div className="h-6 w-28 bg-white/30 rounded mb-2" />
                <div className="h-3 w-16 bg-white/20 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 space-y-5">
        {/* Quick actions skeleton */}
        <div>
          <div className="h-3 w-24 bg-gray-200 rounded mb-3" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl p-4 h-16 shadow-sm border border-gray-100" />
            ))}
          </div>
        </div>

        {/* Chart skeleton */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <div className="h-4 w-32 bg-gray-200 rounded mb-1" />
            <div className="h-3 w-20 bg-gray-100 rounded" />
          </div>
          <div className="p-5 h-48 bg-gray-50 rounded" />
        </div>

        {/* Two-column row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 h-72" />
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 h-72" />
        </div>
      </div>
    </div>
  );
}
