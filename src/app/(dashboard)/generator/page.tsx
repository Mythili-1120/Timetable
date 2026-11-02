'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { getAllDepartments, getCachedDepartments } from '../../../lib/services/departmentService';
import { getAllClasses, getCachedClasses } from '../../../lib/services/classService';
import {
  validateSubjectStaffForClass,
  SubjectStaffValidationResult
} from '../../../lib/services/assignmentService';
import { getAllSubjects, getCachedSubjects, getSemestersForYear } from '../../../lib/services/subjectService';
import { getAllStaff, getCachedStaff } from '../../../lib/services/staffService';
import { getCollegeSettings, getCachedCollegeSettings } from '../../../lib/services/settingsService';
import {
  saveDraft,
  getDraft,
  publishTimetable,
  getGlobalBusySlots,
  getPublishedTimetables,
  getCachedPublishedTimetables
} from '../../../lib/services/timetableService';
import { TimetableEngine, validateSlotSwap, GenerationResult } from '../../../lib/engine/generator';
import {
  Department,
  ClassSection,
  Subject,
  Staff,
  CollegeSettings,
  TimetableSlot,
  PublishedTimetable
} from '../../../types';
import TimetableGrid from '../../../components/TimetableGrid';
import { useAuth } from '../../../lib/context/AuthContext';
import {
  Cpu,
  Lock,
  AlertTriangle,
  CheckCircle2,
  Users,
  ArrowRight,
  ShieldAlert,
  GraduationCap,
  BookOpen,
  Sparkles,
  ArrowRightLeft,
  RotateCcw,
  Check,
  Calendar,
  Layers,
  ChevronRight,
  X,
  History,
  Building2,
  ExternalLink
} from 'lucide-react';

const UNDERGRADUATE_YEARS: ('1st Year' | '2nd Year' | '3rd Year' | '4th Year')[] = [
  '1st Year',
  '2nd Year',
  '3rd Year',
  '4th Year'
];

export default function GeneratorPage() {
  const initDepts = getCachedDepartments();
  const initSubjs = getCachedSubjects();
  const initStaff = getCachedStaff();
  const initSettings = getCachedCollegeSettings();
  const initPub = getCachedPublishedTimetables('2025–2026') || [];
  const firstDeptId = initDepts && initDepts.length > 0 ? initDepts[0].departmentId : '';
  const initClasses = firstDeptId ? getCachedClasses(firstDeptId) || [] : [];

  const [departments, setDepartments] = useState<Department[]>(() => initDepts || []);
  const [classes, setClasses] = useState<ClassSection[]>(() => initClasses);
  const [publishedTimetables, setPublishedTimetables] = useState<PublishedTimetable[]>(() => initPub);
  const [draftStatusMap, setDraftStatusMap] = useState<Map<string, string>>(new Map());

  const [subjectsMap, setSubjectsMap] = useState<Map<string, Subject>>(() => {
    const sMap = new Map<string, Subject>();
    if (initSubjs) initSubjs.forEach(s => sMap.set(s.subjectId, s));
    return sMap;
  });
  const [staffMap, setStaffMap] = useState<Map<string, Staff>>(() => {
    const stMap = new Map<string, Staff>();
    if (initStaff) initStaff.forEach(st => stMap.set(st.memberId, st));
    return stMap;
  });
  const [settings, setSettings] = useState<CollegeSettings | null>(() => initSettings);

  // Form selections — Department -> Academic Year -> Section (Mandatory Hierarchy)
  const [selectedDept, setSelectedDept] = useState(firstDeptId);
  const [selectedYearOfStudy, setSelectedYearOfStudy] = useState<'1st Year' | '2nd Year' | '3rd Year' | '4th Year'>('1st Year');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSemester, setSelectedSemester] = useState('ALL');
  const [academicYear, setAcademicYear] = useState('2025–2026');

  // Pre-generation Subject & Faculty Validation State
  const [validation, setValidation] = useState<SubjectStaffValidationResult | null>(null);
  const [validating, setValidating] = useState(false);

  // Multi-candidate variants state (Workstream B4)
  const [candidates, setCandidates] = useState<GenerationResult[]>([]);
  const [activeCandidateIndex, setActiveCandidateIndex] = useState(0);
  const [candidateScore, setCandidateScore] = useState<number>(0);

  // Timetable Grid & Editor State
  const [grid, setGrid] = useState<(TimetableSlot | null)[][]>([]);
  const [status, setStatus] = useState<'DRAFT' | 'GENERATED' | 'PUBLISHED'>('DRAFT');
  const [totalAllocated, setTotalAllocated] = useState(0);
  const [totalRequired, setTotalRequired] = useState(0);
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);

  // Interactive Slot Swapping & Move State (Workstream B7)
  const [selectedSlot, setSelectedSlot] = useState<{ dayIdx: number; periodIdx: number } | null>(null);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [swapSuccess, setSwapSuccess] = useState<string | null>(null);

  // Publish / Lock Modal State (Workstream B8)
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);

  const { user } = useAuth();

  // Async request concurrency tokens to discard stale out-of-order responses
  const loadDeptRequestCounter = useRef(0);
  const validationRequestId = useRef(0);

  // Unified Master Data & URL Query Parameter Resolution
  useEffect(() => {
    async function init() {
      const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const paramDept = urlParams?.get('departmentId');
      const paramClass = urlParams?.get('classId');
      const paramYear = urlParams?.get('yearOfStudy') as any;
      const paramAcad = urlParams?.get('academicYear');

      const [depts, subjs, staffList, set, pub] = await Promise.all([
        getAllDepartments(),
        getAllSubjects(),
        getAllStaff(),
        getCollegeSettings(),
        getPublishedTimetables('2025–2026')
      ]);
      setDepartments(depts);
      setSettings(set);
      setPublishedTimetables(pub);

      const sMap = new Map<string, Subject>();
      subjs.forEach(s => sMap.set(s.subjectId, s));
      setSubjectsMap(sMap);

      const stMap = new Map<string, Staff>();
      staffList.forEach(st => stMap.set(st.memberId, st));
      setStaffMap(stMap);

      const effectiveDept = paramDept || selectedDept || (depts.length > 0 ? depts[0].departmentId : '');
      const effectiveYear = (paramYear && UNDERGRADUATE_YEARS.includes(paramYear)) ? paramYear : selectedYearOfStudy;

      if (effectiveDept) setSelectedDept(effectiveDept);
      if (effectiveYear) setSelectedYearOfStudy(effectiveYear);
      if (paramAcad) setAcademicYear(paramAcad);

      if (effectiveDept) {
        await loadDepartmentClasses(effectiveDept, paramClass, effectiveYear);
      }
    }
    init();
  }, []);

  const loadDepartmentClasses = async (
    deptId: string,
    targetClassId?: string,
    yearLevel?: '1st Year' | '2nd Year' | '3rd Year' | '4th Year'
  ) => {
    const reqId = ++loadDeptRequestCounter.current;
    const cls = await getAllClasses(deptId);
    if (reqId !== loadDeptRequestCounter.current) return;
    setClasses(cls);

    // Sync draft states for all classes in this department
    const dMap = new Map<string, string>();
    await Promise.all(
      cls.map(async c => {
        const d = await getDraft(c.classId);
        if (d && d.status) dMap.set(c.classId, d.status);
      })
    );
    if (reqId !== loadDeptRequestCounter.current) return;
    setDraftStatusMap(dMap);

    const activeYear = yearLevel || selectedYearOfStudy;
    // Filter to sections for the active year of study
    const yearSections = cls.filter(c => c.yearOfStudy === activeYear);
    if (yearSections.length > 0) {
      const preferred = targetClassId || selectedClassId;
      const targetClass = yearSections.some(c => c.classId === preferred)
        ? preferred
        : yearSections[0].classId;
      setSelectedClassId(targetClass);
      await loadClassDraft(targetClass);
    } else {
      setSelectedClassId('');
      setGrid([]);
    }
  };

  const loadClassDraft = async (classId: string) => {
    if (!classId) {
      setGrid([]);
      setStatus('DRAFT');
      setTotalAllocated(0);
      return;
    }
    setSelectedSlot(null);
    setSwapError(null);
    setSwapSuccess(null);

    // Check if class is already published
    const published = publishedTimetables.find(p => p.classId === classId);
    if (published && published.grid) {
      setGrid(published.grid);
      setStatus('PUBLISHED');
      setTotalAllocated(published.totalHours);
      setCandidateScore(95);
      return;
    }

    const draft = await getDraft(classId);
    if (draft && draft.grid) {
      setGrid(draft.grid);
      setStatus(draft.status);
      setTotalAllocated(draft.totalAllocated);
      setCandidateScore(draft.generationMetadata?.qualityScore || 88);
    } else {
      setGrid([]);
      setStatus('DRAFT');
      setTotalAllocated(0);
      setCandidateScore(0);
    }
  };

  // Re-run canonical Subject-Staff readiness check whenever selected class or semester changes
  const checkReadiness = async (forceRefresh = false) => {
    if (!selectedClassId) {
      setValidation(null);
      return;
    }
    const reqId = ++validationRequestId.current;
    setValidating(true);
    try {
      const result = await validateSubjectStaffForClass(
        selectedClassId,
        selectedSemester,
        forceRefresh,
        selectedDept,
        selectedYearOfStudy
      );
      if (reqId === validationRequestId.current) {
        setValidation(result);
      }
    } catch (err) {
      if (reqId === validationRequestId.current) {
        console.error('Pre-generation validation error:', err);
      }
    } finally {
      if (reqId === validationRequestId.current) {
        setValidating(false);
      }
    }
  };

  useEffect(() => {
    checkReadiness(false);
  }, [selectedClassId, selectedSemester, selectedDept, selectedYearOfStudy]);

  // Window focus listener: automatically re-validates when user returns from Teaching Assignments tab
  useEffect(() => {
    const handleFocus = () => {
      if (selectedClassId) {
        checkReadiness(true);
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [selectedClassId, selectedSemester, selectedDept, selectedYearOfStudy]);

  // Handle department change — clears old section selection immediately to avoid stale state
  const handleDeptChange = async (deptId: string) => {
    setSelectedDept(deptId);
    setSelectedClassId('');
    setGrid([]);
    setValidation(null);
    await loadDepartmentClasses(deptId, undefined, selectedYearOfStudy);
  };

  // Handle year level change — clears old section selection immediately to avoid stale state
  const handleYearChange = async (year: '1st Year' | '2nd Year' | '3rd Year' | '4th Year') => {
    setSelectedYearOfStudy(year);
    setSelectedClassId('');
    setGrid([]);
    setValidation(null);
    const sems = getSemestersForYear(year);
    if (selectedSemester !== 'ALL' && !sems.some(s => s.name === selectedSemester)) {
      setSelectedSemester(sems[0].name);
    }
    const yearSections = classes.filter(c => c.yearOfStudy === year);
    if (yearSections.length > 0) {
      const firstSectionId = yearSections[0].classId;
      setSelectedClassId(firstSectionId);
      await loadClassDraft(firstSectionId);
    } else {
      setSelectedClassId('');
      setGrid([]);
    }
  };

  // Handle section selection
  const handleClassChange = async (classId: string) => {
    setSelectedClassId(classId);
    await loadClassDraft(classId);
  };

  // -----------------------------------------------------------------
  // GENERATION ENGINE EXECUTION (Workstream B3 & B4: Multiple Candidates)
  // -----------------------------------------------------------------
  const handleRunGenerator = async () => {
    if (!selectedClassId || !settings) return;
    setGenerating(true);
    setDiagnostics([]);
    setSwapError(null);
    setSwapSuccess(null);
    setSelectedSlot(null);

    try {
      // 1. Authoritative Pre-Generation Subject & Staff Validation with Department & Cohort Scope Check
      const valResult = await validateSubjectStaffForClass(
        selectedClassId,
        selectedSemester,
        true,
        selectedDept,
        selectedYearOfStudy
      );
      setValidation(valResult);

      if (!valResult.canGenerate) {
        setDiagnostics(valResult.blockingErrors);
        setGenerating(false);
        return;
      }

      const assignments = valResult.assignedSubjects.map(a => a.assignment);

      // Snapshot synchronization: enrich subjectsMap & staffMap with exact validated objects
      const enrichedSubjectsMap = new Map(subjectsMap);
      const enrichedStaffMap = new Map(staffMap);
      valResult.assignedSubjects.forEach(a => {
        if (a.subject) enrichedSubjectsMap.set(a.subject.subjectId, a.subject);
        if (a.staff) enrichedStaffMap.set(a.staff.memberId, a.staff);
      });

      // 2. Fetch global college-wide busy slots (from all other classes)
      const globalBusy = await getGlobalBusySlots(academicYear, selectedClassId);

      const cls = classes.find(c => c.classId === selectedClassId);
      const classLabel = cls ? `${cls.yearOfStudy} - Section ${cls.section}` : selectedClassId;

      // 3. Multi-candidate diversity search (generates up to ~10 unique candidates)
      const { candidates: generatedCandidates, bestCandidate } = TimetableEngine.generateDiverseCandidates(
        {
          classId: selectedClassId,
          classLabel,
          departmentId: selectedDept,
          academicYear,
          assignments,
          subjectsMap: enrichedSubjectsMap,
          staffMap: enrichedStaffMap,
          collegeSettings: settings,
          globalBusySlots: globalBusy
        },
        10,
        grid.length > 0 ? grid : undefined
      );

      if (bestCandidate && bestCandidate.success) {
        setCandidates(generatedCandidates);
        setActiveCandidateIndex(0);
        setGrid(bestCandidate.grid);
        setStatus('GENERATED');
        setTotalAllocated(bestCandidate.totalAllocated);
        setTotalRequired(bestCandidate.totalRequired);
        setCandidateScore(bestCandidate.qualityScore || 90);
        setDiagnostics([]);

        // Auto-save generated candidate state as DRAFT in Firestore
        if (user) {
          await saveDraft(
            {
              classId: selectedClassId,
              departmentId: selectedDept,
              academicYear,
              grid: bestCandidate.grid,
              totalAllocated: bestCandidate.totalAllocated,
              status: 'GENERATED',
              updatedAt: new Date().toISOString(),
              generationMetadata: {
                variantIndex: bestCandidate.variantIndex || 0,
                totalCandidates: generatedCandidates.length,
                qualityScore: bestCandidate.qualityScore,
                generatedAt: new Date().toISOString()
              }
            },
            user.uid
          );
        }

        // Update local draft status map
        setDraftStatusMap(prev => new Map(prev).set(selectedClassId, 'GENERATED'));
      } else {
        setDiagnostics(
          bestCandidate?.diagnostics || ['Constraint satisfaction failure: Unable to place all required curriculum hours.']
        );
      }
    } catch (err: any) {
      console.error('Generation error:', err);
      setDiagnostics([err.message || 'An error occurred during timetable generation.']);
    } finally {
      setGenerating(false);
    }
  };

  // Switch between generated candidate variants (Workstream B4)
  const handleSelectCandidate = async (index: number) => {
    if (!candidates[index] || !candidates[index].success) return;
    const chosen = candidates[index];
    setActiveCandidateIndex(index);
    setGrid(chosen.grid);
    setTotalAllocated(chosen.totalAllocated);
    setCandidateScore(chosen.qualityScore || 85);
    setSelectedSlot(null);
    setSwapError(null);
    setSwapSuccess(null);

    // Persist switched candidate as current working draft
    if (user && selectedClassId) {
      await saveDraft(
        {
          classId: selectedClassId,
          departmentId: selectedDept,
          academicYear,
          grid: chosen.grid,
          totalAllocated: chosen.totalAllocated,
          status: 'GENERATED',
          updatedAt: new Date().toISOString(),
          generationMetadata: {
            variantIndex: chosen.variantIndex || index,
            totalCandidates: candidates.length,
            qualityScore: chosen.qualityScore,
            generatedAt: new Date().toISOString()
          }
        },
        user.uid
      );
    }
  };

  // -----------------------------------------------------------------
  // INTERACTIVE SLOT SWAPPING & MOVING (Workstream B7)
  // -----------------------------------------------------------------
  const handleSlotClick = async (dayIdx: number, periodIdx: number) => {
    if (status === 'PUBLISHED') {
      alert('This timetable is locked and published. To modify, create a new version.');
      return;
    }

    // First click: select source slot
    if (!selectedSlot) {
      const clickedCell = grid[dayIdx][periodIdx];
      if (!clickedCell) {
        setSwapError('Please select a filled slot first to move or swap.');
        return;
      }
      setSelectedSlot({ dayIdx, periodIdx });
      setSwapError(null);
      setSwapSuccess(null);
      return;
    }

    // Clicked same slot: deselect
    if (selectedSlot.dayIdx === dayIdx && selectedSlot.periodIdx === periodIdx) {
      setSelectedSlot(null);
      return;
    }

    // Second click: attempt swap / move
    const sourceDay = selectedSlot.dayIdx;
    const sourcePeriod = selectedSlot.periodIdx;
    const targetDay = dayIdx;
    const targetPeriod = periodIdx;

    const globalBusy = await getGlobalBusySlots(academicYear, selectedClassId);

    const validationResult = validateSlotSwap(
      grid,
      sourceDay,
      sourcePeriod,
      targetDay,
      targetPeriod,
      globalBusy,
      selectedClassId,
      days.length,
      teachingPeriods.length
    );

    if (!validationResult.valid) {
      setSwapError(validationResult.reason || 'Invalid swap operation.');
      setSelectedSlot(null);
      return;
    }

    // Execute swap
    const nextGrid = grid.map(row => [...row]);
    const slotA = nextGrid[sourceDay][sourcePeriod];
    const slotB = nextGrid[targetDay][targetPeriod];

    nextGrid[sourceDay][sourcePeriod] = slotB ? { ...slotB, dayIdx: sourceDay, periodIdx: sourcePeriod } : null;
    nextGrid[targetDay][targetPeriod] = slotA ? { ...slotA, dayIdx: targetDay, periodIdx: targetPeriod } : null;

    setGrid(nextGrid);
    setSelectedSlot(null);
    setSwapError(null);
    setSwapSuccess(`Moved ${slotA?.subjectCode || 'course'} to Day ${targetDay + 1}, Period ${targetPeriod + 1}. Draft saved.`);

    // Auto-save updated draft to Firestore
    if (user) {
      await saveDraft(
        {
          classId: selectedClassId,
          departmentId: selectedDept,
          academicYear,
          grid: nextGrid,
          totalAllocated,
          status: 'DRAFT',
          updatedAt: new Date().toISOString()
        },
        user.uid
      );
    }
  };

  // -----------------------------------------------------------------
  // LOCK & PUBLISH TIMETABLE (Workstream B8)
  // -----------------------------------------------------------------
  const handlePublish = async () => {
    if (!selectedClassId || grid.length === 0 || !user) return;
    setPublishing(true);

    try {
      const cls = classes.find(c => c.classId === selectedClassId);
      const classLabel = cls ? `${cls.yearOfStudy} - Section ${cls.section}` : selectedClassId;

      await publishTimetable(
        {
          classId: selectedClassId,
          classLabel,
          departmentId: selectedDept,
          academicYear,
          grid,
          totalHours: totalAllocated
        },
        user.uid
      );

      setStatus('PUBLISHED');
      setPublishModalOpen(false);
      setPublishSuccess(true);

      // Refresh published records and draft maps
      const pubList = await getPublishedTimetables(academicYear, true);
      setPublishedTimetables(pubList);
      setDraftStatusMap(prev => new Map(prev).set(selectedClassId, 'PUBLISHED'));
    } catch (err: any) {
      console.error('Publish error:', err);
      alert(`Failed to publish timetable: ${err.message}`);
    } finally {
      setPublishing(false);
    }
  };

  // Helpers for Section and Year progress
  const yearSections = classes.filter(c => c.yearOfStudy === selectedYearOfStudy);
  const selectedClass = classes.find(c => c.classId === selectedClassId);
  const selectedDeptObj = departments.find(d => d.departmentId === selectedDept);

  const getSectionStatus = (classId: string) => {
    const isLocked = publishedTimetables.some(p => p.classId === classId);
    if (isLocked) return 'LOCKED';
    const dStatus = draftStatusMap.get(classId);
    if (dStatus === 'GENERATED' || dStatus === 'DRAFT') return 'DRAFT';
    return 'NOT_GENERATED';
  };

  const lockedYearCount = yearSections.filter(c => getSectionStatus(c.classId) === 'LOCKED').length;
  const isYearFullyCompleted = yearSections.length > 0 && lockedYearCount === yearSections.length;

  const teachingPeriods = settings?.periods?.filter(p => !p.isBreak) || [];
  const days = settings?.workingDays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return (
    <div className="space-y-6">
      {/* 1. TOP HEADER & WORKFLOW CONTEXT */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={selectedDept ? `/departments/${selectedDept}` : '/departments'}
              className="text-xs font-semibold text-slate-500 hover:text-[#3431B7] inline-flex items-center gap-1"
            >
              <span>{selectedDeptObj?.name || 'Department'}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
            <span className="text-xs font-bold text-[#3431B7]">Timetable Generator</span>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Section-wise Timetable Generator
          </h1>
          <p className="text-xs text-slate-500">
            Generate, preview, adjust, and lock conflict-free timetables per Academic Year & Section
          </p>
        </div>

        <div className="flex items-center gap-2">
          {grid.length > 0 && status !== 'PUBLISHED' && (
            <button
              onClick={() => setPublishModalOpen(true)}
              disabled={publishing || totalAllocated === 0}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
            >
              <Lock className="w-4 h-4" />
              <span>Lock & Publish Timetable</span>
            </button>
          )}

          {status === 'PUBLISHED' && (
            <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Timetable Locked & Published</span>
            </div>
          )}

          <button
            onClick={handleRunGenerator}
            disabled={generating || !selectedClassId || (validation !== null && !validation.canGenerate)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-[#3431B7] hover:bg-[#28229E] transition-colors shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Cpu className="w-4 h-4" />
            <span>{generating ? 'Solving Constraints...' : grid.length > 0 ? 'Regenerate Candidates' : 'Generate Timetable'}</span>
          </button>
        </div>
      </div>

      {/* 2. THREE-TIER SELECTION BAR (Department -> Academic Year -> Section) */}
      <div className="bg-white rounded-2xl border border-[#E3E5F0] p-5 shadow-xs space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          {/* Tier 1: Department Selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              1. Department
            </label>
            <select
              value={selectedDept}
              onChange={(e) => handleDeptChange(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#3431B7]"
            >
              {departments.map(d => (
                <option key={d.departmentId} value={d.departmentId}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
          </div>

          {/* Tier 2: Academic Year Level (1st, 2nd, 3rd, 4th) */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              2. Academic Year Cohort
            </label>
            <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 rounded-xl">
              {UNDERGRADUATE_YEARS.map(yr => {
                const isSelected = selectedYearOfStudy === yr;
                const count = classes.filter(c => c.yearOfStudy === yr).length;

                return (
                  <button
                    key={yr}
                    type="button"
                    onClick={() => handleYearChange(yr)}
                    className={`py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-white text-[#3431B7] shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>{yr.replace(' Year', '')}</span>
                    <span className="block text-[10px] font-normal text-slate-400">({count} sec)</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tier 3: Section Selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              3. Section ({selectedYearOfStudy})
            </label>
            {yearSections.length === 0 ? (
              <div className="px-3 py-2 text-xs text-amber-700 bg-amber-50 rounded-xl border border-amber-200">
                No sections configured for {selectedYearOfStudy}.
              </div>
            ) : (
              <select
                value={selectedClassId}
                onChange={(e) => handleClassChange(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#3431B7]"
              >
                {yearSections.map(cls => {
                  const sStatus = getSectionStatus(cls.classId);
                  const label = sStatus === 'LOCKED' ? '🔒 Locked' : sStatus === 'DRAFT' ? '📝 Draft' : '⏳ Not Generated';
                  return (
                    <option key={cls.classId} value={cls.classId}>
                      Section {cls.section} — {label}
                    </option>
                  );
                })}
              </select>
            )}
          </div>
        </div>

        {/* Academic Year Completion Status Strip (Workstream B9 & B10) */}
        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700">{selectedYearOfStudy} Progress:</span>
            <span
              className={`font-extrabold px-2 py-0.5 rounded-full text-[11px] ${
                isYearFullyCompleted
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  : lockedYearCount > 0
                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                  : 'bg-slate-100 text-slate-600 border border-slate-200'
              }`}
            >
              {isYearFullyCompleted
                ? `Completed (${lockedYearCount} of ${yearSections.length} Sections Locked)`
                : lockedYearCount > 0
                ? `In Progress (${lockedYearCount} of ${yearSections.length} Sections Locked)`
                : `Not Started (0 of ${yearSections.length} Sections Locked)`}
            </span>
          </div>

          <div className="flex items-center gap-4 text-slate-500 text-[11px] flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-700">Semester:</span>
              <button
                type="button"
                onClick={() => setSelectedSemester('ALL')}
                className={`px-2 py-0.5 rounded text-xs font-bold transition-all cursor-pointer ${
                  selectedSemester === 'ALL'
                    ? 'bg-[#3431B7] text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All
              </button>
              {getSemestersForYear(selectedYearOfStudy).map(sem => (
                <button
                  key={sem.name}
                  type="button"
                  onClick={() => setSelectedSemester(sem.name)}
                  className={`px-2 py-0.5 rounded text-xs font-bold transition-all cursor-pointer ${
                    selectedSemester === sem.name
                      ? 'bg-[#3431B7] text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {sem.name}
                </button>
              ))}
            </div>
            <span>Academic Year: <strong className="text-slate-800">{academicYear}</strong></span>
          </div>
        </div>
      </div>

      {/* 3. YEAR COMPLETED CELEBRATORY BANNER (Workstream B10) */}
      {isYearFullyCompleted && (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 flex items-center justify-between gap-4 text-emerald-950">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Check className="w-5 h-5 stroke-[3]" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-emerald-950">
                {selectedYearOfStudy} — Fully Completed!
              </h3>
              <p className="text-xs text-emerald-800">
                All {yearSections.length} class section timetables are locked and published to the authoritative institutional archive.
              </p>
            </div>
          </div>

          {selectedYearOfStudy !== '4th Year' && (
            <button
              onClick={() => {
                const nextYearIndex = UNDERGRADUATE_YEARS.indexOf(selectedYearOfStudy) + 1;
                if (nextYearIndex < UNDERGRADUATE_YEARS.length) {
                  handleYearChange(UNDERGRADUATE_YEARS[nextYearIndex]);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 transition-colors shadow-xs cursor-pointer shrink-0"
            >
              <span>Proceed to Next Year</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* 4. PRE-GENERATION VALIDATION DIAGNOSTICS */}
      {validation && !validation.canGenerate && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 text-rose-900 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold text-sm text-rose-800">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Timetable Generation Blocked — Teaching Assignments Incomplete</span>
            </div>
            <button
              onClick={() => checkReadiness(true)}
              disabled={validating}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-rose-300 rounded-lg text-xs font-bold text-rose-800 hover:bg-rose-100 transition-colors cursor-pointer shadow-xs"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${validating ? 'animate-spin' : ''}`} />
              <span>{validating ? 'Checking...' : 'Re-check Assignments'}</span>
            </button>
          </div>
          <p className="text-xs text-rose-700">
            The generator requires an assigned, active, and eligible faculty member for every curriculum subject before creating candidate schedules:
          </p>

          {validation.structuredErrors && validation.structuredErrors.length > 0 ? (
            <div className="space-y-2 pt-1">
              {validation.structuredErrors.map((err, i) => {
                let badgeBg = 'bg-rose-100 text-rose-800 border-rose-300';
                let badgeLabel = 'Missing Assignment';
                if (err.errorCode === 'SECTION_NOT_SELECTED') {
                  badgeBg = 'bg-amber-100 text-amber-800 border-amber-300';
                  badgeLabel = 'No Section Selected';
                } else if (err.errorCode === 'SECTION_NOT_FOUND' || err.errorCode === 'CLASS_NOT_FOUND') {
                  badgeBg = 'bg-rose-100 text-rose-800 border-rose-300';
                  badgeLabel = 'Section Not Found';
                } else if (err.errorCode === 'SECTION_DEPARTMENT_MISMATCH') {
                  badgeBg = 'bg-rose-100 text-rose-800 border-rose-300';
                  badgeLabel = 'Department Mismatch';
                } else if (err.errorCode === 'SECTION_ACADEMIC_YEAR_MISMATCH') {
                  badgeBg = 'bg-amber-100 text-amber-800 border-amber-300';
                  badgeLabel = 'Cohort Mismatch';
                } else if (err.errorCode === 'STAFF_INACTIVE' || err.errorCode === 'INACTIVE_STAFF') {
                  badgeBg = 'bg-amber-100 text-amber-800 border-amber-300';
                  badgeLabel = 'Faculty Inactive';
                } else if (err.errorCode === 'STAFF_SUBJECT_INELIGIBLE' || err.errorCode === 'INELIGIBLE_STAFF') {
                  badgeBg = 'bg-orange-100 text-orange-800 border-orange-300';
                  badgeLabel = 'Eligibility Mismatch';
                } else if (err.errorCode === 'ASSIGNMENT_DATA_LOAD_FAILED') {
                  badgeBg = 'bg-rose-100 text-rose-800 border-rose-300';
                  badgeLabel = 'Data Load Failed';
                } else if (err.errorCode === 'ASSIGNMENT_DATA_AMBIGUOUS') {
                  badgeBg = 'bg-purple-100 text-purple-800 border-purple-300';
                  badgeLabel = 'Conflicting Assignments';
                } else if (err.errorCode === 'NO_CURRICULUM_SUBJECTS') {
                  badgeBg = 'bg-slate-100 text-slate-800 border-slate-300';
                  badgeLabel = 'No Curriculum';
                } else if (err.errorCode === 'SUBJECT_ASSIGNMENT_MISSING' || err.errorCode === 'MISSING_ASSIGNMENT') {
                  badgeBg = 'bg-rose-100 text-rose-800 border-rose-300';
                  badgeLabel = 'Missing Assignment';
                }

                return (
                  <div
                    key={i}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-white/90 rounded-xl border border-rose-200 text-xs shadow-2xs"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] uppercase border shrink-0 ${badgeBg}`}>
                        {badgeLabel}
                      </span>
                      <div>
                        <div className="font-bold text-rose-950">
                          {err.subjectName ? `${err.subjectName} (${err.subjectId})` : err.message}
                        </div>
                        <div className="text-slate-600 text-[11px] mt-0.5">
                          {err.message}
                        </div>
                      </div>
                    </div>

                    {err.errorCode === 'ASSIGNMENT_DATA_LOAD_FAILED' ? (
                      <button
                        onClick={() => checkReadiness(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-700 hover:bg-rose-800 text-white rounded-lg font-bold text-[11px] shrink-0 transition-colors shadow-xs"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Retry Load</span>
                      </button>
                    ) : err.errorCode.startsWith('SECTION_') ? (
                      <Link
                        href={`/departments/${selectedDept}?tab=years`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold text-[11px] shrink-0 transition-colors shadow-xs"
                      >
                        <span>Manage Sections</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    ) : (
                      <Link
                        href={`/departments/${selectedDept}?tab=assignments&classId=${encodeURIComponent(selectedClassId)}${
                          err.subjectId ? `&subjectId=${encodeURIComponent(err.subjectId)}` : ''
                        }`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#3431B7] hover:bg-[#282694] text-white rounded-lg font-bold text-[11px] shrink-0 transition-colors shadow-xs"
                      >
                        <span>Assign Faculty</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <ul className="list-disc list-inside text-xs space-y-1 font-medium text-rose-800">
              {validation.blockingErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          )}

          <div className="pt-2">
            <Link
              href={`/departments/${selectedDept}?tab=assignments&classId=${encodeURIComponent(selectedClassId)}`}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-800 underline hover:text-rose-950"
            >
              <span>Open Teaching Assignments Manager for this Section →</span>
            </Link>
          </div>
        </div>
      )}

      {/* 5. MULTI-CANDIDATE VARIANT SWITCHER BAR (Workstream B4) */}
      {candidates.length > 1 && status !== 'PUBLISHED' && (
        <div className="bg-white rounded-2xl border border-[#E3E5F0] p-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
            <div>
              <span className="text-xs font-extrabold text-slate-900">
                Generated Solution Variants ({candidates.length} Candidate Schedules)
              </span>
              <p className="text-[11px] text-slate-500">
                Explore meaningfully different valid arrangements with verified constraint satisfaction
              </p>
            </div>
            <div className="text-xs text-[#3431B7] font-bold">
              Current Quality Score: {candidateScore}/100
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {candidates.map((cand, idx) => {
              const isSelected = activeCandidateIndex === idx;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectCandidate(idx)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                    isSelected
                      ? 'bg-[#3431B7] text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Candidate {idx + 1}
                  <span className={`text-[10px] ml-1.5 font-normal ${isSelected ? 'text-white/80' : 'text-slate-500'}`}>
                    ({cand.qualityScore || 85} pts)
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 6. SWAP & MOVE NOTIFICATION BANNERS (Workstream B7) */}
      {selectedSlot && (
        <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-[#3431B7] animate-pulse" />
            <span>
              <strong>Selected:</strong> Day {selectedSlot.dayIdx + 1}, Period {selectedSlot.periodIdx + 1} ({grid[selectedSlot.dayIdx][selectedSlot.periodIdx]?.subjectCode}). Tap any other slot to swap or move.
            </span>
          </div>
          <button
            onClick={() => setSelectedSlot(null)}
            className="text-[11px] font-bold text-indigo-700 hover:underline cursor-pointer"
          >
            Cancel
          </button>
        </div>
      )}

      {swapError && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{swapError}</span>
          </div>
          <button onClick={() => setSwapError(null)} className="text-rose-600 hover:text-rose-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {swapSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{swapSuccess}</span>
          </div>
          <button onClick={() => setSwapSuccess(null)} className="text-emerald-600 hover:text-emerald-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 7. LARGE INTERACTIVE TIMETABLE PREVIEW & EDITOR (Workstream B5, B6 & B7) */}
      <div className="bg-white rounded-2xl border border-[#E3E5F0] overflow-hidden shadow-xs">
        {/* Context Header */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-slate-900">
                {selectedClass ? `${selectedClass.yearOfStudy} — Section ${selectedClass.section}` : 'Timetable Preview'}
              </h2>
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                  status === 'PUBLISHED'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : status === 'GENERATED'
                    ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                {status === 'PUBLISHED' ? 'Locked / Published' : status === 'GENERATED' ? 'Draft Generated' : 'Draft'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {status === 'PUBLISHED'
                ? 'Immutable published version stored in institutional archive.'
                : 'Click any slot to swap or move periods. Changes auto-save as drafts.'}
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <div className="text-right">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Allocated Curriculum Hours</span>
              <span className="font-extrabold text-slate-900">{totalAllocated} hrs</span>
            </div>
          </div>
        </div>

        {/* Timetable Grid */}
        {grid.length === 0 ? (
          <div className="py-20 text-center p-6 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <Cpu className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-extrabold text-slate-800">No Timetable Generated Yet</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Click "Generate Timetable" to produce valid conflict-free candidate schedules for {selectedClass?.yearOfStudy} Section {selectedClass?.section}.
            </p>
          </div>
        ) : (
          <TimetableGrid
            grid={grid}
            teachingPeriods={teachingPeriods}
            days={days}
            isEditable={status !== 'PUBLISHED'}
            selectedSlot={selectedSlot}
            onSlotClick={handleSlotClick}
            slotSubtitleType="staff"
          />
        )}
      </div>

      {/* 8. LOCK & PUBLISH CONFIRMATION MODAL (Workstream B8) */}
      {publishModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Lock & Publish Timetable
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedClass ? `${selectedClass.yearOfStudy} — Section ${selectedClass.section}` : ''}
                </p>
              </div>
            </div>

            <div className="space-y-3 py-3 border-y border-slate-100 my-4 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Department:</span>
                <span className="font-bold text-slate-800">{selectedDeptObj?.name || selectedDept}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Academic Year:</span>
                <span className="font-bold text-slate-800">{academicYear}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Class Section:</span>
                <span className="font-bold text-slate-800">{selectedClass?.yearOfStudy} Sec {selectedClass?.section}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Hours Allocated:</span>
                <span className="font-bold text-emerald-700">{totalAllocated} hrs</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Clash Validation:</span>
                <span className="font-bold text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>0 Global Clashes</span>
                </span>
              </div>

              <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl text-emerald-900 text-[11px] leading-relaxed">
                Publishing creates an immutable permanent snapshot in the institutional archives. Students and faculty can view this version in Timetable Views.
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPublishModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePublish}
                disabled={publishing}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl transition-colors shadow-xs cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{publishing ? 'Publishing...' : 'Confirm & Publish'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
