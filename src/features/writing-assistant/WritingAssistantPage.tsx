import { useMemo, useState } from "react";
import { sendMessage } from "../../shared/chrome/messaging";
import { useApp } from "../../shared/ui/AppContext";
import { hasPremiumEntitlement } from "../membership/types";
import { textDiff } from "./diff";
import { writingAssistantService } from "./service";
import type { ContentSummaryResult, OcrBlock, ScreenCaptureResult, WritingResult, WritingStyle, WritingTask } from "./types";

type Phase = "idle" | "selecting" | "preview" | "ocr" | "review" | "processing" | "writing-result" | "analysis-result";
const TASK_LABELS: Record<WritingTask, string> = { "grammar-correction": "문법 교정", "content-summary": "핵심 요약", "study-organize": "학습 정리" };
const BLOCK_LABELS: Record<OcrBlock["type"], string> = { heading: "제목", paragraph: "문단", "list-item": "목록", table: "표", formula: "수식", other: "기타" };

function analysisText(result: ContentSummaryResult): string {
  const keyPoints = result.keyPoints.map((item) => `- ${item.text} [${item.sourceBlockIds.join(", ")}]`).join("\n");
  const sections = result.sections.map((section) => `## ${section.heading}\n${section.content}\n근거: ${section.sourceBlockIds.join(", ")}`).join("\n\n");
  const uncertain = result.uncertainItems.length ? `\n\n## 확인 필요\n${result.uncertainItems.map((item) => `- ${item}`).join("\n")}` : "";
  return `# ${result.title}\n\n${result.summary}\n\n## 핵심 내용\n${keyPoints}\n\n${sections}${uncertain}`.trim();
}

export function WritingAssistantPage({ onClose }: { onClose: () => void }) {
  const { snapshot } = useApp();
  const screenEnabled = hasPremiumEntitlement(snapshot.membership, "screen-ocr");
  const grammarEnabled = hasPremiumEntitlement(snapshot.membership, "grammar-correction");
  const summaryEnabled = hasPremiumEntitlement(snapshot.membership, "content-summary");
  const [phase, setPhase] = useState<Phase>("idle");
  const [task, setTask] = useState<WritingTask>("grammar-correction");
  const [capture, setCapture] = useState<ScreenCaptureResult | null>(null);
  const [consented, setConsented] = useState(false);
  const [blocks, setBlocks] = useState<OcrBlock[]>([]);
  const [style, setStyle] = useState<WritingStyle>("proofread");
  const [writingResult, setWritingResult] = useState<WritingResult | null>(null);
  const [analysisResult, setAnalysisResult] = useState<ContentSummaryResult | null>(null);
  const [output, setOutput] = useState<"corrected" | "polished">("corrected");
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const ocrText = blocks.map((block) => block.text.trim()).filter(Boolean).join("\n");
  const selectedText = writingResult?.[output] ?? "";
  const diff = useMemo(() => writingResult ? textDiff(writingResult.original, selectedText) : [], [writingResult, selectedText]);

  const reset = () => {
    setPhase("idle"); setCapture(null); setConsented(false); setBlocks([]); setWritingResult(null); setAnalysisResult(null);
    setSourcesOpen(false); setError(null); setNotice(null);
  };
  const selectArea = async () => {
    setPhase("selecting"); setError(null); setNotice(null); setWritingResult(null); setAnalysisResult(null);
    try { setCapture(await sendMessage<ScreenCaptureResult>({ type: "AI_SCREEN_SELECT" })); setConsented(false); setPhase("preview"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "화면 영역을 선택하지 못했습니다."); setPhase("idle"); }
  };
  const runOcr = async () => {
    if (!capture || !consented) return;
    setPhase("ocr"); setError(null);
    try { const result = await writingAssistantService.ocr(capture.imageDataUrl); setBlocks(result.blocks); setPhase("review"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "글자를 추출하지 못했습니다."); setPhase("preview"); }
  };
  const process = async () => {
    setPhase("processing"); setError(null); setNotice(null);
    try {
      if (task === "grammar-correction") {
        const result = await writingAssistantService.correct(ocrText, style);
        setWritingResult(result); setOutput(style === "proofread" ? "corrected" : "polished"); setPhase("writing-result");
      } else {
        setAnalysisResult(await writingAssistantService.analyze(blocks, task)); setSourcesOpen(false); setPhase("analysis-result");
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "AI 작업을 완료하지 못했습니다."); setPhase("review"); }
  };
  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); setNotice(`${label}을 클립보드에 복사했습니다.`); }
    catch { setError("클립보드에 복사하지 못했습니다. 내용을 직접 선택해 주세요."); }
  };
  const apply = async () => {
    if (!capture) return;
    setError(null); setNotice(null);
    try { await sendMessage({ type: "AI_APPLY_TEXT", tabId: capture.targetTabId, text: selectedText }); setNotice("원래 입력창에 교정문을 적용했습니다."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "입력창에 적용하지 못했습니다."); }
  };
  const jumpToSource = (id: string) => {
    setSourcesOpen(true);
    window.setTimeout(() => document.getElementById(`ocr-source-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  };
  const sourceButtons = (ids: string[]) => <span className="source-links">{ids.map((id) => <button key={id} type="button" onClick={() => jumpToSource(id)}>{id}</button>)}</span>;

  if (!screenEnabled) return <section className="writing-page"><header className="writing-page-header"><button className="button ghost" onClick={onClose}>뒤로</button></header><article className="card writing-locked"><span className="eyebrow">Premium</span><h1>화면 AI 도구</h1><p>선택한 화면 영역에서 문법 교정, 핵심 요약, 학습 정리를 제공합니다. Free 일정·집중·차단 기능은 그대로 사용할 수 있습니다.</p><p className="small muted">Settings에서 Premium 로그인과 화면 OCR 권한을 확인해 주세요.</p></article></section>;

  return <section className="writing-page">
    <header className="writing-page-header"><button className="button ghost" onClick={onClose}>뒤로</button><div><span className="eyebrow">Premium AI</span><h1>화면 AI 도구</h1></div></header>
    <div className="writing-privacy-note"><strong>사용자가 선택한 영역만 전송합니다.</strong><span>전체 페이지, hostname, query를 자동 첨부하지 않으며 이미지·OCR 원문·결과는 기본 저장하지 않습니다.</span></div>
    {error && <div className="alert error" role="alert">{error}</div>}{notice && <div className="alert" role="status">{notice}</div>}

    {(phase === "idle" || phase === "selecting") && <article className="card writing-start"><h2>1. 내용이 보이는 영역 선택</h2><p>일반 웹페이지에서 글, 표, 목록이 보이는 영역을 선택하세요. 큰 영역은 전송 한도에 맞게 자동 최적화됩니다. 비밀번호, 결제 정보, 주민번호처럼 민감한 내용은 선택하지 마세요.</p><button className="button" disabled={phase === "selecting"} onClick={() => void selectArea()}>{phase === "selecting" ? "선택을 기다리는 중…" : "화면 영역으로 내용 가져오기"}</button></article>}

    {(phase === "preview" || phase === "ocr") && capture && <article className="card writing-preview"><h2>2. 전송 이미지와 결과 방식 확인</h2><div className="accuracy-notice" role="note"><span aria-hidden="true">ⓘ</span><p>AI가 화면의 글자나 문맥을 잘못 인식할 수 있습니다. 민감한 정보가 포함되지 않았는지 확인해 주세요.</p></div><img src={capture.imageDataUrl} alt="OCR 서버로 전송할 선택 영역 미리보기" /><p className="small muted">{capture.width} × {capture.height}px · {(capture.byteSize / 1024).toFixed(0)}KB · 이 이미지는 처리 후 저장하지 않습니다.</p><div className="writing-task-grid" role="radiogroup" aria-label="결과 방식">{([
      ["grammar-correction", "문법·오탈자 교정", grammarEnabled], ["content-summary", "중요 내용 3~5개와 짧은 요약", summaryEnabled], ["study-organize", "개념·용어·기억할 내용 정리", summaryEnabled]
    ] as const).map(([value, description, available]) => <button type="button" role="radio" aria-checked={task === value} className={task === value ? "selected" : ""} disabled={!available || phase === "ocr"} key={value} onClick={() => setTask(value)}><strong>{TASK_LABELS[value]}</strong><span>{available ? description : "멤버십 다시 확인 필요"}</span></button>)}</div><label className="privacy-consent"><input type="checkbox" checked={consented} onChange={(event) => setConsented(event.target.checked)} /><span>민감 정보가 없는지 확인했으며, 선택 이미지를 OCR 처리 목적으로 전송하는 데 동의합니다.</span></label><div className="row"><button className="button" disabled={!consented || phase === "ocr" || (task === "grammar-correction" ? !grammarEnabled : !summaryEnabled)} onClick={() => void runOcr()}>{phase === "ocr" ? "글자·구조 추출 중…" : "동의하고 OCR 실행"}</button><button className="button ghost" disabled={phase === "ocr"} onClick={() => void selectArea()}>다시 선택</button></div></article>}

    {(phase === "review" || phase === "processing") && <article className="card writing-review"><h2>3. OCR 원문 block 검토</h2><p className="small muted">각 block의 잘못 인식된 글자를 고치되, 근거 ID는 유지됩니다. 표·수식·잘린 문장은 원문과 대조해 주세요.</p><div className="ocr-block-editor">{blocks.map((block, index) => <label key={block.id}><span><strong>{block.id}</strong> · {BLOCK_LABELS[block.type]}</span><textarea rows={Math.min(6, Math.max(2, block.text.split("\n").length + 1))} value={block.text} maxLength={20_000} onChange={(event) => setBlocks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item))} /></label>)}</div>{task === "grammar-correction" && <div className="writing-options"><label>교정 방식<select value={style} onChange={(event) => setStyle(event.target.value as WritingStyle)}><option value="proofread">맞춤법·문법만</option><option value="natural">자연스럽게 윤문</option><option value="concise">간결하게 윤문</option></select></label><span className="small muted">{ocrText.length.toLocaleString()} / 20,000자</span></div>}<button className="button" disabled={!ocrText || ocrText.length > 20_000 || phase === "processing"} onClick={() => void process()}>{phase === "processing" ? "AI가 원문 근거를 확인하는 중…" : `${TASK_LABELS[task]} 실행`}</button></article>}

    {phase === "writing-result" && writingResult && <div className="writing-results"><article className="card writing-result-card"><header className="writing-result-header"><h2>4. 교정 결과</h2><div className="writing-result-tabs"><button className={output === "corrected" ? "active" : ""} onClick={() => setOutput("corrected")}>최소 교정</button><button className={output === "polished" ? "active" : ""} onClick={() => setOutput("polished")}>윤문</button></div></header><div className="writing-output">{selectedText}</div><div className="writing-result-actions"><button className="button" onClick={() => void copy(selectedText, "교정문")}>복사</button><button className="button secondary" disabled={!capture?.canApply} onClick={() => void apply()}>원래 입력창에 적용</button><button className="button ghost" onClick={() => setPhase("review")}>다시 교정</button></div></article><article className="card"><h2>원문과 비교</h2><div className="writing-diff">{diff.map((part, index) => <span key={`${part.type}:${index}`} className={`diff-${part.type}`}>{part.value}</span>)}</div></article><article className="card"><h2>변경점 {writingResult.changes.length}개</h2>{writingResult.changes.length ? <ul className="writing-change-list">{writingResult.changes.map((change, index) => <li key={`${change.type}:${index}`}><span className="badge">{change.type}</span><div><strong>{change.before || "—"} → {change.after || "—"}</strong><p>{change.reason}</p></div></li>)}</ul> : <p className="muted">수정할 문법·표현을 찾지 못했습니다.</p>}</article></div>}

    {phase === "analysis-result" && analysisResult && <div className="writing-results analysis-results"><div className="accuracy-notice strong" role="note"><span aria-hidden="true">ⓘ</span><p><strong>AI 결과는 부정확하거나 중요한 맥락을 누락할 수 있습니다.</strong> 학습이나 업무에 사용하기 전에 반드시 원문과 대조하세요. 의료·법률·재무 판단의 단독 근거로 사용하지 마세요.</p></div><article className="card analysis-summary"><span className="eyebrow">{TASK_LABELS[analysisResult.mode]}</span><h2>{analysisResult.title}</h2><p>{analysisResult.summary}</p><button className="button" onClick={() => void copy(analysisText(analysisResult), TASK_LABELS[analysisResult.mode])}>전체 결과 복사</button></article><article className="card"><h2>핵심 내용 {analysisResult.keyPoints.length}개</h2><ol className="analysis-key-points">{analysisResult.keyPoints.map((item, index) => <li key={index}><div>{item.text}</div>{sourceButtons(item.sourceBlockIds)}</li>)}</ol></article>{analysisResult.sections.map((section, index) => <article className="card analysis-section" key={`${section.heading}:${index}`}><h2>{section.heading}</h2><p>{section.content}</p>{sourceButtons(section.sourceBlockIds)}</article>)}<article className={`card uncertain-card ${analysisResult.uncertainItems.length ? "warning" : ""}`}><h2>확인 필요</h2>{analysisResult.uncertainItems.length ? <ul>{analysisResult.uncertainItems.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>AI가 별도로 표시한 불확실한 항목은 없습니다. 그래도 원문 대조는 필요합니다.</p>}</article><details className="card ocr-source-details" open={sourcesOpen} onToggle={(event) => setSourcesOpen(event.currentTarget.open)}><summary>OCR 원문 block 보기</summary><div className="ocr-source-list">{blocks.map((block) => <article id={`ocr-source-${block.id}`} key={block.id}><header><strong>{block.id}</strong><span>{BLOCK_LABELS[block.type]}</span></header><p>{block.text}</p></article>)}</div></details><button className="button secondary" onClick={() => setPhase("review")}>원문을 수정해 다시 실행</button></div>}
    {phase !== "idle" && phase !== "selecting" && <div className="writing-reset-actions"><button className="button ghost" onClick={reset}>처음부터 다시 하기</button></div>}
  </section>;
}
