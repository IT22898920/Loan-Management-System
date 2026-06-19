export default function AdminCenterDetailLoading() {
  return (
    <div className="min-h-screen bg-gray-50/50 animate-pulse">
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 px-4 md:px-8 py-6 md:py-8">
        <div className="h-3 w-32 bg-white/20 rounded mb-3" />
        <div className="h-7 w-56 bg-white/30 rounded mb-2" />
        <div className="h-3 w-40 bg-white/20 rounded" />

        <div className="mt-5 grid grid-cols-3 gap-3 max-w-md">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white/10 rounded-2xl p-3 border border-white/20 h-16" />
          ))}
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gray-200" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-40 bg-gray-200 rounded" />
                <div className="h-3 w-24 bg-gray-100 rounded" />
              </div>
              <div className="h-5 w-20 bg-gray-100 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
