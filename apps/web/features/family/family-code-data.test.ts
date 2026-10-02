import { describe, expect, it, vi } from "vitest";
import { cancelFamilyCode, estimatedFamilyServerTime, FamilyCodeError, familyCountdownLabel, familyCountdownSeconds, issueFamilyCode, redeemFamilyCode } from "./family-code-data";
const id="d1111111-1111-4111-8111-111111111111";
const student="d2222222-2222-4222-8222-222222222222";
const clock="2026-10-02T00:00:00Z";
const issued={id,status:"pending",code:"012345",codeExpiresAt:"2026-10-02T00:05:00Z",serverNow:clock};
const api=(data:unknown,error:unknown=null)=>({functions:{invoke:vi.fn().mockResolvedValue({data,error})}});
describe("family code gateway and deadlines",()=>{
 it("accepts leading zero codes and server deadline",async()=>{expect(await issueFamilyCode(api(issued))).toEqual({code:"012345",expiresAt:issued.codeExpiresAt,serverNow:clock});});
 it("rejects malformed or expired issuance replies",async()=>{
  for(const data of [{...issued,code:"abc123"},{...issued,id:"missing"},{...issued,codeExpiresAt:clock},{...issued,codeExpiresAt:"2026-10-02T00:06:00Z"}])await expect(issueFamilyCode(api(data))).rejects.toThrow("응답");
 });
 it("does not retry non-idempotent issuance after a lost response",async()=>{const client=api(null,{name:"FunctionsFetchError"});await expect(issueFamilyCode(client)).rejects.toThrow("네트워크");expect(client.functions.invoke).toHaveBeenCalledTimes(1);});
 it("validates cancellation rather than clearing on unknown result",async()=>{await expect(cancelFamilyCode(api({status:"revoked",cancelledCount:1}))).resolves.toBeUndefined();await expect(cancelFamilyCode(api({status:"active"}))).rejects.toThrow("응답");});
 it("requires successful redemption for the authenticated student",async()=>{
  const active={id,status:"active",studentUserId:student,guardianUserId:id,linkedAt:clock};
  await expect(redeemFamilyCode("012345",student,api(active))).resolves.toBeUndefined();
  await expect(redeemFamilyCode("012345",id,api(active))).rejects.toThrow("응답");
  await expect(redeemFamilyCode("012345",student,api({...active,status:"locked"}))).rejects.toThrow("응답");
 });
 it("reads trusted lock and attempts metadata without consuming the original error twice",async()=>{
  const error={context:new Response(JSON.stringify({error:"redeem_locked",lockedUntil:"2026-10-02T00:10:00Z",serverNow:clock,attemptsRemaining:0}))};
  try{await redeemFamilyCode("012345",student,api(null,error));throw new Error("expected failure");}catch(cause){expect(cause).toBeInstanceOf(FamilyCodeError);expect((cause as FamilyCodeError).details?.lockedUntil).toBe("2026-10-02T00:10:00Z");}
 });
 it("uses monotonic elapsed time and handles invalid deadlines safely",()=>{
  const now=Date.parse(clock);expect(estimatedFamilyServerTime(now,1000,4000)).toBe(now+3000);
  expect(familyCountdownSeconds(issued.codeExpiresAt,now+3000)).toBe(297);
  expect(familyCountdownLabel(297)).toBe("04:57");expect(familyCountdownSeconds("invalid",now)).toBe(0);
  expect(familyCountdownSeconds(issued.codeExpiresAt,now+300001)).toBe(0);
 });
});
