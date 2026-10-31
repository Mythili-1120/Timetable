'use client';

import React, { useEffect, useState } from 'react';
import { getPublishedTimetables } from '../../../lib/services/timetableService';
import { PublishedTimetable } from '../../../types';
import { History, Eye, Calendar, Clock, User, CheckCircle2 } from 'lucide-react';

export default function HistoryPage() {
  const [historyList, setHistoryList] = useState<PublishedTimetable[]>([]);
  const [selectedTimetable, setSelectedTimetable] = useState<PublishedTimetable | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const data = await getPublishedTimetables();
      // Sort newest published first
      data.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
      setHistoryList(data);
      if (data.length > 0) setSelectedTimetable(data[0]);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Timetable History & Archives</h1>
        <p className="text-sm text-slate-500">
          Permanent immutable version records of all published institutional class timetables
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Version List Sidebar */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-2 h-[750px] overflow-y-auto">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 px-1">
            Published Versions ({historyList.length})
          </h2>

          {historyList.length === 0 ? (
            <p className="text-xs text-slate-400 italic p-4 text-center">No published timetables recorded yet.</p>
          ) : (
            historyList.map((item) => {
              const isSelected = selectedTimetable?.timetableId === item.timetableId;

              return (
                <div
                  key={item.timetableId}
                  onClick={() => setSelectedTimetable(item)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-brand-50/70 border-brand-500 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-900">{item.classLabel}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-600 text-white">
                      v{item.versionNumber}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-slate-500 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>{item.academicYear} • {item.departmentId.replace('dept-', '').toUpperCase()}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{new Date(item.publishedAt).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Selected Version Preview */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-6 shadow-xs h-[750px] overflow-y-auto">
          {selectedTimetable ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900">{selectedTimetable.classLabel}</h2>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      Version {selectedTimetable.versionNumber} (Permanent Snapshot)
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Published on {new Date(selectedTimetable.publishedAt).toLocaleString()} by Administrator UID: {selectedTimetable.publishedBy}
                  </p>
                </div>
              </div>

              {/* Grid Snapshot */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 border-b border-slate-300 font-bold uppercase">
                      <th className="p-2 w-24 text-left border border-slate-300">Day</th>
                      {[1, 2, 3, 4, 5, 6, 7].map(n => (
                        <th key={n} className="p-2 text-center border border-slate-300">Period {n}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, dIdx) => (
                      <tr key={day}>
                        <td className="p-2 font-bold text-slate-900 bg-slate-50 border border-slate-300">{day}</td>
                        {selectedTimetable.grid[dIdx]?.map((slot, pIdx) => (
                          <td
                            key={pIdx}
                            className={`p-1.5 text-center border border-slate-300 h-14 align-top ${
                              slot
                                ? slot.type === 'Lab'
                                  ? 'bg-amber-50/70'
                                  : 'bg-blue-50/70'
                                : 'bg-white'
                            }`}
                          >
                            {slot ? (
                              <div className="flex flex-col justify-between h-full">
                                <span className="font-bold text-slate-900 block truncate">{slot.subjectCode}</span>
                                <span className="text-[10px] text-slate-600 truncate">{slot.staffName}</span>
                              </div>
                            ) : (
                              <span className="text-slate-300 text-[10px]">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Snapshot Allocations List */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                  Archived Curriculum Snapshot ({selectedTimetable.allocations.length} Assigned Periods)
                </h4>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-600 font-semibold uppercase text-[10px] border-b border-slate-200">
                      <tr>
                        <th className="p-2">Subject Code</th>
                        <th className="p-2">Subject Name</th>
                        <th className="p-2">Type</th>
                        <th className="p-2">Snapshot Staff Name</th>
                        <th className="p-2">Permanent ID</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedTimetable.allocations.map((alloc, idx) => (
                        <tr key={idx}>
                          <td className="p-2 font-bold text-slate-900">{alloc.subjectCode}</td>
                          <td className="p-2 text-slate-700">{alloc.subjectName}</td>
                          <td className="p-2">{alloc.type}</td>
                          <td className="p-2 font-semibold text-brand-700">{alloc.staffName}</td>
                          <td className="p-2 font-mono text-[10px] text-slate-500">{alloc.memberId}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">
              Select a published timetable from the archive list to view its immutable version record.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

