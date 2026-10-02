import Link from "next/link";
export default function NotFound() { return <section className="card route-state"><h1>페이지를 찾을 수 없습니다.</h1><p>주소를 확인하거나 홈에서 다시 시작해 주세요.</p><Link className="button" href="/">홈으로</Link></section>; }
