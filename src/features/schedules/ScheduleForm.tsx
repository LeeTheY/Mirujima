import { useMemo, useState, type FormEvent } from "react";
import { parseDomainList } from "../blocking/domain";
import { toDateKey } from "../../shared/time/time";
import type { ActivityMode, BlockingMode, Schedule } from "../../shared/types/models";
import { createId } from "../../shared/utils/id";
import {
  ALLOWED_SITE_PRESETS,
  BLOCKED_SITE_PRESETS,
  includesDomainText,
  toggleDomainText,
  type SitePreset
} from "./site-presets";

interface Props {
  initial?: Schedule;
  defaultBlockingMode: BlockingMode;
  onSave: (schedule: Schedule) => Promise<void>;
  onCancel?: () => void;
}

function toTimeInput(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function defaultDate(offsetMinutes: number): Date {
  const date = new Date(Date.now() + offsetMinutes * 60_000);
  date.setSeconds(0, 0);
  return date;
}

function endTimeFromStart(dateKey: string, startTime: string, minutes: number): string {
  const end = new Date(`${dateKey}T${startTime}:00`);
  end.setMinutes(end.getMinutes() + minutes);
  return toTimeInput(end.toISOString());
}

const ACTIVITY_HELP: Record<ActivityMode, string> = {
  interactive: "클릭·키 입력이 5분 동안 없으면 상태를 확인합니다.",
  reading: "읽는 시간을 고려해 Chrome 활동이 15분 동안 없을 때 확인합니다.",
  watching: "영상 시청을 고려해 Chrome 활동이 45분 동안 없어도 집중으로 봅니다.",
  offline: "Chrome 활동량으로 상태를 판단하지 않고, 시스템 자리 비움만 확인합니다."
};

function SitePresetButtons({
  presets,
  value,
  onChange
}: {
  presets: SitePreset[];
  value: string;
  onChange: (value: string) => void;
}) {
  return <div className="site-presets" aria-label="자주 쓰는 사이트">
    {presets.map((preset) => {
      const selected = includesDomainText(value, preset.hostname);
      return <button
        className={`site-preset ${selected ? "selected" : ""}`}
        type="button"
        key={preset.hostname}
        aria-pressed={selected}
        onClick={() => onChange(toggleDomainText(value, preset.hostname))}
      >
        <span className="site-preset-mark" aria-hidden="true">{preset.mark}</span>
        <span>{preset.label}</span>
        <span className="site-preset-state" aria-hidden="true">{selected ? "✓" : "+"}</span>
      </button>;
    })}
  </div>;
}

export function ScheduleForm({ initial, defaultBlockingMode, onSave, onCancel }: Props) {
  const defaults = useMemo(() => ({ start: defaultDate(5) }), []);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [dateKey, setDateKey] = useState(initial?.dateKey ?? toDateKey(defaults.start));
  const [startTime, setStartTime] = useState(initial ? toTimeInput(initial.startAt) : toTimeInput(defaults.start.toISOString()));
  const [endTime, setEndTime] = useState(initial ? toTimeInput(initial.endAt) : "");
  const [targetFocusMinutes, setTargetFocusMinutes] = useState(initial ? String(initial.targetFocusMinutes) : "");
  const [activityMode, setActivityMode] = useState<ActivityMode>(initial?.activityMode ?? "interactive");
  const [blockingMode, setBlockingMode] = useState<BlockingMode>(initial?.blockingMode ?? defaultBlockingMode);
  const [allowedText, setAllowedText] = useState(initial?.allowedDomains.map((item) => item.hostname).join("\n") ?? "");
  const [blockedText, setBlockedText] = useState(initial?.blockedDomains.map((item) => item.hostname).join("\n") ?? "");
  const [breakMinutes, setBreakMinutes] = useState(initial && initial.breakMinutes > 0 ? String(initial.breakMinutes) : "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const updateTargetMinutes = (value: string) => {
    const minutes = Number(value);
    if (Number.isFinite(minutes) && minutes > 0) {
      if (!initial && targetFocusMinutes === "") {
        const automaticStart = defaultDate(5);
        const automaticDateKey = toDateKey(automaticStart);
        const automaticStartTime = toTimeInput(automaticStart.toISOString());
        setDateKey(automaticDateKey);
        setStartTime(automaticStartTime);
        setEndTime(endTimeFromStart(automaticDateKey, automaticStartTime, minutes));
      } else {
        setEndTime(endTimeFromStart(dateKey, startTime, minutes));
      }
    } else setEndTime("");
    setTargetFocusMinutes(value);
  };

  const updateStartTime = (value: string) => {
    setStartTime(value);
    const minutes = Number(targetFocusMinutes);
    if (value && Number.isFinite(minutes) && minutes > 0) setEndTime(endTimeFromStart(dateKey, value, minutes));
  };

  const updateDateKey = (value: string) => {
    setDateKey(value);
    const minutes = Number(targetFocusMinutes);
    if (value && Number.isFinite(minutes) && minutes > 0) setEndTime(endTimeFromStart(value, startTime, minutes));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const start = new Date(`${dateKey}T${startTime}:00`);
      const parsedTargetMinutes = Number(targetFocusMinutes);
      if (!targetFocusMinutes || !Number.isFinite(parsedTargetMinutes) || parsedTargetMinutes <= 0) throw new Error("목표 집중 시간을 1분 이상 입력해 주세요.");
      const parsedBreakMinutes = Number(breakMinutes);
      if (!breakMinutes || !Number.isFinite(parsedBreakMinutes) || parsedBreakMinutes <= 0) throw new Error("권장 휴식 시간을 1분 이상 입력해 주세요.");
      const end = new Date(`${dateKey}T${endTime}:00`);
      if (end.getTime() <= start.getTime()) end.setDate(end.getDate() + 1);
      if (!initial && start.getTime() < Date.now() - 60_000) throw new Error("과거 시각에는 새 일정을 만들 수 없습니다.");
      const now = new Date().toISOString();
      await onSave({
        id: initial?.id ?? createId("schedule"), title: title.trim(), description: description.trim(), dateKey,
        startAt: start.toISOString(), endAt: end.toISOString(), targetFocusMinutes: parsedTargetMinutes, activityMode, blockingMode,
        allowedDomains: parseDomainList(allowedText), blockedDomains: parseDomainList(blockedText), breakMinutes: parsedBreakMinutes,
        status: initial?.status ?? "scheduled", snoozeCount: initial?.snoozeCount ?? 0,
        createdAt: initial?.createdAt ?? now, updatedAt: now
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "일정을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return <form className="card form-grid" onSubmit={submit}>
    <div className="field wide"><label htmlFor="title">일정명</label><input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="예: React 프로젝트" /></div>
    <div className="field wide"><label htmlFor="description">목표 또는 설명</label><textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="끝냈을 때의 모습을 짧게 적어보세요." /></div>
    <div className="field"><label htmlFor="date">날짜</label><input id="date" type="date" value={dateKey} onChange={(e) => updateDateKey(e.target.value)} required /></div>
    <div className="field"><label htmlFor="target">목표 집중(분)</label><input id="target" type="number" min="1" max="720" value={targetFocusMinutes} onChange={(e) => updateTargetMinutes(e.target.value)} required placeholder="예: 50" /><span className="field-help">새 일정은 지금부터 5분 뒤에 시작하며, 종료 시각은 목표 시간만큼 자동 계산됩니다.</span></div>
    <div className="field"><label htmlFor="start">시작</label><input id="start" type="time" value={startTime} onChange={(e) => updateStartTime(e.target.value)} required /><span className="field-help">필요하면 시작 시각을 바꿀 수 있습니다.</span></div>
    <div className="field"><label htmlFor="end">종료</label><input id="end" type="time" value={endTime} readOnly required placeholder="자동 계산" /><span className="field-help">시작 시각 + 목표 집중 시간</span></div>
    <div className="field"><label htmlFor="activity">활동 유형</label><select id="activity" value={activityMode} onChange={(e) => setActivityMode(e.target.value as ActivityMode)}><option value="interactive">입력·클릭 작업</option><option value="reading">문서 읽기</option><option value="watching">강의·영상</option><option value="offline">오프라인 작업</option></select><span className="field-help">{ACTIVITY_HELP[activityMode]}</span></div>
    <div className="field"><label htmlFor="mode">차단 방식</label><select id="mode" value={blockingMode} onChange={(e) => setBlockingMode(e.target.value as BlockingMode)}><option value="allowlist">허용 사이트만</option><option value="blocklist">방해 사이트만 차단</option><option value="off">차단 끄기</option></select></div>
    {blockingMode === "allowlist" && <div className="field wide site-picker">
      <div><strong>허용 사이트</strong><p className="small muted">선택하거나 직접 입력한 사이트와 그 서브도메인만 열 수 있습니다. 나머지 일반 웹사이트는 차단됩니다.</p></div>
      <SitePresetButtons presets={ALLOWED_SITE_PRESETS} value={allowedText} onChange={setAllowedText} />
      <label htmlFor="allowed">직접 입력 (줄바꿈 또는 쉼표)</label>
      <textarea id="allowed" value={allowedText} onChange={(e) => setAllowedText(e.target.value)} placeholder="github.com&#10;developer.mozilla.org" />
    </div>}
    {blockingMode === "blocklist" && <div className="field wide site-picker">
      <div><strong>방해 사이트</strong><p className="small muted">선택하거나 직접 입력한 사이트만 차단합니다. 목록에 없는 사이트는 자유롭게 열 수 있습니다.</p></div>
      <SitePresetButtons presets={BLOCKED_SITE_PRESETS} value={blockedText} onChange={setBlockedText} />
      <label htmlFor="blocked">직접 입력 (줄바꿈 또는 쉼표)</label>
      <textarea id="blocked" value={blockedText} onChange={(e) => setBlockedText(e.target.value)} placeholder="youtube.com&#10;instagram.com" />
    </div>}
    {blockingMode === "off" && <div className="alert wide">사이트 차단을 사용하지 않습니다. 타이머와 집중 기록만 동작합니다.</div>}
    <div className="field"><label htmlFor="break">권장 휴식(분)</label><input id="break" type="number" min="1" max="60" value={breakMinutes} onChange={(e) => setBreakMinutes(e.target.value)} required placeholder="예: 10" /><span className="field-help">휴식 버튼을 여러 번 눌러도 이 시간을 일정 전체의 누적 기준으로 공유합니다. 기준을 넘으면 +시간으로 계속 기록합니다.</span></div>
    {error && <div className="alert error wide form-error" role="alert"><span>{error}</span>{onCancel && <button className="button ghost" type="button" onClick={onCancel}>일정 목록으로 돌아가기</button>}</div>}
    <div className="row wide"><button className="button" type="submit" disabled={saving}>{saving ? "저장 중…" : initial ? "일정 수정" : "일정 만들기"}</button>{onCancel && <button className="button ghost" type="button" onClick={onCancel}>취소</button>}</div>
  </form>;
}
