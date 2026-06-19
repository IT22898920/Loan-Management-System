export default function StaffCenterDetailLoading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-5">
        <div className="h-3 w-24 bg-white/20 rounded mb-2" />
        <div className="h-6 w-40 bg-white/30 rounded mb-2" />
        <div className="h-3 w-32 bg-white/10 rounded" />
      </div>

      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 h-16" />
        ))}
      </div>

      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gray-200 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-32 bg-gray-200 rounded" />
                <div className="h-3 w-20 bg-gray-100 rounded" />
              </div>
              <div className="h-9 w-20 bg-gray-100 rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
