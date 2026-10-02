import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CashoutPanel } from "./cashout-panel";
import { confirmationFailureCopy, paymentFailureCopy } from "../membership/payment";
import { topupFailureCopy } from "./topup";

describe("payment launch wording and payout boundary", () => {
  it("does not offer cashout submission or claim historical records are transfers", () => {
    const html = renderToStaticMarkup(createElement(CashoutPanel, { initialBalances: { earnedAvailable: 7000, cashoutReserved: 1000, cashoutCompleted: 3000 } }));
    expect(html).toContain("현금화 서비스 준비 중");
    expect(html).toContain('disabled=""');
    expect(html).toContain("계좌 송금 완료를 의미하지 않습니다");
    expect(html).not.toContain("테스트");
    expect(html).not.toContain("환급 완료");
  });
  it("keeps cashout unavailable even when balances cannot be verified", () => {
    const html = renderToStaticMarkup(createElement(CashoutPanel, { initialBalances: null }));
    expect(html).toContain("현금화 서비스 준비 중");
    expect(html).toContain('disabled=""');
    expect(html).not.toContain("0 P");
  });
  it("keeps provider failures neutral and does not leak internal environment labels", () => {
    const copy = [paymentFailureCopy("REJECT_CARD_COMPANY"), topupFailureCopy("REJECT_CARD_COMPANY"), confirmationFailureCopy("topup", "payment_rejected"), confirmationFailureCopy("membership", "test_mode_required")];
    expect(copy.join(" ")).not.toMatch(/테스트|sandbox|test_mode/);
    expect(copy[0]).toContain("다른 결제수단");
  });
});
