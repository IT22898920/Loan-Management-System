export default function StaffDashboardLoading() {
  return (
    <div className="animate-pulse space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-5">
        <div className="h-3 w-24 bg-white/20 rounded mb-2" />
        <div className="h-6 w-40 bg-white/30 rounded mb-2" />
        <div className="h-3 w-32 bg-white/10 rounded" />
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="h-3 w-20 bg-gray-200 rounded mb-2" />
            <div className="h-6 w-24 bg-gray-200 rounded" />
          </div>
        ))}
      </div>

      {/* Center list */}
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-gray-200" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-32 bg-gray-200 rounded" />
                <div className="h-3 w-24 bg-gray-100 rounded" />
              </div>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
