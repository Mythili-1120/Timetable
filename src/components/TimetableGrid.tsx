'use client';

import React from 'react';
import { PeriodDefinition, TimetableSlot } from '../types';

export interface TimetablePeriod {
  id?: string;
  name?: string;
  time?: string;
  startTime?: string;
  endTime?: string;
  isBreak?: boolean;
}

export interface TimetableGridProps {
  grid: (TimetableSlot | null)[][];
  teachingPeriods: (PeriodDefinition | TimetablePeriod)[];
  days: string[];
  isEditable?: boolean;
  selectedSlot?: { dayIdx: number; periodIdx: number } | null;
  onSlotClick?: (dayIdx: number, periodIdx: number) => void;
  slotSubtitleType?: 'staff' | 'class'; // 'staff' displays staffName + memberId; 'class' displays classLabel + dept
  className?: string;
}

/**
 * Canonical Timetable Grid Component
 * Shared visual rendering engine used identically across Timetable Viewer and Timetable Generator.
 */
export default function TimetableGrid({
  grid,
  teachingPeriods,
  days,
  isEditable = false,
  selectedSlot = null,
  onSlotClick,
  slotSubtitleType = 'staff',
  className = ''
}: TimetableGridProps) {
  const isClickable = Boolean(isEditable && onSlotClick);

  return (
    <div className={`border border-slate-300 rounded-lg overflow-x-auto bg-white ${className}`}>
      <table className="w-full text-center text-xs border-collapse min-w-[700px]">
        <thead>
          <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300">
            <th className="py-2.5 px-3 border-r border-slate-300 w-24 text-left font-bold text-slate-800">
              Day
            </th>
            {teachingPeriods.map((p, idx) => {
              const periodName = p.name || `Period ${idx + 1}`;
              const periodTime =
                p.time ||
                (p.startTime && p.endTime ? `${p.startTime} - ${p.endTime}` : '');

              return (
                <th
                  key={p.id || idx}
                  className="py-2.5 px-2 border-r border-slate-300 last:border-r-0 min-w-[110px]"
                >
                  <div className="font-bold text-slate-800">{periodName}</div>
                  {periodTime && (
                    <div className="text-[10px] text-slate-500 font-normal">
                      {periodTime}
                    </div>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {days.map((day, dIdx) => (
            <tr key={day} className="hover:bg-slate-50/50 transition-colors">
              <td className="py-3 px-3 font-bold text-slate-800 bg-slate-50 border-r border-slate-300 text-left whitespace-nowrap">
                {day}
              </td>
              {teachingPeriods.map((p, pIdx) => {
                const slot = grid?.[dIdx]?.[pIdx];
                const isSelected =
                  selectedSlot?.dayIdx === dIdx &&
                  selectedSlot?.periodIdx === pIdx;

                return (
                  <td
                    key={p.id || pIdx}
                    onClick={() => isClickable && onSlotClick && onSlotClick(dIdx, pIdx)}
                    className={`py-2 px-1 border-r border-slate-300 last:border-r-0 h-16 transition-all ${
                      isClickable ? 'cursor-pointer' : ''
                    } ${
                      isSelected
                        ? 'bg-indigo-100/90 ring-2 ring-[#3431B7] ring-inset'
                        : slot
                        ? slot.type === 'Lab'
                          ? 'bg-amber-50/40 hover:bg-amber-100/50'
                          : 'bg-indigo-50/40 hover:bg-indigo-100/50'
                        : isClickable
                        ? 'bg-white hover:bg-slate-50/80'
                        : 'bg-white'
                    }`}
                  >
                    {slot ? (
                      <div
                        className={`flex flex-col items-center justify-center p-1 rounded-sm bg-white border ${
                          slot.type === 'Lab'
                            ? 'border-amber-300'
                            : 'border-indigo-200'
                        } shadow-2xs`}
                      >
                        <div className="flex items-center gap-1 max-w-full">
                          <span
                            className="font-bold text-slate-900 text-[11px] truncate max-w-28"
                            title={slot.subjectName}
                          >
                            {slot.subjectCode}
                          </span>
                          {slot.type === 'Lab' && (
                            <span className="text-[9px] font-bold px-1 rounded bg-amber-100 text-amber-800 shrink-0">
                              Lab
                            </span>
                          )}
                        </div>

                        {slotSubtitleType === 'class' ? (
                          <>
                            <span
                              className="text-[10px] text-slate-600 font-medium truncate max-w-28"
                              title={slot.classLabel}
                            >
                              {slot.classLabel}
                            </span>
                            <span className="text-[9px] text-[#3431B7] font-mono">
                              {slot.departmentId.replace('dept-', '').toUpperCase()}
                            </span>
                          </>
                        ) : (
                          <>
                            <span
                              className="text-[10px] text-brand-700 font-medium truncate max-w-28"
                              title={slot.staffName}
                            >
                              {slot.staffName}
                            </span>
                            <span className="text-[9px] text-slate-400 font-mono">
                              {slot.memberId}
                            </span>
                          </>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

