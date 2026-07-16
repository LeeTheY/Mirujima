import { HELP_ARTICLES } from "./help-content";

export function HelpPage() {
  return <section className="help"><header className="page-heading"><h1 className="page-title">사용 방법</h1><p className="page-lead">필요한 항목을 열어 바로 확인하세요.</p></header><div className="help-sections"><article className="card">{HELP_ARTICLES.map((article) => <details key={article.title}><summary>{article.title}</summary><p className="muted">{article.body}</p></details>)}</article><article className="card"><h2>Chrome의 제약</h2><p className="muted">chrome:// 페이지, Chrome Web Store, 다른 브라우저와 Chrome 밖 앱은 확장 프로그램이 차단하거나 확인할 수 없습니다. 운영체제가 Chrome 알림을 막으면 시스템 알림도 표시되지 않습니다.</p></article></div></section>;
}
